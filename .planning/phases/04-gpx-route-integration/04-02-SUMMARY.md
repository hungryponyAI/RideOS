---
phase: 04-gpx-route-integration
plan: "02"
subsystem: route
tags: [asyncio, bisect, position-tracking, grade-lookup, ftms, tdd]

# Dependency graph
requires:
  - phase: 04-01
    provides: RouteData frozen dataclass (cum_dist_m, grades_pct, total_dist_m)
  - phase: 02-01
    provides: RideState dataclass with real_grade_percent field
provides:
  - RouteTracker class with run() coroutine and position_m property
  - ROUTE_COMPLETE_GRADE constant (0.0)
  - Pure-logic asyncio component ready for main.py wiring
affects:
  - 04-03 (wires RouteTracker into main.py as sibling asyncio.Task)
  - 04-05 (real-hardware checkpoint validates end-to-end grade driving)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sibling asyncio.Task pattern: stop_event loop + time.monotonic() for dt"
    - "bisect.bisect_right for O(log n) segment lookup at 4 Hz"
    - "None-safety via `speed or 0.0` pattern for BLE reconnect gaps"

key-files:
  created:
    - engine/engine/route/tracker.py
    - engine/tests/route/test_tracker.py
  modified: []

key-decisions:
  - "RouteTracker exits cleanly when position reaches total_dist_m - 0.5 m (ROUTE_END_EPSILON); sets grade to 0.0 then returns (no stop_event needed)"
  - "TYPE_CHECKING guard for RideState import keeps tracker free of circular deps while preserving type hints"
  - "position_m is a read-only property backed by _position_m — no setter exposed"

patterns-established:
  - "TDD RED/GREEN: failing test committed first, implementation committed second — two atomic commits per feature"
  - "Pure-logic asyncio tasks have zero BLE/WS/FTMS imports; unit-testable with fake RideState dataclass"

requirements-completed:
  - ROUTE-02
  - ROUTE-03

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 4 Plan 02: RouteTracker Summary

**`asyncio.Task` that integrates position at 4 Hz via `speed_ms * dt`, uses `bisect.bisect_right` for O(log n) segment lookup, and writes `grades_pct[idx]` into `state.real_grade_percent` each tick**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T10:40:07Z
- **Completed:** 2026-04-21T10:41:54Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- `RouteTracker` asyncio component satisfies ROUTE-02 (position tracking) and ROUTE-03 (grade state mutation) at unit level
- None-speed safety: `state.last_speed_kmh = None` during BLE reconnect gaps treated as 0.0 — tracker never crashes
- Route completion: when position reaches `total_dist_m - 0.5 m`, grade is set to `ROUTE_COMPLETE_GRADE = 0.0` and task exits naturally
- 6 unit tests cover: happy-path position advancement, None-speed freeze, route completion + clamp, bisect correctness, per-tick mutation, read-only property

## RouteTracker Public API

```python
ROUTE_COMPLETE_GRADE: float = 0.0          # grade written on route end
_ROUTE_END_EPSILON_M: float = 0.5          # metres before end that triggers completion

class RouteTracker:
    def __init__(self, route: RouteData) -> None: ...
    @property
    def position_m(self) -> float: ...      # read-only, 0..total_dist_m
    async def run(
        self,
        state: RideState,
        stop_event: asyncio.Event,
        *,
        tick_s: float = 0.25,
    ) -> None: ...
```

**Key invariant:** only `RouteTracker.run()` mutates `state.real_grade_percent` once a route is active. Never reads/writes any other state field.

## Task Commits

1. **Task 1: RED tests for RouteTracker** - `5906cc3` (test)
2. **Task 2: RouteTracker implementation** - `1dff1b1` (feat)

## Files Created/Modified

- `engine/engine/route/tracker.py` - RouteTracker class: position integration, bisect grade lookup, route completion logic
- `engine/tests/route/test_tracker.py` - 6 async unit tests covering ROUTE-02 + ROUTE-03

## Decisions Made

- `ROUTE_END_EPSILON_M = 0.5 m`: position is clamped at `total_dist_m` before the end check; the 0.5 m band ensures the last segment's grade is applied before the task exits, avoiding a missed-end scenario at low speed
- `TYPE_CHECKING` guard for `RideState` import: tracker imports only `RouteData` at runtime; `RideState` is type-hint only, preventing circular dependency from `engine.control.state` → `engine.gears.engine` being pulled into the route layer
- Task exits via `return` (not `stop_event.set()`): allows main.py to detect route completion via `asyncio.Task.done()` in 04-03 wiring

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `RouteTracker` is self-contained and ready for integration in **04-03**
- 04-03 will: (1) accept optional `--gpx` CLI arg, (2) call `load_gpx()`, (3) create `RouteTracker(route)`, (4) add `tracker.run(state, stop_event)` as a sibling `asyncio.Task` in `main()`
- `position_m` property is available for WebSocket broadcast (will be wired in 04-03)
- Full suite: 94 tests pass, 0 failures

---
*Phase: 04-gpx-route-integration*
*Completed: 2026-04-21*
