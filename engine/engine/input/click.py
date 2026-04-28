"""Zwift Click BLE shifter — runs as a sibling asyncio.Task alongside KeyboardShifter.

Hardware-confirmed constants from docs/click-ble-spike.md:
  - Firmware 1.1.0 REQUIRES ECDH (b'RideOn' alone produces no 0x37 frames)
  - Service UUID: 00000001-19ca-4651-86e5-fa29dcdd09d1 (long-form confirmed)
  - ASYNC char (NOTIFY): 00000002-19ca-4651-86e5-fa29dcdd09d1
  - SYNC_RX char (WRITE): 00000003-19ca-4651-86e5-fa29dcdd09d1
  - Heartbeat frame to ignore: 23 08 ff ff ff ff 0f (first byte 0x23)

BLE callback pitfall: on_notify MUST be plain def, never async def.
Gear state pitfall: both keyboard and Click run on the same asyncio loop — no
  run_in_executor for notify callbacks.
Single-owner rule: ClickShifter owns its own BleakClient; it never imports or
  shares the KICKR's BleakClient.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable

from bleak import BleakClient, BleakError, BleakScanner

from engine.gears.engine import GearEngine

if TYPE_CHECKING:
    from bleak.backends.device import BLEDevice

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardware-confirmed constants (docs/click-ble-spike.md)
# ---------------------------------------------------------------------------

ZWIFT_CUSTOM_SERVICE_UUID = "00000001-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_ASYNC_CHAR_UUID     = "00000002-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_SYNC_RX_CHAR_UUID   = "00000003-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_MANUFACTURER_ID     = 0x094A
CLICK_DEVICE_TYPE_BYTE    = 0x09
CLICK_NOTIFY_MSG_TYPE     = 0x37      # decimal 55 — button event message type
PLUS_FIELD_TAG            = 0x08      # protobuf tag for field 1 (key '1' = plus)
MINUS_FIELD_TAG           = 0x10      # protobuf tag for field 2 (key '2' = minus)
BUTTON_VALUE_PRESSED      = 0x00
BUTTON_VALUE_RELEASED     = 0x01
RIDE_ON                   = b"RideOn"
REQUEST_START             = bytes([1, 2])  # ECDH handshake prefix after RIDE_ON
HANDSHAKE_TIMEOUT_S       = 5.0           # seconds to wait for Click's key response
DEFAULT_SCAN_TIMEOUT_S    = 30.0
DEFAULT_RETRY_BACKOFF_S   = 2.0


# ---------------------------------------------------------------------------
# ClickShifter
# ---------------------------------------------------------------------------

class ClickShifter:
    """Decodes Zwift Click BLE notify frames and calls GearEngine.shift_up/down.

    Usage::

        sh = ClickShifter(gear_engine)
        await sh.connect_and_listen(stop_event=stop_event)

    Or via the top-level helper::

        await run_click_shifter(gear_engine, stop_event)
    """

    _DEBOUNCE_S: float = 0.10

    def __init__(
        self,
        gear_engine: GearEngine,
        *,
        clock: Callable[[], float] = time.monotonic,
        on_state_change: Callable[[bool], None] | None = None,
    ) -> None:
        self._gears = gear_engine
        self._clock = clock
        self._last_shift_t: float = float("-inf")
        self._on_state_change = on_state_change
        self._aes_key: bytes | None = None
        self._iv_prefix: bytes | None = None

    # ------------------------------------------------------------------
    # Connection-state callback helper
    # ------------------------------------------------------------------

    def _emit_state(self, connected: bool) -> None:
        """Fire the on_state_change callback safely — never raises out of connect_and_listen."""
        if self._on_state_change is None:
            return
        try:
            self._on_state_change(connected)
        except Exception as e:
            _log.warning("Click on_state_change callback raised: %s", e)

    # ------------------------------------------------------------------
    # Notify callback — MUST be plain def (Pitfall 4)
    # ------------------------------------------------------------------

    def _decrypt_frame(self, data: bytes) -> bytes | None:
        """AES-CCM decrypt an encrypted notify frame. Returns plaintext or None on failure.

        Frame format: [counter: 4 bytes][ciphertext][tag: 4 bytes]
        Nonce: iv_prefix (4 bytes) || counter (4 bytes) = 8 bytes total.
        """
        if len(data) < 9:  # 4 counter + ≥1 payload + 4 tag
            return None
        from cryptography.hazmat.primitives.ciphers.aead import AESCCM
        counter = data[:4]
        ciphertext_and_tag = data[4:]
        nonce = self._iv_prefix + counter
        try:
            return AESCCM(self._aes_key, tag_length=4).decrypt(nonce, ciphertext_and_tag, None)
        except Exception:
            return None

    def on_notify(self, sender, data: bytes | bytearray) -> None:
        """Decode a BLE notification frame and dispatch a shift if appropriate.

        Silently ignores:
        - Empty frames
        - Frames whose first byte is not CLICK_NOTIFY_MSG_TYPE (0x37)
        - Release events (value = 1)
        - Rapid repeated presses within the debounce window
        """
        if not data:
            return
        data = bytes(data)

        if self._aes_key is not None:
            data = self._decrypt_frame(data) or b""
            if not data:
                return

        if data[0] != CLICK_NOTIFY_MSG_TYPE:
            return  # idle, battery, heartbeat frame

        # Walk the payload as sequential (tag, value) byte pairs.
        # Click frames are short (3–5 bytes); varint multibyte values are not
        # used for the press/release state field (value is always 0 or 1).
        payload = bytes(data[1:])
        i = 0
        while i + 1 < len(payload):
            tag = payload[i]
            val = payload[i + 1]
            i += 2

            if val != BUTTON_VALUE_PRESSED:
                continue  # release event — never shift on release

            # Pressed event. Apply debounce then dispatch.
            now = self._clock()
            if (now - self._last_shift_t) < self._DEBOUNCE_S:
                continue  # within debounce window — ignore

            self._last_shift_t = now
            if tag == PLUS_FIELD_TAG:
                self._gears.shift_up()
            elif tag == MINUS_FIELD_TAG:
                self._gears.shift_down()

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect_and_listen(
        self,
        *,
        scanner: Callable | None = None,
        connect: Callable | None = None,
        stop_event: asyncio.Event,
        retry_backoff: float = DEFAULT_RETRY_BACKOFF_S,
    ) -> None:
        """Scan for the Zwift Click, connect, subscribe to notifications, and loop.

        Retries with *retry_backoff* seconds between attempts on scan failure or
        BLE error. Returns cleanly when *stop_event* is set.

        *scanner* and *connect* are dependency-injection points for testing.
        Production code uses the defaults (_default_scanner / BleakClient).
        """
        _scanner = scanner if scanner is not None else self._default_scanner
        _connect = connect if connect is not None else self._default_connect

        while not stop_event.is_set():
            try:
                device = await _scanner(timeout=DEFAULT_SCAN_TIMEOUT_S)
                if device is None:
                    _log.warning(
                        "Zwift Click not found; retrying in %.1fs", retry_backoff
                    )
                    try:
                        await asyncio.wait_for(
                            stop_event.wait(), timeout=retry_backoff
                        )
                    except asyncio.TimeoutError:
                        pass
                    continue

                async with _connect(device) as client:
                    try:
                        await self._handshake_encrypted(client)
                        await client.start_notify(ZWIFT_ASYNC_CHAR_UUID, self.on_notify)
                        self._emit_state(True)
                        _log.info("Zwift Click connected and notifying")
                        await stop_event.wait()
                        try:
                            await client.stop_notify(ZWIFT_ASYNC_CHAR_UUID)
                        except Exception:
                            pass  # ignore cleanup errors on shutdown
                    finally:
                        self._emit_state(False)

            except asyncio.TimeoutError:
                # stop_event.wait() timed out — retry, not exit
                continue
            except BleakError as exc:
                _log.warning(
                    "Click BLE error: %s — retrying in %.1fs", exc, retry_backoff
                )
                self._emit_state(False)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=retry_backoff)
                except asyncio.TimeoutError:
                    pass
            except Exception as exc:
                _log.warning(
                    "Click unexpected error: %s — retrying in %.1fs", exc, retry_backoff
                )
                self._emit_state(False)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=retry_backoff)
                except asyncio.TimeoutError:
                    pass

    # ------------------------------------------------------------------
    # ECDH encrypted handshake (firmware 1.1.0 mandatory)
    # ------------------------------------------------------------------

    async def _handshake_encrypted(self, client: "BleakClient") -> None:
        """Perform the full ECDH key exchange required by firmware >= 1.1.0.

        Protocol (source: ajchellew/zwiftplay + makinolo.com + jat255/zwift_click_handling):
          1. Generate ephemeral SECP256R1 key pair.
          2. Write RIDE_ON + REQUEST_START + our uncompressed pub (raw x||y) to SYNC_RX.
          3. Click responds on ASYNC with RIDE_ON + \x01\x03 + device pub (64 raw bytes).
          4. Derive shared secret via ECDH; apply HKDF-SHA256(length=36,
             salt=device_pub_full || our_pub_full, info=b'handshake data').
          5. Split: first 32 bytes → AES-CCM key; last 4 bytes → IV prefix for nonces.
        """
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric.ec import (
            ECDH, SECP256R1, EllipticCurvePublicKey, generate_private_key,
        )
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF

        private_key = generate_private_key(SECP256R1())
        pub_bytes = private_key.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        # Strip leading 0x04 uncompressed-point marker — Click expects raw x||y (64 bytes).
        payload = RIDE_ON + REQUEST_START + pub_bytes[1:]

        key_received = asyncio.Event()
        dev_pub_raw: list[bytes] = []

        def _key_handler(sender, data: bytes | bytearray) -> None:
            data = bytes(data)
            # Device response: 'RideOn' prefix + 2 control bytes + 64 raw key bytes = 72 total
            if data[:6] == RIDE_ON and len(data) >= 72 and not key_received.is_set():
                dev_pub_raw.append(data[8:72])
                key_received.set()

        await client.start_notify(ZWIFT_ASYNC_CHAR_UUID, _key_handler)
        try:
            await client.write_gatt_char(ZWIFT_SYNC_RX_CHAR_UUID, payload, response=False)
            try:
                await asyncio.wait_for(key_received.wait(), timeout=HANDSHAKE_TIMEOUT_S)
            except asyncio.TimeoutError:
                raise BleakError("ECDH handshake timeout: Zwift Click did not respond")
        finally:
            await client.stop_notify(ZWIFT_ASYNC_CHAR_UUID)

        dev_pub_bytes = b'\x04' + dev_pub_raw[0]   # restore uncompressed-point prefix
        dev_pub_key = EllipticCurvePublicKey.from_encoded_point(SECP256R1(), dev_pub_bytes)
        shared_secret = private_key.exchange(ECDH(), dev_pub_key)

        # salt = device_pub (65 bytes) || our_pub (65 bytes), per ajchellew/zwiftplay
        key_material = HKDF(
            algorithm=hashes.SHA256(),
            length=36,
            salt=dev_pub_bytes + pub_bytes,
            info=b'handshake data',
        ).derive(shared_secret)

        self._aes_key = key_material[:32]
        self._iv_prefix = key_material[32:]
        _log.debug("ECDH session key derived")

    # ------------------------------------------------------------------
    # Default scanner / connector (production paths)
    # ------------------------------------------------------------------

    @staticmethod
    async def _default_scanner(*, timeout: float) -> "BLEDevice | None":
        from bleak.backends.device import BLEDevice
        from bleak.backends.scanner import AdvertisementData

        def _is_click(device: BLEDevice, adv: AdvertisementData) -> bool:
            mfr = adv.manufacturer_data.get(ZWIFT_MANUFACTURER_ID)
            if mfr and len(mfr) >= 1 and mfr[0] == CLICK_DEVICE_TYPE_BYTE:
                return True
            return ZWIFT_CUSTOM_SERVICE_UUID.lower() in [
                u.lower() for u in (adv.service_uuids or [])
            ]

        return await BleakScanner.find_device_by_filter(_is_click, timeout=timeout)

    @staticmethod
    def _default_connect(device: "BLEDevice") -> BleakClient:
        """Return a BleakClient as an async context manager."""
        return BleakClient(device)


# ---------------------------------------------------------------------------
# Top-level coroutine — entry point for main.py
# ---------------------------------------------------------------------------

async def run_click_shifter(
    gear_engine: GearEngine,
    stop_event: asyncio.Event,
    *,
    on_state_change: Callable[[bool], None] | None = None,
) -> None:
    """Scan for the Zwift Click, connect, and dispatch shifts until stop_event.

    Intended usage in main.py::

        from engine.input.click import run_click_shifter
        click_task = asyncio.create_task(
            run_click_shifter(gear_engine, stop_event, on_state_change=callback),
            name="click_shifter",
        )

    The Click's BleakClient is owned entirely by ClickShifter — it is completely
    separate from the KICKR's BleakClient (single-owner rule).
    """
    await ClickShifter(gear_engine, on_state_change=on_state_change).connect_and_listen(stop_event=stop_event)
