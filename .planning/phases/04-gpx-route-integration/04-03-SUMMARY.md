---
phase: "04-gpx-route-integration"
plan: "03"
subsystem: "engine-ws-bridge"
tags: ["websocket", "route", "asyncio", "integration"]
dependency_graph:
  requires: ["04-01", "04-02"]
  provides: ["route-ws-wiring", "telemetry-discriminator"]
  affects: ["engine/engine/main.py", "engine/engine/ws/server.py"]
tech_stack:
  added: []
  patterns: ["RouteContext mutable container", "asyncio.to_thread for off-loop GPX parsing", "fire-and-forget asyncio.create_task for load_route"]
key_files:
  created: []
  modified:
    - "engine/engine/ws/server.py"
    - "engine/engine/main.py"
    - "engine/tests/ws/test_server.py"
decisions:
  - "RouteContext dataclass (not dict) as shared mutable container — typed, IDE-friendly, explicit field names"
  - "asyncio.to_thread(load_gpx, path) — keeps 4 Hz BLE tick path unblocked during GPX parsing"
  - "QueueFull: drop-oldest fallback for route_data broadcast — consistent with existing snapshot drop policy"
  - "DEFAULT_GRADE: 2.0 → 0.0 — CONTEXT.md locked decision: free ride = flat road"
metrics:
  duration: "3m 18s"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_modified: 3
---

# Phase 4 Plan 3: WS Bridge + Engine Wiring Summary

Wire the 04-01 GPX loader and 04-02 RouteTracker into the live engine via a new `RouteContext` container and `load_route` WS inbound dispatch.

## What Was Built

### WS Message Schema (New + Extended)

**Inbound (browser → engine):**
```json
{"type": "load_route", "path": "/absolute/path/to/file.gpx"}
```

**Outbound — one-shot on successful route load:**
```json
{
  "type": "route_data",
  "lats": [52.52, ...],
  "lons": [13.40, ...],
  "elevations_m": [100.0, ...],
  "cum_dist_m": [0.0, ...],
  "grades_pct": [0.0, ...],
  "total_dist_m": 1234.5
}
```

**Outbound — one-shot on load failure:**
```json
{"type": "route_error", "message": "FileNotFoundError: ..."}
```

**Outbound — per-tick telemetry (extended existing snapshot):**
```json
{
  "type": "telemetry",
  "speed_kmh": 30.0,
  "power_w": 150,
  "cadence_rpm": 80,
  "gear": 5,
  "real_grade_pct": 2.0,
  "effective_grade_pct": 2.24,
  "position_m": 125.4,
  "route_loaded": true
}
```

### RouteContext Dataclass

```python
@dataclass
class RouteContext:
    state: RideState
    broadcast_queue: asyncio.Queue[dict]
    stop_event: asyncio.Event
    tracker: RouteTracker | None = None
    tracker_task: asyncio.Task | None = None
```

Created in `main.py` after `state` is initialized; passed to `broadcast_loop` via new optional kwarg; piped into `_handler` via `functools.partial`. This follows the existing `gear_engine` sharing pattern — a mutable container referenced by both the WS handler and the `_on_reading` closure without adding fields to `RideState` (locked API).

### Why asyncio.to_thread for GPX Parsing

`load_gpx` does synchronous file I/O + haversine distance computation over all track points. Running it directly on the event loop would block the 4 Hz FTMS control tick for potentially 50–200 ms on a large route. `asyncio.to_thread` offloads it to the thread pool — the event loop stays responsive during parsing.

### DEFAULT_GRADE: 2.0 → 0.0

Changed per the locked CONTEXT.md decision: "No GPX loaded (free ride): grade is 0% — replace DEFAULT_GRADE = 2.0 constant with 0.0; no route = flat road." The 2.0 was a bench-testing artifact from Phase 1/2 development.

### Shutdown Sequence

Now includes tracker cancellation before queue drain:
1. `stop_event.set()` (signal handler or Ctrl-C)
2. Cancel `route_ctx.tracker_task` if running (wait up to 1s)
3. `await queue.put(None)` → unblocks telemetry_consumer
4. `asyncio.gather(reconnect_task, consumer_task, gear_logger_task, ws_task)` with 15s timeout

## Decisions Made

1. **RouteContext as typed dataclass** — vs. passing tracker as a naked optional arg to broadcast_loop. A container lets `_handler` dispatch multiple load_route messages over the lifetime of one server without needing to thread additional parameters through every call site.

2. **Fire-and-forget `asyncio.create_task(_load_route(...))`** inside `_handler` — so the WS handler can immediately return to listening for more messages (e.g., gear_shift) while GPX parsing proceeds in the background. Results land via `broadcast_queue`.

3. **QueueFull drop-oldest for route_data** — consistent with the existing telemetry snapshot drop policy in `_on_reading`. The route_data message is large but one-shot; if the queue is full, one stale telemetry tick is sacrificed so the route_data message gets through.

## Tests Added

3 new integration tests in `engine/tests/ws/test_server.py`:
- `test_load_route_success_broadcasts_route_data` — valid GPX path → `route_data` message; tracker spawned
- `test_load_route_failure_broadcasts_route_error` — bogus path → `route_error` message; no tracker; grade=0.0
- `test_backward_compat_broadcast_loop_without_route_context` — legacy callers pass no route_context; server starts fine

Total suite: 97 passed.

## Deviations from Plan

None — plan executed exactly as written.

## Next Plan Reference

04-04 builds the React pre-ride screen and promotes ElevationProfile/MiniMap to consume `route_data` + `position_m` messages. The WS contract defined here (`route_data`, `route_error`, extended `telemetry`) is the source of truth for that work.

## Self-Check: PASSED

- `engine/engine/ws/server.py` — contains `class RouteContext`, `async def _load_route(`, `"load_route"`, `"route_data"`, `"route_error"`, `route_context: RouteContext | None = None`, `asyncio.to_thread(load_gpx, path)`, `asyncio.create_task(_load_route(`
- `engine/engine/main.py` — contains `DEFAULT_GRADE: float = 0.0`, `from engine.ws.server import broadcast_loop, RouteContext`, `route_ctx = RouteContext(`, `"type": "telemetry"`, `"position_m":`, `"route_loaded":`, `route_context=route_ctx`, `route_ctx.tracker_task.cancel()`
- `engine/tests/ws/test_server.py` — contains all 3 new test functions
- Commits: d9ffcd1 (Task 1), 693d4e1 (Task 2)
- Full suite: 97 passed
