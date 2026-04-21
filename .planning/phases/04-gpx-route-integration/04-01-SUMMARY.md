---
phase: 04-gpx-route-integration
plan: 01
subsystem: route
tags: [gpxpy, dataclass, haversine, grade-smoothing, gpx, parsing]

# Dependency graph
requires:
  - phase: 03-websocket-bridge-cockpit-ui
    provides: engine package layout, test infrastructure, asyncio_mode=auto pytest config
provides:
  - RouteData frozen dataclass (lats, lons, elevations_m, cum_dist_m, grades_pct, total_dist_m)
  - load_gpx(path: str) -> RouteData — synchronous GPX parser with haversine + smoothing
  - _rolling_mean(values, window) — centered rolling mean helper
  - Test fixtures: route_simple.gpx (3-point ramp), route_no_elevation.gpx (missing ele tags)
  - ROUTE-01 requirement fully satisfied
affects: [04-02-route-tracker, 04-03-gpx-ui-integration]

# Tech tracking
tech-stack:
  added: [gpxpy==1.6.2]
  patterns:
    - TDD RED/GREEN: test stubs committed first (ImportError), then implementation to turn green
    - Frozen dataclass with tuple fields for immutable, hashable data contracts
    - Centered rolling mean with shrinking edge windows (length-preserving)
    - gpxpy.geo.haversine_distance for 2D cumulative distance computation
    - Grade clamped to ±20% (KICKR Core FTMS safe range)
    - 0.1m guard on segment distance to avoid division by zero on duplicate GPS points

key-files:
  created:
    - engine/engine/route/__init__.py
    - engine/engine/route/model.py
    - engine/engine/route/loader.py
    - engine/tests/route/__init__.py
    - engine/tests/route/test_loader.py
    - engine/tests/fixtures/__init__.py
    - engine/tests/fixtures/route_simple.gpx
    - engine/tests/fixtures/route_no_elevation.gpx
  modified:
    - engine/pyproject.toml (added gpxpy>=1.6.2,<2.0 to runtime deps)

key-decisions:
  - "gpxpy 1.6.2 pinned as <2.0 to prevent breaking API changes in major version jump"
  - "RouteData uses tuple fields (not lists) for hashability and immutability enforcement"
  - "5-point centered rolling mean chosen: ~10-50 m smoothing window at typical GPS spacing, matches real road grade perception"
  - "0.1 m minimum segment distance guard prevents division-by-zero on duplicate GPS coordinates"
  - "All expensive computation (haversine, smoothing, clamping) at load time; hot-path RouteTracker (04-02) does O(log n) bisect only"

patterns-established:
  - "Route package follows engine/<module>/ flat layout matching ble, ftms, gears, control, ws"
  - "Logger: logging.getLogger('rideos.route') per project naming convention"
  - "GPX empty file raises ValueError with repr'd path in message"
  - "Missing elevation logged at WARNING level with count/total, coerced to 0.0"

requirements-completed: [ROUTE-01]

# Metrics
duration: 8min
completed: 2026-04-21
---

# Phase 4 Plan 01: GPX Loader Foundation Summary

**Synchronous `load_gpx(path)` delivering frozen `RouteData` with haversine cumulative distances, 5-point-smoothed ±20%-clamped grades, and full ROUTE-01 coverage via TDD RED/GREEN cycle**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21T10:35:52Z
- **Completed:** 2026-04-21T10:43:00Z
- **Tasks:** 2 (TDD: 1 RED + 1 GREEN)
- **Files modified:** 9 (1 modified, 8 created)

## Accomplishments

- Shipped ROUTE-01 fully: GPX parses to RouteData with per-point coordinates, elevations, cumulative distances (haversine), and smoothed/clamped grades
- All 5 unit tests pass; full engine suite green at 88/88 (no regression)
- RouteData contract frozen and exported — plans 04-02 and 04-03 can import without changes
- gpxpy 1.6.2 installed and declared as runtime dependency in pyproject.toml

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gpxpy + route package scaffolding + RED test stubs** - `9ee21a6` (test)
2. **Task 2: Implement RouteData + load_gpx (GREEN)** - `0a19eaf` (feat)

**Plan metadata:** (included in next commit — docs)

_Note: TDD tasks have two commits per the RED/GREEN protocol_

## Files Created/Modified

- `engine/pyproject.toml` — added `gpxpy>=1.6.2,<2.0` to `[project].dependencies`
- `engine/engine/route/__init__.py` — package marker (empty)
- `engine/engine/route/model.py` — `RouteData` frozen dataclass (tuple-based fields, total_dist_m scalar)
- `engine/engine/route/loader.py` — `load_gpx(path: str) -> RouteData` + `_rolling_mean` helper
- `engine/tests/route/__init__.py` — test package marker (empty)
- `engine/tests/route/test_loader.py` — 5 unit tests covering ROUTE-01 behaviors
- `engine/tests/fixtures/__init__.py` — fixtures package marker (empty)
- `engine/tests/fixtures/route_simple.gpx` — 3-point ramp, 100/110/120 m elevation, Berlin coords
- `engine/tests/fixtures/route_no_elevation.gpx` — 2 points, no `<ele>` tags (missing elevation test)

## Decisions Made

- gpxpy pinned to `<2.0` range to protect against breaking changes; locked to 1.6.2 by uv.lock
- tuple fields (not lists) in RouteData ensures the dataclass is hashable and mutation is caught at runtime via `FrozenInstanceError`
- Centered rolling mean (shrinking edges) chosen over padding to preserve length N exactly and avoid introducing artificial points at array boundaries
- 0.1 m guard on per-segment distance prevents division-by-zero when a GPX file has duplicate coordinates

## Deviations from Plan

None — plan executed exactly as written. Both commits match the exact messages specified in the plan.

## Issues Encountered

- `uv sync` (without `--all-extras`) uninstalled pytest/pytest-asyncio (dev extras). Fixed by running `uv sync --all-extras`. Not a code issue — resolved before any tests were run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- ROUTE-01 complete and frozen. `from engine.route.model import RouteData` and `from engine.route.loader import load_gpx` are stable imports for 04-02 and 04-03.
- 04-02 (RouteTracker): will use `bisect.bisect_right(route.cum_dist_m, dist_m)` for O(log n) position lookup at 4 Hz
- 04-03 (GPX UI): will surface `grade_pct` from RouteTracker → WebSocket → cockpit grade display

---
*Phase: 04-gpx-route-integration*
*Completed: 2026-04-21*
