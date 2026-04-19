---
phase: 02-ftms-control-loop-virtual-gearing
plan: 04
subsystem: infra
tags: [ble, asyncio, ftms, virtual-gearing, keyboard, reconnect, shutdown]

# Dependency graph
requires:
  - phase: 02-ftms-control-loop-virtual-gearing
    provides: FtmsController + run_control_loop + RideState + GearEngine + KeyboardShifter (02-01 through 02-03)
provides:
  - Fully integrated Phase 2 engine: virtual gearing + 4 Hz FTMS control loop + INFRA-02 safe shutdown
  - reconnect_loop extended with ride_state/controller_factory/on_client_ready keyword args
  - main.py wired with GearEngine, RideState, KeyboardShifter, gear_status_logger
  - 73/73 tests green
affects: [03-websocket-bridge-cockpit-ui, 04-gpx-route-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INFRA-02: controller.shutdown() in try/finally before stop_indoor_bike_notify — trainer never stuck at grade after crash/disconnect"
    - "asyncio.wait(FIRST_COMPLETED) replaces bare event.wait() for stop_event + disconnected race"
    - "DEFAULT_GRADE constant in main.py for bench testing; Phase 4 GPX will replace with per-tick values"

key-files:
  created: []
  modified:
    - engine/engine/ble/reconnect.py
    - engine/engine/main.py
    - engine/tests/control/test_controller.py
    - engine/tests/ble/test_reconnect.py
    - engine/README.md

key-decisions:
  - "INFRA-02 shutdown guaranteed via try/finally in reconnect_loop — controller.shutdown() before stop_indoor_bike_notify (Pitfall 6)"
  - "reconnect_loop signature extended with keyword-only args (backwards compatible); Phase 1 behavior preserved when ride_state=None"
  - "asyncio.wait(FIRST_COMPLETED) on {stop_event, disconnected} instead of bare disconnected.wait() — clean Ctrl-C during live connection"
  - "KeyboardShifter.stop() in outer finally block in main() — tty always restored even on crash"

patterns-established:
  - "Pattern: reconnect_loop Phase 1 behavior preserved when ride_state=None — extension not replacement"
  - "Pattern: shutdown-before-notify ordering enforced in test by call_order list + index comparison"

requirements-completed: [INFRA-02, GEAR-02, BLE-03]

# Metrics
duration: 8min
completed: 2026-04-19
---

# Phase 2 Plan 04: Integration Summary

**Phase 2 closed: FtmsController + GearEngine + KeyboardShifter wired into reconnect_loop + main.py with INFRA-02 shutdown guarantee (73/73 tests green)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-19T07:02:19Z
- **Completed:** 2026-04-19T07:10:00Z
- **Tasks:** 4 (3 auto + 1 auto-approved checkpoint)
- **Files modified:** 5

## Accomplishments

- 3 new shutdown tests covering sequence order, error resilience, and try/finally crash path
- reconnect_loop extended with `ride_state`, `controller_factory`, `on_client_ready` keyword args — Phase 1 behavior preserved when ride_state=None
- INFRA-02 guaranteed: controller.shutdown() always runs in try/finally before stop_indoor_bike_notify on every disconnect/stop path
- main.py wired with GearEngine + RideState + KeyboardShifter + gear_status_logger; `DEFAULT_GRADE = 2.0%` constant for bench testing
- README updated with Phase 2 run instructions, keyboard controls, and smoke test steps

## Task Commits

1. **Task 1: Shutdown tests** — `d610e40` (test)
2. **Task 2: Wire FtmsController into reconnect_loop** — `b9891cf` (feat)
3. **Task 3: Wire GearEngine + KeyboardShifter into main.py** — `f3117c7` (feat)
4. **Task 4: Human-verify checkpoint** — auto-approved (auto_advance=true)

## Files Created/Modified

- `engine/tests/control/test_controller.py` — 3 new shutdown tests (shutdown_sequence, shutdown_never_raises, shutdown_on_crash)
- `engine/engine/ble/reconnect.py` — Extended reconnect_loop with ride_state/controller_factory/on_client_ready; INFRA-02 shutdown-before-notify ordering
- `engine/tests/ble/test_reconnect.py` — test_control_loop_wired_and_shutdown_before_notify_stop
- `engine/engine/main.py` — GearEngine + RideState + KeyboardShifter + gear_status_logger + DEFAULT_GRADE constant
- `engine/README.md` — Phase 2 run section appended

## Decisions Made

- `reconnect_loop` uses keyword-only args for new Phase 2 params — backwards compatible, Phase 1 tests unchanged
- `asyncio.wait(FIRST_COMPLETED)` on {stop_event, disconnected} instead of bare `disconnected.wait()` — required for Ctrl-C during active connection to trigger clean exit
- `controller.shutdown()` in try/finally (not except) — fires even on CancelledError from control_task cancellation
- `KeyboardShifter.stop()` in outer `finally` block of `main()` — tty always restored regardless of exception path

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 2 complete: virtual gearing + 4 Hz FTMS control loop + INFRA-02 safe shutdown all integrated
- Phase 3 (WebSocket Bridge + Cockpit UI) can import RideState and read telemetry from the shared queue
- Phase 3 WebSocket handler should mutate `state.real_grade_percent` for next-tick effect; no direct FTMS writes
- `DEFAULT_GRADE` in main.py is the Phase 4 integration point for GPX grade values

---
*Phase: 02-ftms-control-loop-virtual-gearing*
*Completed: 2026-04-19*
