"""RouteTracker asyncio adapter — drives RideState from GPX position (ROUTE-02 + ROUTE-03).

Pure position math lives in engine.domain.tracker. This module owns the
asyncio loop, the clock, and the state mutation.

Key invariants:
- Only this task mutates state.real_grade_percent once a route is loaded.
- position_m is monotonically non-decreasing until route completion.
- No BLE/WS/FTMS imports — testable against a fake RideState.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable, Optional

from engine.domain.tracker import advance_position, grade_at
from engine.route.model import RouteData

if TYPE_CHECKING:
    from engine.control.state import RideState

_log = logging.getLogger("rideos.route")

ROUTE_COMPLETE_GRADE: float = 0.0
_ROUTE_END_EPSILON_M: float = 0.5


class RouteTracker:
    """Advances position along a RouteData and updates RideState.real_grade_percent."""

    def __init__(
        self,
        route: RouteData,
        on_complete: Optional[Callable[[int], None]] = None,
        laps: int = 1,
    ) -> None:
        self._route = route
        self._position_m: float = 0.0
        self._on_complete = on_complete
        self._laps = max(1, laps)
        self._lap_index: int = 0

    @property
    def position_m(self) -> float:
        return self._position_m

    async def run(
        self,
        state: "RideState",
        stop_event: asyncio.Event,
        *,
        tick_s: float = 0.25,
    ) -> None:
        """Main tracker loop. Exits when stop_event fires OR all laps complete."""
        last_t = time.monotonic()
        start_t = time.monotonic()
        state.lap_index = 0
        state.lap_count = self._laps

        while not stop_event.is_set():
            now = time.monotonic()
            dt = now - last_t
            last_t = now

            speed_ms = (state.last_speed_kmh or 0.0) / 3.6
            self._position_m = advance_position(
                self._position_m, speed_ms, dt, self._route.total_dist_m
            )

            if self._position_m >= self._route.total_dist_m - _ROUTE_END_EPSILON_M:
                self._lap_index += 1
                state.lap_index = self._lap_index
                if self._lap_index >= self._laps:
                    elapsed_s = int(now - start_t)
                    state.real_grade_percent = ROUTE_COMPLETE_GRADE
                    _log.info(
                        "Route complete: %d lap(s) in %ds; grade -> %.1f%%",
                        self._laps,
                        elapsed_s,
                        ROUTE_COMPLETE_GRADE,
                    )
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
            state.real_grade_percent = grade
            state.current_grade_idx = idx

            await asyncio.sleep(tick_s)
