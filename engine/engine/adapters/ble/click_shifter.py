"""ClickShifterAdapter — ShifterPort wrapping ClickShifter, publishes GearShifted events."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Optional

from engine.domain.events import GearShifted
from engine.domain.gears import GearEngine
from engine.input.click import ClickShifter
from engine.ports.eventbus import EventBusPort

_log = logging.getLogger("rideos.adapters.ble.click")


class _ShiftProxy:
    """Duck-typed proxy over GearEngine — shifts real gears and publishes GearShifted."""

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


class ClickShifterAdapter:
    """ShifterPort for Zwift Click BLE.

    Wraps ClickShifter, intercepting shift calls to publish GearShifted domain
    events while keeping the GearEngine in sync for components not yet on the
    read-model.
    """

    def __init__(
        self,
        gear_engine: GearEngine,
        bus: EventBusPort,
        *,
        clock: Callable[[], float] = time.monotonic,
        on_state_change: Optional[Callable[[bool], None]] = None,
        diagnostics: Any | None = None,
    ) -> None:
        proxy = _ShiftProxy(gear_engine, bus, clock)
        self._shifter = ClickShifter(
            proxy,  # type: ignore[arg-type]  # duck-typed; proxy satisfies shift_up/down contract
            clock=clock,
            on_state_change=on_state_change,
            diagnostics=diagnostics,
        )

    async def run(self, stop_event: asyncio.Event) -> None:
        await self._shifter.connect_and_listen(stop_event=stop_event)
