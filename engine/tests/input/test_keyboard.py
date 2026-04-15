import pytest
from engine.gears.engine import GearEngine
from engine.input.keyboard import KeyboardShifter


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


class _FakeLoop:
    def __init__(self):
        self.reader_cb = None

    def add_reader(self, fd, cb):
        self.reader_cb = cb

    def remove_reader(self, fd):
        self.reader_cb = None


def _make_shifter(byte_script, times):
    gears = GearEngine(current_gear=5)
    idx = {"i": 0}

    def read_byte(_fd):
        if idx["i"] >= len(byte_script):
            return b""
        byte = byte_script[idx["i"]]
        idx["i"] += 1
        return bytes([byte])

    shifter = KeyboardShifter(
        gears,
        loop=_FakeLoop(),
        fd=-1,                       # sentinel: no real termios
        clock=_FakeClock(times),
        read_byte=read_byte,
    )
    return gears, shifter


def test_letter_k_shifts_up():
    gears, sh = _make_shifter([0x6B], [0.0])
    sh._on_readable()
    assert gears.current_gear == 6


def test_letter_j_shifts_down():
    gears, sh = _make_shifter([0x6A], [0.0])
    sh._on_readable()
    assert gears.current_gear == 4


def test_arrow_up_shifts_up():
    gears, sh = _make_shifter([0x1B, 0x5B, 0x41], [0.0, 0.0, 0.0])
    sh._on_readable(); sh._on_readable(); sh._on_readable()
    assert gears.current_gear == 6


def test_arrow_down_shifts_down():
    gears, sh = _make_shifter([0x1B, 0x5B, 0x42], [0.0, 0.0, 0.0])
    sh._on_readable(); sh._on_readable(); sh._on_readable()
    assert gears.current_gear == 4


def test_debounce_rejects_rapid_repeats():
    # Two 'k' presses 50ms apart (< 100ms debounce) → only first counts
    gears, sh = _make_shifter([0x6B, 0x6B], [0.00, 0.05])
    sh._on_readable(); sh._on_readable()
    assert gears.current_gear == 6  # only one shift


def test_debounce_allows_after_window():
    # Two 'k' presses 110ms apart (> 100ms) → both count
    gears, sh = _make_shifter([0x6B, 0x6B], [0.00, 0.11])
    sh._on_readable(); sh._on_readable()
    assert gears.current_gear == 7


def test_unknown_byte_ignored():
    gears, sh = _make_shifter([0x7A], [0.0])  # 'z'
    sh._on_readable()
    assert gears.current_gear == 5


def test_escape_then_non_bracket_resets_state():
    # ESC, 'k'  → ESC is consumed (enters state 1), then 'k' resets state (NOT a shift)
    gears, sh = _make_shifter([0x1B, 0x6B], [0.0, 0.0])
    sh._on_readable(); sh._on_readable()
    assert gears.current_gear == 5


def test_stop_clears_loop_reader():
    gears, sh = _make_shifter([], [0.0])
    # Simulate start by giving shifter a loop and a fake reader; start() would
    # call termios on a real fd, so manually invoke the pieces tests care about.
    # Store the bound method once to keep a stable reference for comparison.
    cb = sh._on_readable
    sh._loop.add_reader(sh._fd, cb)
    assert sh._loop.reader_cb is not None
    sh.stop()
    assert sh._loop.reader_cb is None
