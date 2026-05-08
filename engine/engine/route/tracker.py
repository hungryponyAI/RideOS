"""RouteTracker: drive RideState.real_grade_percent from GPX position (ROUTE-02 + ROUTE-03).

Runs as a sibling asyncio.Task alongside reconnect_loop / telemetry_consumer /
broadcast_loop. Every tick_s seconds:

1. Compute dt from monotonic clock
2. Read state.last_speed_kmh (None → 0.0 per Pitfall 4)
3. Advance self._position_m by speed_ms * dt, clamped at route.total_dist_m
4. If at end: set real_grade_percent = ROUTE_COMPLETE_GRADE (0.0), log, exit task
5. Otherwise: bisect cum_dist_m for segment index; write grades_pct[idx] into state

Key invariants:
- Only this task mutates state.real_grade_percent once a route is loaded.
- position_m is monotonically non-decreasing until route completion.
- No BLE/WS/FTMS imports — pure logic, unit-testable against a fake RideState.
"""
from __future__ import annotations

import asyncio
import bisect
import logging
import time
from typing import Callable, Optional, TYPE_CHECKING

from engine.route.model import RouteData

if TYPE_CHECKING:
    from engine.control.state import RideState

_log = logging.getLogger("rideos.route")

# Grade written to RideState once the rider reaches the end of the route.
# Flat cool-down so the trainer doesn't stick at the last segment's grade.
ROUTE_COMPLETE_GRADE: float = 0.0

# Tolerance (metres) for deciding "we've arrived at the end of the route".
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
        """Current integrated position along the route (metres, 0..total_dist_m)."""
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
            self._position_m = min(
                self._position_m + speed_ms * dt,
                self._route.total_dist_m,
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
                # Wrap around for next lap
                self._position_m = 0.0
                _log.info("Lap %d/%d complete; restarting from 0", self._lap_index, self._laps)

            idx = bisect.bisect_right(self._route.cum_dist_m, self._position_m) - 1
            idx = max(0, min(idx, len(self._route.grades_pct) - 1))
            state.real_grade_percent = self._route.grades_pct[idx]
            state.current_grade_idx = idx

            await asyncio.sleep(tick_s)
