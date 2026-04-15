---
phase: 02-ftms-control-loop-virtual-gearing
plan: "03"
subsystem: control
tags: [asyncio, ftms, bleak, control-loop, state-machine, tdd]

requires:
  - phase: 02-ftms-control-loop-virtual-gearing
    provides: "FTMS Control Point encoders (encode_request_control, encode_start_or_resume, encode_set_simulation_parameters, encode_stop_or_pause, encode_reset), FMCP_UUID, OpCode, ResultCode — consumed by FtmsController"
  - phase: 02-ftms-control-loop-virtual-gearing
    provides: "GearEngine.effective_grade(real_grade_percent) — consumed by run_control_loop to compute grade to send"

provides:
  - "FtmsController: handshake state machine (REQUEST_CONTROL -> START_OR_RESUME with indication-backed confirmation)"
  - "FtmsControlError: typed exception with .op + .result attributes for non-SUCCESS indications"
  - "run_control_loop: 4 Hz asyncio loop with epsilon (0.05%) coalescing + 1s keepalive, injected sleep/clock seams"
  - "RideState dataclass: shared mutable state (gear_engine + real_grade_percent) — the seam Plan 02-04 wires together"
  - "FakeBleakClient + FMCP byte fixtures in conftest — fully hardware-free controller test double"

affects:
  - "02-04 — GradeController wiring (reconnect + main integration) reads FtmsController, RideState, run_control_loop"
  - "03 — WebSocket bridge will mutate RideState.real_grade_percent on each frontend tick"
  - "04 — GPX tracker will feed RideState.real_grade_percent from route segments"

tech-stack:
  added: []
  patterns:
    - "Indication-backed write: create Future before write, set_result in sync callback, wait_for with timeout — no polling"
    - "Sync callback rule enforced: _on_fmcp_indication is plain def, never async (Pitfall 3)"
    - "Keyword-form write: write_gatt_char(uuid, payload, response=True) — positional response bool is Pitfall 7"
    - "Injected sleep + clock in run_control_loop — same test-seam pattern as reconnect_loop"
    - "Best-effort shutdown: shutdown() iterates (Stop, Reset), catches ALL exceptions, logs and continues — never raises"

key-files:
  created:
    - engine/engine/control/state.py
    - engine/engine/control/controller.py
    - engine/tests/control/test_controller.py
  modified:
    - engine/tests/conftest.py

key-decisions:
  - "asyncio.Future (not asyncio.Queue) for indication-backed writes — one pending Future per in-flight write, cleared in finally block"
  - "run_control_loop does NOT call controller.start() or shutdown() — that is the caller's responsibility (Plan 02-04 wires this)"
  - "Keepalive window is 1.0s regardless of epsilon: even if grade is stable, write every 1s to prevent BLE link timeout"
  - "shutdown() attempts both Stop AND Reset even if Stop fails — each write is individually try/except guarded"
  - "RideState is a plain mutable dataclass (not frozen) — KeyboardShifter and future GPX tracker mutate gear and grade directly"

patterns-established:
  - "Indication-backed write: Future create -> write_gatt_char -> wait_for Future — reusable for any FMCP command"
  - "Sync callback sets Future.set_result only — async work in the awaiting coroutine, never in callback"
  - "FakeBleakClient: auto_success_for tuple + queue_indication + _schedule_indication via loop.call_soon"

requirements-completed: [BLE-03]

duration: 4min
completed: 2026-04-15
---

# Phase 2 Plan 03: GradeController Summary

**asyncio FTMS write-path brain: handshake state machine, indication-backed grade writes at 4 Hz with epsilon/keepalive gating, and RideState seam — proven hardware-free via FakeBleakClient**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-15T04:33:50Z
- **Completed:** 2026-04-15T04:37:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- FtmsController implements REQUEST_CONTROL -> START_OR_RESUME handshake with asyncio Future indication-backed confirmation; any non-SUCCESS raises FtmsControlError with typed .op + .result
- run_control_loop ticks at 4 Hz (0.25s), skips writes when |new_grade - last_grade| < 0.05%, forces write on 1s keepalive; write path uses keyword `response=True` per Pitfall 7
- RideState dataclass provides the mutable shared seam Plan 02-04 wires (gear_engine + real_grade_percent)
- FakeBleakClient + 6 FMCP byte fixtures enable fully hardware-free test suite; 8 new tests, full suite 69/69 green

## Task Commits

1. **Task 1: Extend conftest.py with FMCP fixtures + FakeBleakClient double** - `2b1bcf9` (test)
2. **Task 2: Implement FtmsController + RideState + run_control_loop with tests** - `85e3186` (feat)

## Files Created/Modified

- `engine/tests/conftest.py` - Added 6 FMCP byte fixtures + FakeBleakClient class + fake_bleak_client_factory fixture
- `engine/engine/control/state.py` - RideState dataclass (gear_engine, real_grade_percent=0.0)
- `engine/engine/control/controller.py` - FtmsController, FtmsControlError, run_control_loop — the write-path brain
- `engine/tests/control/test_controller.py` - 8 tests: handshake happy path, not-permitted, start failure, timeout, byte-exact encoding (5.0% -> b'\x11\x00\x00\xf4\x01\x00\x00'), tick coalescing, grade-change response, no-write-before-handshake

## Locked Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `_TICK_S` | 0.25 | 4 Hz write cadence |
| `_EPSILON_PCT` | 0.05 | Grade change threshold (%) to skip write |
| `_KEEPALIVE_S` | 1.0 | Force write even if grade unchanged (s) |
| `_RESPONSE_TIMEOUT_S` | 2.0 | FMCP indication wait timeout (s) |

## Decisions Made

- asyncio.Future (not Queue) for indication-backed writes — one pending Future per in-flight write, cleared in finally block even on timeout
- run_control_loop delegates start()/shutdown() responsibility to caller (Plan 02-04 owns the try/finally lifecycle)
- shutdown() individually guards both Stop and Reset with try/except — both ops always attempted even if first fails
- RideState is mutable dataclass (not frozen) so KeyboardShifter and future GPX tracker can mutate gear/grade directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-04 can now:
- Import `FtmsController`, `run_control_loop` from `engine.control.controller`
- Import `RideState` from `engine.control.state`
- Wire `reconnect_loop` client into `FtmsController(client)` following the single-client architectural rule
- Integrate `KeyboardShifter` -> `RideState.gear_engine` shift events
- Own the try/finally lifecycle: `controller.start()` -> `run_control_loop(...)` -> `controller.shutdown()` in finally

---
*Phase: 02-ftms-control-loop-virtual-gearing*
*Completed: 2026-04-15*
