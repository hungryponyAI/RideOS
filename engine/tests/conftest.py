"""Shared fixtures for RideOS engine tests.

IBD = FTMS Indoor Bike Data characteristic (0x2AD2) byte payloads.
Flag semantics (uint16 LE at offset 0):
  bit 0 (0x0001): More Data — INVERTED for IBD. Speed present when bit CLEAR.
  bit 2 (0x0004): Instantaneous Cadence present
  bit 6 (0x0040): Instantaneous Power present
Field encodings (little-endian):
  Speed:   uint16, units 0.01 km/h
  Cadence: uint16, units 0.5 rpm
  Power:   int16 SIGNED, units 1 W
"""
import struct

import pytest


def _pack_flags(flags: int) -> bytes:
    return struct.pack("<H", flags)


@pytest.fixture
def ibd_speed_only() -> bytes:
    """flags=0x0000 (bit 0 CLEAR → speed present). speed=12.34 km/h."""
    return _pack_flags(0x0000) + struct.pack("<H", 1234)


@pytest.fixture
def ibd_speed_cadence_power() -> bytes:
    """flags bits 0=clear, 2=set, 6=set. speed=25.00, cadence=90.0, power=250."""
    flags = 0x0044  # bit 2 | bit 6; bit 0 CLEAR means speed is present
    return (
        _pack_flags(flags)
        + struct.pack("<H", 2500)   # speed raw
        + struct.pack("<H", 180)    # cadence raw = 90.0 rpm
        + struct.pack("<h", 250)    # power raw (signed)
    )


@pytest.fixture
def ibd_no_speed() -> bytes:
    """flags=0x0001 (bit 0 SET → speed ABSENT). Payload is flags-only."""
    return _pack_flags(0x0001)


@pytest.fixture
def ibd_power_negative() -> bytes:
    """flags=0x0040 (bit 0 CLEAR → speed; bit 6 SET → power). power=-50."""
    flags = 0x0040
    return (
        _pack_flags(flags)
        + struct.pack("<H", 0)      # speed raw = 0.00 km/h
        + struct.pack("<h", -50)    # power raw = -50 W (signed)
    )


@pytest.fixture
def ibd_cadence_only_scaling() -> bytes:
    """flags bits 0=set (no speed), 2=set (cadence). cadence raw=241 → 120.5 rpm."""
    flags = 0x0001 | 0x0004
    return _pack_flags(flags) + struct.pack("<H", 241)


# ------------------------------------------------------------------
# Phase 2: FMCP (FTMS Control Point) fixtures
# ------------------------------------------------------------------
import asyncio
from typing import Callable, List, Optional, Tuple


@pytest.fixture
def fmcp_success_request_control() -> bytes:
    # 0x80 RESPONSE, 0x00 REQUEST_CONTROL, 0x01 SUCCESS
    return b"\x80\x00\x01"


@pytest.fixture
def fmcp_success_start() -> bytes:
    # 0x80 RESPONSE, 0x07 START_OR_RESUME, 0x01 SUCCESS
    return b"\x80\x07\x01"


@pytest.fixture
def fmcp_success_sim_params() -> bytes:
    # 0x80 RESPONSE, 0x11 SET_INDOOR_BIKE_SIMULATION_PARAMETERS, 0x01 SUCCESS
    return b"\x80\x11\x01"


@pytest.fixture
def fmcp_success_stop() -> bytes:
    return b"\x80\x08\x01"


@pytest.fixture
def fmcp_success_reset() -> bytes:
    return b"\x80\x01\x01"


@pytest.fixture
def fmcp_not_permitted_request_control() -> bytes:
    # 0x80 RESPONSE, 0x00 REQUEST_CONTROL, 0x05 CONTROL_NOT_PERMITTED
    return b"\x80\x00\x05"


class FakeBleakClient:
    """Minimal stand-in for BleakClient covering the write-with-indicate path.

    The real bleak client delivers notifications via a (characteristic, data)
    callback. We record every write and — if a response was queued via
    queue_indication — schedule the notify callback to fire on the next
    event-loop turn, mirroring a real indication arriving as the ATT
    write-with-response completes.
    """

    def __init__(self, *, auto_success_for: Optional[Tuple[int, ...]] = None) -> None:
        # writes: list of (uuid, bytes(payload), response_kwarg)
        self.writes: List[Tuple[str, bytes, bool]] = []
        self._notify_cbs: dict = {}
        self._pending_responses: List[bytes] = []
        self.connected = True
        # If set, any write whose payload[0] opcode is in this tuple auto-replies
        # with b'\x80 <opcode> \x01' (SUCCESS) — convenience for handshake tests.
        self._auto_success_for = auto_success_for or ()

    async def start_notify(self, uuid: str, cb) -> None:
        self._notify_cbs[uuid] = cb

    async def stop_notify(self, uuid: str) -> None:
        self._notify_cbs.pop(uuid, None)

    async def write_gatt_char(self, uuid: str, data, *, response: bool = False) -> None:
        payload = bytes(data)
        self.writes.append((uuid, payload, response))
        # Auto-respond path
        if payload and payload[0] in self._auto_success_for:
            self._schedule_indication(uuid, bytes([0x80, payload[0], 0x01]))
            return
        # Scripted response path
        if self._pending_responses:
            data_out = self._pending_responses.pop(0)
            self._schedule_indication(uuid, data_out)

    def queue_indication(self, data: bytes) -> None:
        """Queue one indication to be fired on the next write."""
        self._pending_responses.append(bytes(data))

    def fire_indication(self, uuid: str, data: bytes) -> None:
        cb = self._notify_cbs.get(uuid)
        if cb is None:
            raise RuntimeError(f"No notify callback registered for {uuid}")
        # Match real bleak: callback receives (characteristic, bytearray).
        cb(None, bytearray(data))

    def _schedule_indication(self, uuid: str, data: bytes) -> None:
        loop = asyncio.get_event_loop()
        loop.call_soon(self.fire_indication, uuid, data)

    async def disconnect(self) -> None:
        self.connected = False


@pytest.fixture
def fake_bleak_client_factory() -> Callable[..., FakeBleakClient]:
    def _make(**kwargs) -> FakeBleakClient:
        return FakeBleakClient(**kwargs)
    return _make
