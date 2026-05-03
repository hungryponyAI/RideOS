"""Unit tests for ClickShifter.

Button byte fixtures use the v2 bitmask format:
  V2_PLUS_PRESS   = bytes([0x23, 0x08, 0xFF, 0xDF, 0xFF, 0xFF, 0x0F])  # byte[3] bit-5 cleared
  V2_MINUS_PRESS  = bytes([0x23, 0x08, 0xFF, 0xFD, 0xFF, 0xFF, 0x0F])  # byte[3] bit-1 cleared
  V2_IDLE         = bytes([0x23, 0x08, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F])  # no button pressed

V1-style fixtures are also tested to confirm the legacy path still works:
  PLUS_PRESS    = bytes([0x37, 0x08, 0x00])
  MINUS_PRESS   = bytes([0x37, 0x10, 0x00])
"""
import asyncio
from contextlib import asynccontextmanager

import pytest

from engine.gears.engine import GearEngine
from engine.input.click import (
    RIDE_ON, ZWIFT_ASYNC_CHAR_UUID, ZWIFT_SYNC_RX_CHAR_UUID, ZWIFT_SYNC_TX_CHAR_UUID,
    ClickShifter, run_click_shifter,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_handshake_connect(on_main_notify_registered=None):
    """Return a fake_connect context manager for testing.

    Accepts the v2 activation writes (write_gatt_char calls) without response.
    Fires on_main_notify_registered when start_notify(ASYNC, on_notify) is called —
    that is the first start_notify OUTSIDE _activate (after the brief handshake listener).
    """
    @asynccontextmanager
    async def _connect(device):
        class _Stub:
            def __init__(self):
                self._notify_count = 0

            async def write_gatt_char(self, uuid, data, *a, **k):
                pass  # accept all writes (activation + keepalive)

            async def start_notify(self, uuid, handler, *a, **k):
                self._notify_count += 1
                # _activate subscribes ASYNC once (handshake listener), then
                # connect_and_listen subscribes ASYNC again (main on_notify).
                # Fire the callback on the 2nd start_notify call.
                if self._notify_count == 2 and on_main_notify_registered:
                    on_main_notify_registered()

            async def stop_notify(self, uuid, *a, **k):
                pass

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


# V2 bitmask frames
PLUS_PRESS    = bytes([0x23, 0x08, 0xFF, 0xDF, 0xFF, 0xFF, 0x0F])  # byte[3] = 0xDF
PLUS_RELEASE  = bytes([0x23, 0x08, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F])  # idle
MINUS_PRESS   = bytes([0x23, 0x08, 0xFF, 0xFD, 0xFF, 0xFF, 0x0F])  # byte[3] = 0xFD
MINUS_RELEASE = bytes([0x23, 0x08, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F])  # idle
IDLE_FRAME    = bytes([0x23, 0x08, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F])
BATTERY_FRAME = bytes([0x19, 0x64])  # non-v2-button frame, should be ignored

# V1 legacy frames (for backward-compat path test)
V1_PLUS_PRESS  = bytes([0x37, 0x08, 0x00])
V1_MINUS_PRESS = bytes([0x37, 0x10, 0x00])


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
    """An idle/release frame alone must not shift."""
    gears, sh = _make([0.0])
    sh.on_notify(None, PLUS_RELEASE)
    assert gears.current_gear == 5


def test_unknown_message_type_ignored():
    """Frames that are not v2-button and not 0x37 must be silently ignored."""
    gears, sh = _make([0.0, 0.0])
    sh.on_notify(None, IDLE_FRAME)    # v2 idle (no button pressed)
    sh.on_notify(None, BATTERY_FRAME)  # non-button frame
    assert gears.current_gear == 5


def test_press_then_release_one_shift():
    """A press frame followed by an idle/release frame within 30 ms → exactly one shift."""
    gears, sh = _make([0.00, 0.03])
    sh.on_notify(None, PLUS_PRESS)
    sh.on_notify(None, PLUS_RELEASE)  # idle frame — must not shift
    assert gears.current_gear == 6


def test_v1_plus_button_still_works():
    """Legacy v1 0x37 frame still dispatches when no AES key is set (unencrypted v1)."""
    gears, sh = _make([0.0])
    sh.on_notify(None, V1_PLUS_PRESS)
    assert gears.current_gear == 6


def test_v1_minus_button_still_works():
    gears, sh = _make([0.0])
    sh.on_notify(None, V1_MINUS_PRESS)
    assert gears.current_gear == 4


# ---------------------------------------------------------------------------
# Async test — connection failure + retry
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_connection_failure_retries():
    """Scanner returns None first, then a fake device; must retry and stop cleanly."""
    gears = GearEngine()
    stop_event = asyncio.Event()
    attempts = {"n": 0}

    async def fake_scanner(*args, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return None
        stop_event.set()
        return object()

    fake_connect = _make_handshake_connect()

    sh = ClickShifter(gears)
    await asyncio.wait_for(
        sh.connect_and_listen(
            scanner=fake_scanner,
            connect=fake_connect,
            stop_event=stop_event,
            retry_backoff=0.01,
        ),
        timeout=2.0,
    )
    assert attempts["n"] >= 2


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

    fake_connect = _make_handshake_connect(on_main_notify_registered=stop_event.set)

    sh = ClickShifter(gears, on_state_change=states.append)
    await asyncio.wait_for(
        sh.connect_and_listen(
            scanner=fake_scanner, connect=fake_connect,
            stop_event=stop_event, retry_backoff=0.01,
        ),
        timeout=2.0,
    )
    assert True in states
    assert False in states
    assert states.index(True) < states.index(False)


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
        sh.connect_and_listen(
            scanner=fake_scanner, connect=fake_connect,
            stop_event=stop_event, retry_backoff=0.01,
        ),
        timeout=2.0,
    )
    assert states == [] or states[-1] is False


@pytest.mark.asyncio
async def test_state_change_callback_optional():
    gears = GearEngine()
    stop_event = asyncio.Event()

    async def fake_scanner(*, timeout):
        return object()

    fake_connect = _make_handshake_connect(on_main_notify_registered=stop_event.set)

    sh = ClickShifter(gears)  # no on_state_change
    await asyncio.wait_for(
        sh.connect_and_listen(
            scanner=fake_scanner, connect=fake_connect,
            stop_event=stop_event, retry_backoff=0.01,
        ),
        timeout=2.0,
    )
    # Reaches here without exception = pass.
