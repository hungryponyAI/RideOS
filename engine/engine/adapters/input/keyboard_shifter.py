"""KeyboardShifterAdapter — ShifterPort wrapping KeyboardShifter, publishes GearShifted events."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable

from engine.domain.events import GearShifted
from engine.domain.gears import GearEngine
from engine.input.keyboard import KeyboardShifter
from engine.ports.eventbus import EventBusPort

_log = logging.getLogger("rideos.adapters.input.keyboard")


class _ShiftProxy:
    """Proxy over GearEngine — shifts and publishes GearShifted."""

    def __init__(
        self,
        gear_engine: GearEngine,
        bus: EventBusPort,
        clock: Callable[[], float],
    ) -> None:
        self._gears = gear_engine
        self._bus = bus
        self._clock = clock

    def shift_up(self) -> int:
        gear = self._gears.shift_up()
        self._bus.publish(GearShifted(gear=gear, direction="up", t_mono=self._clock()))
        return gear

    def shift_down(self) -> int:
        gear = self._gears.shift_down()
        self._bus.publish(GearShifted(gear=gear, direction="down", t_mono=self._clock()))
        return gear

    @property
    def current_gear(self) -> int:
        return self._gears.current_gear


class KeyboardShifterAdapter:
    """ShifterPort for keyboard input (arrow keys and j/k).

    Wraps KeyboardShifter, publishing GearShifted events while keeping the
    GearEngine in sync for components not yet on the read-model.
    """

    def __init__(
        self,
        gear_engine: GearEngine,
        bus: EventBusPort,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        proxy = _ShiftProxy(gear_engine, bus, clock)
        self._shifter = KeyboardShifter(
            proxy,  # type: ignore[arg-type]
            clock=clock,
        )

    async def run(self, stop_event: asyncio.Event) -> None:
        self._shifter.start()
        try:
            await stop_event.wait()
        finally:
            self._shifter.stop()
