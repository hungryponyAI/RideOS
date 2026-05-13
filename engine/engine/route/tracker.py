"""RouteTracker asyncio adapter — advances position along a GPX route (ROUTE-02 + ROUTE-03).

Pure position math lives in engine.domain.tracker. This module owns the
asyncio loop, the clock, and publishes PositionAdvanced events.

Key invariants:
- Only this task publishes PositionAdvanced once a route is loaded.
- position_m is monotonically non-decreasing until route completion.
- No BLE/WS/FTMS imports — testable with a plain speed_fn callable.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable, Optional

from engine.domain.events import PositionAdvanced
from engine.domain.tracker import advance_position, grade_at
from engine.route.model import RouteData

if TYPE_CHECKING:
    from engine.ports.eventbus import EventBusPort

_log = logging.getLogger("rideos.route")

ROUTE_COMPLETE_GRADE: float = 0.0
_ROUTE_END_EPSILON_M: float = 0.5


class RouteTracker:
    """Advances position along a RouteData and publishes PositionAdvanced events."""

    def __init__(
        self,
        route: RouteData,
        on_complete: Optional[Callable[[int], None]] = None,
        laps: int = 1,
        bus: Optional["EventBusPort"] = None,
    ) -> None:
        self._route = route
        self._position_m: float = 0.0
        self._on_complete = on_complete
        self._laps = max(1, laps)
        self._lap_index: int = 0
        self._bus = bus

    @property
    def position_m(self) -> float:
        return self._position_m

    async def run(
        self,
        speed_fn: Callable[[], Optional[float]],
        stop_event: asyncio.Event,
        *,
        tick_s: float = 0.25,
    ) -> None:
        """Main tracker loop. Exits when stop_event fires OR all laps complete.

        speed_fn: returns current speed in km/h (or None when no reading yet).
        """
        last_t = time.monotonic()
        start_t = time.monotonic()
        self._lap_index = 0

        while not stop_event.is_set():
            now = time.monotonic()
            dt = now - last_t
            last_t = now

            speed_ms = (speed_fn() or 0.0) / 3.6
            self._position_m = advance_position(
                self._position_m, speed_ms, dt, self._route.total_dist_m
            )

            if self._position_m >= self._route.total_dist_m - _ROUTE_END_EPSILON_M:
                self._lap_index += 1
                if self._lap_index >= self._laps:
                    elapsed_s = int(now - start_t)
                    _log.info(
                        "Route complete: %d lap(s) in %ds",
                        self._laps,
                        elapsed_s,
                    )
                    if self._bus is not None:
                        self._bus.publish(PositionAdvanced(
                            position_m=self._route.total_dist_m,
                            grade_idx=0,
                            grade_pct=ROUTE_COMPLETE_GRADE,
                            lap_index=self._lap_index,
                            t_mono=now,
                        ))
                    if self._on_complete is not None:
                        self._on_complete(elapsed_s)
                    return
                self._position_m = 0.0
                _log.info("Lap %d/%d complete; restarting from 0", self._lap_index, self._laps)

            idx, grade = grade_at(
                self._position_m,
                self._route.cum_dist_m,
                self._route.grades_pct,
            )

            if self._bus is not None:
                self._bus.publish(PositionAdvanced(
                    position_m=self._position_m,
                    grade_idx=idx,
                    grade_pct=grade,
                    lap_index=self._lap_index,
                    t_mono=now,
                ))

            await asyncio.sleep(tick_s)
