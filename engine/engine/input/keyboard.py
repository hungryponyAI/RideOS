"""Single-keystroke keyboard shifter.

Uses loop.add_reader(sys.stdin, ...) with termios cbreak so a single
key press (no Enter) triggers a shift. Arrow keys arrive as 3-byte
escape sequences ESC [ A (up) / ESC [ B (down); letter keys 'k' and 'j'
are accepted as a fallback when the terminal swallows escapes.

Debounce: 100 ms (Pitfall 3 — reject keyboard auto-repeat while a key
is held).

All side effects are injectable for tests: fd, loop, clock.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import termios
import time
import tty
from typing import Callable, Optional

from engine.gears.engine import GearEngine

_log = logging.getLogger(__name__)

_KEY_K = 0x6B
_KEY_J = 0x6A
_ESC   = 0x1B
_LBR   = 0x5B
_UP    = 0x41   # ESC [ A
_DOWN  = 0x42   # ESC [ B


class KeyboardShifter:
    _DEBOUNCE_S: float = 0.10

    def __init__(
        self,
        gear_engine: GearEngine,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        fd: Optional[int] = None,
        clock: Callable[[], float] = time.monotonic,
        read_byte: Optional[Callable[[int], bytes]] = None,
    ) -> None:
        self._gears = gear_engine
        self._loop = loop
        self._fd = fd if fd is not None else sys.stdin.fileno()
        self._clock = clock
        # read_byte(fd) -> 1 byte (or empty bytes on EOF). Injectable for tests.
        self._read_byte = read_byte or (lambda f: os.read(f, 1))
        self._prev_settings: Optional[list] = None
        self._last_shift_t: float = float("-inf")
        self._esc_state: int = 0   # 0=normal, 1=saw ESC, 2=saw ESC [

    def start(self) -> None:
        loop = self._loop or asyncio.get_event_loop()
        self._loop = loop
        # Only toggle termios when we own a real tty; tests can skip by
        # injecting a pseudo-fd. If tcgetattr fails (not a tty), keep going.
        try:
            self._prev_settings = termios.tcgetattr(self._fd)
            tty.setcbreak(self._fd)
        except termios.error:
            self._prev_settings = None
        loop.add_reader(self._fd, self._on_readable)
        _log.info("KeyboardShifter started on fd=%d", self._fd)

    def stop(self) -> None:
        if self._loop is not None:
            try:
                self._loop.remove_reader(self._fd)
            except (ValueError, NotImplementedError):
                pass
        if self._prev_settings is not None:
            try:
                termios.tcsetattr(self._fd, termios.TCSADRAIN, self._prev_settings)
            except termios.error:
                pass
            self._prev_settings = None

    # Exposed for tests; production uses add_reader → _on_readable.
    def _on_readable(self) -> None:
        byte = self._read_byte(self._fd)
        if not byte:
            return
        self._handle_byte(byte[0])

    def _handle_byte(self, b: int) -> None:
        # Escape-sequence state machine.
        if self._esc_state == 0:
            if b == _ESC:
                self._esc_state = 1
                return
            if b == _KEY_K:
                self._try_shift(up=True)
            elif b == _KEY_J:
                self._try_shift(up=False)
            # any other byte: ignore
            return
        if self._esc_state == 1:
            self._esc_state = 2 if b == _LBR else 0
            # ESC followed by anything other than '[': reset, DO NOT dispatch
            return
        # state 2 — expecting A or B
        if b == _UP:
            self._try_shift(up=True)
        elif b == _DOWN:
            self._try_shift(up=False)
        self._esc_state = 0

    def _try_shift(self, *, up: bool) -> None:
        now = self._clock()
        if (now - self._last_shift_t) < self._DEBOUNCE_S:
            return
        self._last_shift_t = now
        if up:
            new_gear = self._gears.shift_up()
        else:
            new_gear = self._gears.shift_down()
        _log.info("Shift %s → gear %d", "up" if up else "down", new_gear)
