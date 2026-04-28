"""Unit tests for ClickShifter — all RED until Task 2 creates the implementation.

Mirrors the style of test_keyboard.py: injectable clock, fake BLE objects,
no real BLE hardware required.

Byte fixtures (from docs/click-ble-spike.md + RESEARCH.md):
  PLUS_PRESS    = bytes([0x37, 0x08, 0x00])  # msg-type 0x37, tag 0x08 (field 1=plus),  value 0=pressed
  PLUS_RELEASE  = bytes([0x37, 0x08, 0x01])  # value 1=released
  MINUS_PRESS   = bytes([0x37, 0x10, 0x00])  # tag 0x10 (field 2=minus), value 0=pressed
  MINUS_RELEASE = bytes([0x37, 0x10, 0x01])
  IDLE_FRAME    = bytes([0x15, 0x00])         # first byte != 0x37 → silently ignored
  BATTERY_FRAME = bytes([0x19, 0x64])         # another non-button message type
"""
import asyncio
from contextlib import asynccontextmanager

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key

from engine.gears.engine import GearEngine
from engine.input.click import (
    RIDE_ON, ZWIFT_ASYNC_CHAR_UUID, ZWIFT_SYNC_RX_CHAR_UUID,
    ClickShifter, run_click_shifter,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_handshake_connect(on_main_notify_registered=None):
    """Return a fake_connect context manager that simulates the ECDH handshake.

    The stub's write_gatt_char responds with a valid device public-key frame so
    that _handshake_encrypted completes without timing out.  on_main_notify_registered
    is called when start_notify is invoked for the second time (main notify phase).
    """
    dev_key = generate_private_key(SECP256R1())
    dev_pub = dev_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    # Response: RIDE_ON + two control bytes + 64 raw key bytes (strip leading 0x04)
    handshake_response = RIDE_ON + bytes([0x01, 0x03]) + dev_pub[1:]

    @asynccontextmanager
    async def _connect(device):
        class _Stub:
            def __init__(self):
                self._handlers = {}
                self._start_notify_count = 0

            async def write_gatt_char(self, uuid, data, *a, **k):
                handler = self._handlers.get(ZWIFT_ASYNC_CHAR_UUID)
                if handler:
                    handler(None, handshake_response)

            async def start_notify(self, uuid, handler, *a, **k):
                self._handlers[uuid] = handler
                self._start_notify_count += 1
                if self._start_notify_count == 2 and on_main_notify_registered:
                    on_main_notify_registered()

            async def stop_notify(self, uuid, *a, **k):
                self._handlers.pop(uuid, None)

        yield _Stub()

    return _connect


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

class _FakeClock:
    def __init__(self, times):
        self._times = list(times)
        self._i = 0

    def __call__(self):
        if self._i < len(self._times):
            t = self._times[self._i]
            self._i += 1
            return t
        return self._times[-1]


PLUS_PRESS    = bytes([0x37, 0x08, 0x00])
PLUS_RELEASE  = bytes([0x37, 0x08, 0x01])
MINUS_PRESS   = bytes([0x37, 0x10, 0x00])
MINUS_RELEASE = bytes([0x37, 0x10, 0x01])
IDLE_FRAME    = bytes([0x15, 0x00])
BATTERY_FRAME = bytes([0x19, 0x64])


def _make(times):
    gears = GearEngine(current_gear=5)
    sh = ClickShifter(gears, clock=_FakeClock(times))
    return gears, sh


# ---------------------------------------------------------------------------
# Unit tests — button decode + debounce (synchronous, no BLE)
# ---------------------------------------------------------------------------

def test_plus_button_shifts_up():
    """Single plus-press notify frame increments current_gear by 1."""
    gears, sh = _make([0.0])
    sh.on_notify(None, PLUS_PRESS)
    assert gears.current_gear == 6


def test_minus_button_shifts_down():
    """Single minus-press notify frame decrements current_gear by 1."""
    gears, sh = _make([0.0])
    sh.on_notify(None, MINUS_PRESS)
    assert gears.current_gear == 4


def test_debounce_rejects_rapid_repeat():
    """Two plus-press frames 50 ms apart produce only ONE shift (within 100 ms window)."""
    gears, sh = _make([0.00, 0.05])
    sh.on_notify(None, PLUS_PRESS)
    sh.on_notify(None, PLUS_PRESS)
    assert gears.current_gear == 6  # only one shift


def test_debounce_allows_after_window():
    """Two plus-press frames 110 ms apart (> 100 ms window) produce TWO shifts."""
    gears, sh = _make([0.00, 0.11])
    sh.on_notify(None, PLUS_PRESS)
    sh.on_notify(None, PLUS_PRESS)
    assert gears.current_gear == 7  # two shifts


def test_release_not_dispatched():
    """A plus-RELEASE frame alone must not shift (value=1 = released)."""
    gears, sh = _make([0.0])
    sh.on_notify(None, PLUS_RELEASE)
    assert gears.current_gear == 5  # release alone never shifts


def test_unknown_message_type_ignored():
    """Frames with first byte != 0x37 must be silently ignored."""
    gears, sh = _make([0.0, 0.0])
    sh.on_notify(None, IDLE_FRAME)
    sh.on_notify(None, BATTERY_FRAME)
    assert gears.current_gear == 5


def test_press_then_release_one_shift():
    """A press frame followed by a release frame within 30 ms → exactly one shift.

    The press triggers the shift; the release frame must NOT also shift.
    """
    gears, sh = _make([0.00, 0.03])
    sh.on_notify(None, PLUS_PRESS)
    sh.on_notify(None, PLUS_RELEASE)
    assert gears.current_gear == 6  # press shifts; release does not add


# ---------------------------------------------------------------------------
# Async test — connection failure + retry
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_connection_failure_retries():
    """Scanner returns None first, then a fake device.

    run_click_shifter (via ClickShifter.connect_and_listen) must:
    - log a warning on the first None result (no assertion; just must not raise)
    - retry and succeed on the second call
    - stop cleanly when stop_event is set
    - never raise an exception out of the coroutine
    """
    gears = GearEngine()
    stop_event = asyncio.Event()
    attempts = {"n": 0}

    async def fake_scanner(*args, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return None  # first call: simulate not found
        # second call: signal stop and return a truthy stand-in
        stop_event.set()
        return object()

    fake_connect = _make_handshake_connect()

    sh = ClickShifter(gears)
    # Bound the test so it cannot hang.
    await asyncio.wait_for(
        sh.connect_and_listen(
            scanner=fake_scanner,
            connect=fake_connect,
            stop_event=stop_event,
            retry_backoff=0.01,
        ),
        timeout=2.0,
    )
    assert attempts["n"] >= 2  # confirmed: retried after first None


# ---------------------------------------------------------------------------
# Async tests — connection-state callback (on_state_change hook)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_state_change_called_on_connect():
    gears = GearEngine()
    stop_event = asyncio.Event()
    states: list[bool] = []

    async def fake_scanner(*, timeout):
        return object()

    # stop_event set on the 2nd start_notify (main notify phase, after handshake)
    fake_connect = _make_handshake_connect(on_main_notify_registered=stop_event.set)

    sh = ClickShifter(gears, on_state_change=states.append)
    await asyncio.wait_for(
        sh.connect_and_listen(scanner=fake_scanner, connect=fake_connect, stop_event=stop_event, retry_backoff=0.01),
        timeout=2.0,
    )
    assert True in states     # connect was reported
    assert False in states    # disconnect was reported (finally branch)
    assert states.index(True) < states.index(False)  # ordering


@pytest.mark.asyncio
async def test_state_change_called_on_disconnect_via_bleak_error():
    from bleak import BleakError
    gears = GearEngine()
    stop_event = asyncio.Event()
    states: list[bool] = []

    async def fake_scanner(*, timeout):
        stop_event.set()
        return object()

    @asynccontextmanager
    async def fake_connect(device):
        raise BleakError("simulated disconnect")
        yield  # unreachable

    sh = ClickShifter(gears, on_state_change=states.append)
    await asyncio.wait_for(
        sh.connect_and_listen(scanner=fake_scanner, connect=fake_connect, stop_event=stop_event, retry_backoff=0.01),
        timeout=2.0,
    )
    assert states == [] or states[-1] is False  # never claimed connected, or last state is False


@pytest.mark.asyncio
async def test_state_change_callback_optional():
    # No callback → no crash. Same fast-exit shape as the connect test above.
    gears = GearEngine()
    stop_event = asyncio.Event()

    async def fake_scanner(*, timeout):
        return object()

    fake_connect = _make_handshake_connect(on_main_notify_registered=stop_event.set)

    sh = ClickShifter(gears)  # no on_state_change
    await asyncio.wait_for(
        sh.connect_and_listen(scanner=fake_scanner, connect=fake_connect, stop_event=stop_event, retry_backoff=0.01),
        timeout=2.0,
    )
    # Reaches here without exception = pass.
