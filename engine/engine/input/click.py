"""Zwift Click BLE shifter — runs as a sibling asyncio.Task alongside KeyboardShifter.

Hardware-confirmed constants:
  - ASYNC char (NOTIFY):    00000002-19ca-4651-86e5-fa29dcdd09d1
  - SYNC_RX char (WRITE):   00000003-19ca-4651-86e5-fa29dcdd09d1
  - SYNC_TX char (INDICATE): 00000004-19ca-4651-86e5-fa29dcdd09d1  (v1 only)
  - v1 device type byte: 0x09, v2 device type byte: 0x0B
  - v2 advertises short service UUID FC82

V2 protocol: unencrypted, no ECDH. Activation = three writes to SYNC_RX.
Button events arrive as 7-byte bitmask frames on ASYNC (see V2_BUTTON_HEADER).

V1 protocol: RideOn ECDH handshake + AES-CCM encrypted 0x37 frames.

BLE callback pitfall: on_notify MUST be plain def, never async def.
Single-owner rule: ClickShifter owns its BleakClient; never shares the KICKR's client.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, Callable

from bleak import BleakClient, BleakError, BleakScanner

from engine.gears.engine import GearEngine

if TYPE_CHECKING:
    from bleak.backends.device import BLEDevice

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

ZWIFT_CUSTOM_SERVICE_UUID  = "00000001-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_ASYNC_CHAR_UUID      = "00000002-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_SYNC_RX_CHAR_UUID    = "00000003-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_SYNC_TX_CHAR_UUID    = "00000004-19ca-4651-86e5-fa29dcdd09d1"  # v1 only
ZWIFT_MANUFACTURER_ID      = 0x094A
CLICK_DEVICE_TYPE_BYTES    = {0x09, 0x0B}
ZWIFT_FC82_SERVICE_UUID    = "0000fc82-0000-1000-8000-00805f9b34fb"

# V1 protocol constants (ECDH + AES-CCM encrypted 0x37 frames)
RIDE_ON                    = b"RideOn"
CLICK_NOTIFY_MSG_TYPE      = 0x37
PLUS_FIELD_TAG             = 0x08
MINUS_FIELD_TAG            = 0x10
BUTTON_VALUE_PRESSED       = 0x00
BUTTON_VALUE_RELEASED      = 0x01

# V2 protocol constants (unencrypted bitmask mode)
# Activation sequence (three writes to SYNC_RX):
V2_ACTIVATE_WRITE          = b"RideOn\x02\x03"          # 8-byte activation password
V2_CONFIG_1                = bytes([0x00, 0x08, 0x00])  # enable button reporting
V2_CONFIG_2                = bytes([0x00, 0x08, 0x10])  # keepalive / maintain mode

# V2 button bitmask frame: [0x23][0x08][byte2][byte3][byte4][byte5][byte6]
# byte[3] carries plus/minus state; 0 bit = button pressed, 1 bit = not pressed.
V2_BUTTON_HEADER           = bytes([0x23, 0x08])
V2_PLUS_BIT                = 0x20   # bit 5 of byte[3]: 0 → plus pressed
V2_MINUS_BIT               = 0x02   # bit 1 of byte[3]: 0 → minus pressed

V2_KEEPALIVE_INTERVAL_S    = 5.0
DEFAULT_SCAN_TIMEOUT_S     = 30.0
DEFAULT_RETRY_BACKOFF_S    = 2.0


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
        diagnostics: Any | None = None,
    ) -> None:
        self._gears = gear_engine
        self._clock = clock
        self._last_shift_t: float = float("-inf")
        self._on_state_change = on_state_change
        self._diagnostics = diagnostics
        # V1 ECDH state (set only when connected to a v1 Click)
        self._aes_key: bytes | None = None
        self._iv_prefix: bytes | None = None

    # ------------------------------------------------------------------
    # Connection-state callback helper
    # ------------------------------------------------------------------

    def _emit_state(self, connected: bool) -> None:
        if self._on_state_change is None:
            return
        try:
            self._on_state_change(connected)
        except Exception as e:
            _log.warning("Click on_state_change callback raised: %s", e)

    # ------------------------------------------------------------------
    # Notify callback — MUST be plain def (BLE callback pitfall)
    # ------------------------------------------------------------------

    def on_notify(self, sender, data: bytes | bytearray) -> None:
        """Decode a BLE notification frame and dispatch a shift if appropriate."""
        if not data:
            return
        data = bytes(data)

        # V2 bitmask format: 7-byte frame [0x23][0x08][b2][b3][b4][b5][b6]
        # byte[3] bit-5 = plus, bit-1 = minus (0 = pressed)
        if len(data) == 7 and data[:2] == V2_BUTTON_HEADER:
            b3 = data[3]
            plus_pressed  = (b3 & V2_PLUS_BIT)  == 0
            minus_pressed = (b3 & V2_MINUS_BIT) == 0
            if not plus_pressed and not minus_pressed:
                return  # idle frame or unhandled button (left/up/right/down)
            now = self._clock()
            if (now - self._last_shift_t) < self._DEBOUNCE_S:
                return
            self._last_shift_t = now
            if plus_pressed:
                self._gears.shift_up()
            else:
                self._gears.shift_down()
            return

        # V1 encrypted path
        if self._aes_key is not None:
            data = self._decrypt_v1_frame(data) or b""
            if not data:
                return

        if data[0] != CLICK_NOTIFY_MSG_TYPE:
            return  # idle, battery, or other non-button frame

        # Walk v1 payload as sequential (tag, value) byte pairs
        payload = bytes(data[1:])
        i = 0
        while i + 1 < len(payload):
            tag = payload[i]
            val = payload[i + 1]
            i += 2

            if val != BUTTON_VALUE_PRESSED:
                continue  # release event

            now = self._clock()
            if (now - self._last_shift_t) < self._DEBOUNCE_S:
                continue

            self._last_shift_t = now
            if tag == PLUS_FIELD_TAG:
                self._gears.shift_up()
            elif tag == MINUS_FIELD_TAG:
                self._gears.shift_down()

    def _decrypt_v1_frame(self, data: bytes) -> bytes | None:
        """AES-CCM decrypt a v1 encrypted frame: [counter:4][ciphertext][tag:4]."""
        if len(data) < 9:
            return None
        if self._iv_prefix is None or self._aes_key is None:
            return None
        from cryptography.hazmat.primitives.ciphers.aead import AESCCM
        counter = data[:4]
        nonce = self._iv_prefix + counter
        try:
            return AESCCM(self._aes_key, tag_length=4).decrypt(nonce, data[4:], None)
        except Exception:
            return None

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

        Retries with *retry_backoff* seconds between attempts. Returns cleanly
        when *stop_event* is set.
        """
        _scanner = scanner if scanner is not None else self._default_scanner
        _connect = connect if connect is not None else self._default_connect

        while not stop_event.is_set():
            try:
                self._diag_increment("click_scan_attempts")
                device = await _scanner(timeout=DEFAULT_SCAN_TIMEOUT_S)
                if device is None:
                    self._diag_increment("click_scan_misses")
                    _log.warning(
                        "Zwift Click not found; retrying in %.1fs", retry_backoff
                    )
                    try:
                        await asyncio.wait_for(stop_event.wait(), timeout=retry_backoff)
                    except asyncio.TimeoutError:
                        pass
                    continue

                self._diag_increment("click_scan_hits")
                self._diag_increment("click_connect_attempts")
                async with _connect(device) as client:
                    try:
                        await self._activate(client)
                        await client.start_notify(ZWIFT_ASYNC_CHAR_UUID, self.on_notify)
                        self._diag_set("click_connected", True)
                        self._emit_state(True)
                        _log.info("Zwift Click connected and notifying")

                        # Keepalive: send V2_CONFIG_2 every 5 s to maintain button reporting
                        while not stop_event.is_set():
                            try:
                                await asyncio.wait_for(
                                    stop_event.wait(), timeout=V2_KEEPALIVE_INTERVAL_S
                                )
                            except asyncio.TimeoutError:
                                await self._write_click_char(
                                    client,
                                    ZWIFT_SYNC_RX_CHAR_UUID,
                                    V2_CONFIG_2,
                                    response=False,
                                    counter="click_keepalive_writes",
                                )
                        try:
                            await client.stop_notify(ZWIFT_ASYNC_CHAR_UUID)
                        except Exception:
                            pass
                    finally:
                        self._diag_set("click_connected", False)
                        self._emit_state(False)

            except asyncio.TimeoutError:
                self._diag_increment("click_scan_timeouts")
                continue
            except BleakError as exc:
                self._diag_increment("ble_errors")
                self._diag_increment("click_errors")
                self._diag_set("click_last_error", str(exc))
                _log.warning(
                    "Click BLE error: %s — retrying in %.1fs", exc, retry_backoff
                )
                self._diag_set("click_connected", False)
                self._emit_state(False)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=retry_backoff)
                except asyncio.TimeoutError:
                    pass
            except Exception as exc:
                self._diag_increment("click_unexpected_errors")
                self._diag_set("click_last_error", str(exc))
                _log.warning(
                    "Click unexpected error: %s — retrying in %.1fs", exc, retry_backoff
                )
                self._diag_set("click_connected", False)
                self._emit_state(False)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=retry_backoff)
                except asyncio.TimeoutError:
                    pass

    # ------------------------------------------------------------------
    # Activation — v2 unencrypted (3 writes) or v1 ECDH
    # ------------------------------------------------------------------

    async def _activate(self, client: "BleakClient") -> None:
        """Activate the Zwift Click.

        V2 (type 0x0B): writes RideOn\\x02\\x03 + two config bytes → unencrypted
        bitmask mode. Device will emit 7-byte 0x23 0x08 button frames on ASYNC.

        V1 (type 0x09): if the device responds to the activation write with a
        RideOn + [0x01, 0x03] key frame, completes the ECDH handshake.
        """
        self._aes_key = None
        self._iv_prefix = None

        key_received = asyncio.Event()
        v1_dev_pub: list[bytes] = []

        def _handshake_listener(sender, data: bytes | bytearray) -> None:
            data = bytes(data)
            # V1 key response: RideOn + [0x01, 0x03] + 64-byte raw x||y
            if (
                data[:6] == RIDE_ON
                and data[6:8] == b'\x01\x03'
                and len(data) >= 72
                and not key_received.is_set()
            ):
                candidate = bytes(data[8:72])
                if candidate.count(0) <= 48:
                    v1_dev_pub.append(candidate)
                    key_received.set()

        # Subscribe ASYNC briefly to detect a v1 key response
        await client.start_notify(ZWIFT_ASYNC_CHAR_UUID, _handshake_listener)
        try:
            await self._write_click_char(
                client,
                ZWIFT_SYNC_RX_CHAR_UUID,
                V2_ACTIVATE_WRITE,
                response=False,
                counter="click_activation_writes",
            )
            try:
                await asyncio.wait_for(key_received.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass  # v2 device: no key response expected
        finally:
            await client.stop_notify(ZWIFT_ASYNC_CHAR_UUID)

        if v1_dev_pub:
            await self._complete_v1_ecdh(client, v1_dev_pub[0])
        else:
            # V2: send the two config writes that enable button reporting
            await asyncio.sleep(0.05)
            await self._write_click_char(
                client,
                ZWIFT_SYNC_RX_CHAR_UUID,
                V2_CONFIG_1,
                response=False,
                counter="click_activation_writes",
            )
            await asyncio.sleep(0.1)
            await self._write_click_char(
                client,
                ZWIFT_SYNC_RX_CHAR_UUID,
                V2_CONFIG_2,
                response=False,
                counter="click_activation_writes",
            )
            _log.info("Zwift Click v2 activated (unencrypted mode)")

    async def _complete_v1_ecdh(self, client: "BleakClient", dev_pub_raw64: bytes) -> None:
        """Derive AES-CCM key from v1 ECDH key exchange."""
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric.ec import (
            ECDH,
            SECP256R1,
            EllipticCurvePublicKey,
            generate_private_key,
        )
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF

        private_key = generate_private_key(SECP256R1())
        pub_bytes = private_key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint,
        )
        await self._write_click_char(
            client,
            ZWIFT_SYNC_RX_CHAR_UUID,
            RIDE_ON + bytes([1, 2]) + pub_bytes[1:],
            response=False,
            counter="click_activation_writes",
        )

        dev_pub_key = EllipticCurvePublicKey.from_encoded_point(
            SECP256R1(), b'\x04' + dev_pub_raw64
        )
        dev_pub_bytes = dev_pub_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        shared_secret = private_key.exchange(ECDH(), dev_pub_key)
        key_material = HKDF(
            algorithm=hashes.SHA256(),
            length=36,
            salt=dev_pub_bytes[1:] + pub_bytes[1:],
            info=b'',
        ).derive(shared_secret)
        self._aes_key = key_material[:32]
        self._iv_prefix = key_material[32:]
        _log.info("Zwift Click v1 ECDH key exchange complete")

    async def _write_click_char(
        self,
        client: "BleakClient",
        uuid: str,
        data: bytes,
        *,
        response: bool,
        counter: str,
    ) -> None:
        self._diag_increment("click_writes")
        self._diag_increment(counter)
        try:
            await client.write_gatt_char(uuid, data, response=response)
        except Exception as exc:
            self._diag_increment("ble_errors")
            self._diag_increment("click_write_errors")
            self._diag_set("click_last_error", str(exc))
            raise

    def _diag_increment(self, name: str, amount: int = 1) -> None:
        if self._diagnostics is not None:
            self._diagnostics.increment(name, amount)

    def _diag_set(self, name: str, value: Any) -> None:
        if self._diagnostics is not None:
            self._diagnostics.set_gauge(name, value)

    # ------------------------------------------------------------------
    # Default scanner / connector (production paths)
    # ------------------------------------------------------------------

    @staticmethod
    async def _default_scanner(*, timeout: float) -> "BLEDevice | None":
        from bleak.backends.scanner import AdvertisementData

        def _is_click(device: BLEDevice, adv: AdvertisementData) -> bool:
            mfr = adv.manufacturer_data.get(ZWIFT_MANUFACTURER_ID)
            if mfr and len(mfr) >= 1 and mfr[0] in CLICK_DEVICE_TYPE_BYTES:
                return True
            uuids = [u.lower() for u in (adv.service_uuids or [])]
            return (
                ZWIFT_CUSTOM_SERVICE_UUID.lower() in uuids
                or ZWIFT_FC82_SERVICE_UUID.lower() in uuids
            )

        return await BleakScanner.find_device_by_filter(_is_click, timeout=timeout)

    @staticmethod
    def _default_connect(device: "BLEDevice") -> BleakClient:
        return BleakClient(device)


# ---------------------------------------------------------------------------
# Top-level coroutine — entry point for main.py
# ---------------------------------------------------------------------------

async def run_click_shifter(
    gear_engine: GearEngine,
    stop_event: asyncio.Event,
    *,
    on_state_change: Callable[[bool], None] | None = None,
    diagnostics: Any | None = None,
) -> None:
    """Scan for the Zwift Click, connect, and dispatch shifts until stop_event."""
    await ClickShifter(
        gear_engine, on_state_change=on_state_change, diagnostics=diagnostics
    ).connect_and_listen(stop_event=stop_event)
