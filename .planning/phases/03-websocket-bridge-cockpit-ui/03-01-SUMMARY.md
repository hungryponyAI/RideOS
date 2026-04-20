---
phase: 03-websocket-bridge-cockpit-ui
plan: 01
subsystem: infra
tags: [websockets, asyncio, python, fan-out, telemetry, ble]

# Dependency graph
requires:
  - phase: 02-ftms-control-loop-virtual-gearing
    provides: RideState, GearEngine, FtmsController, KeyboardShifter, main.py task wiring
provides:
  - WebSocket broadcast server at ws://localhost:8765 (broadcast_loop coroutine)
  - CLIENTS registry (module-level set[ServerConnection]) for fan-out
  - RideState extended with last_speed_kmh, last_power_w, last_cadence_rpm fields
  - broadcast_queue wired in main.py (bounded, maxsize=10)
  - _on_reading closure in main() that updates RideState and posts 6-key JSON snapshots
  - ws_task as sibling asyncio.Task to reconnect_task
affects: [03-02-cockpit-ui, 03-03, phase-4-gpx]

# Tech tracking
tech-stack:
  added: ["websockets==16.0"]
  patterns:
    - "asyncio fan-out broadcast via module-level CLIENTS set + asyncio.Queue drain"
    - "BLE callback safety: plain def + put_nowait only (no await in callback path)"
    - "Bounded broadcast queue (maxsize=10) with drop-oldest on QueueFull"
    - "stop_event checked in 0.1s timeout loop for clean WS server shutdown"
    - "TDD: test→fail→implement→pass per task"

key-files:
  created:
    - engine/engine/ws/__init__.py
    - engine/engine/ws/server.py
    - engine/tests/ws/__init__.py
    - engine/tests/ws/test_server.py
    - engine/tests/control/test_state.py
  modified:
    - engine/engine/control/state.py
    - engine/engine/main.py
    - engine/pyproject.toml
    - engine/uv.lock

key-decisions:
  - "Use websockets.asyncio.server.serve + ServerConnection (not legacy WebSocketServerProtocol) per websockets 16.x API"
  - "Bounded broadcast_queue maxsize=10 with drop-oldest strategy on QueueFull prevents unbounded growth when no clients connected"
  - "_on_reading is plain def (not async) — preserves BLE callback safety; uses put_nowait only"
  - "ws_task included in shutdown gather and cancel loop alongside reconnect/consumer/gear_logger tasks"

patterns-established:
  - "Pattern: asyncio fan-out via CLIENTS set + asyncio.gather sends in broadcast_loop"
  - "Pattern: _on_reading closure captures state + broadcast_queue from main() scope"
  - "Pattern: 6-key canonical JSON schema: speed_kmh, power_w, cadence_rpm, gear, real_grade_pct, effective_grade_pct"

requirements-completed: [INFRA-01]

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 3 Plan 01: WebSocket Broadcast Server Summary

**asyncio WebSocket fan-out server (websockets 16.x) embedded in Python engine, streaming 6-key telemetry JSON to all connected React clients at BLE notification rate**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T04:46:30Z
- **Completed:** 2026-04-20T04:49:00Z
- **Tasks:** 2 (Task 1 TDD: 3 commits; Task 2: 1 commit)
- **Files modified:** 9

## Accomplishments

- Installed websockets 16.0 and created `engine/engine/ws/server.py` with `broadcast_loop` coroutine, module-level `CLIENTS` registry, and asyncio fan-out via `asyncio.gather`
- Extended `RideState` with `last_speed_kmh`, `last_power_w`, `last_cadence_rpm` (all `Optional[float]`, default `None`)
- Wired `ws_task` as sibling asyncio.Task in `main.py`; added `_on_reading` closure (plain def) that updates RideState fields and posts 6-key JSON snapshot to bounded `broadcast_queue`
- Full test suite: 81 tests green (8 new WS/state tests + 73 existing)

## Task Commits

Each task committed atomically:

1. **Task 1 RED - Failing tests** - `5f803ea` (test)
2. **Task 1 GREEN - RideState extension + WS server** - `c3ee35c` (feat)
3. **Task 2 - Wire WS into main.py** - `af84fb0` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 followed TDD: RED commit (failing tests) → GREEN commit (implementation)_

## Files Created/Modified

- `engine/engine/ws/__init__.py` — ws module package init
- `engine/engine/ws/server.py` — broadcast_loop coroutine, CLIENTS registry, fan-out JSON
- `engine/engine/control/state.py` — added last_speed_kmh, last_power_w, last_cadence_rpm fields
- `engine/engine/main.py` — broadcast_queue, _on_reading closure, ws_task wiring
- `engine/tests/ws/__init__.py` — test package init
- `engine/tests/ws/test_server.py` — single-client, fan-out, shutdown, schema tests
- `engine/tests/control/test_state.py` — RideState telemetry field tests
- `engine/pyproject.toml` — websockets>=16.0,<17.0 dependency added
- `engine/uv.lock` — lockfile updated

## Decisions Made

- Used `websockets.asyncio.server.serve` + `ServerConnection` (not legacy API) per websockets 16.x reorganization
- Bounded `broadcast_queue` (maxsize=10) with drop-oldest on `QueueFull` prevents unbounded growth when no React client is connected
- `_on_reading` is a plain `def` (not async), capturing `state` and `broadcast_queue` via closure — preserves BLE callback safety constraint
- `ws_task` included in the 15-second shutdown `asyncio.gather` and cancel loop alongside existing tasks

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- WebSocket server at `ws://localhost:8765` is operational and tested
- JSON schema locked: `{speed_kmh, power_w, cadence_rpm, gear, real_grade_pct, effective_grade_pct}`
- React cockpit (03-02) can connect directly to this server and render live telemetry
- No hardware (BLE) required to test WS layer — server importable and testable standalone

---
*Phase: 03-websocket-bridge-cockpit-ui*
*Completed: 2026-04-20*
