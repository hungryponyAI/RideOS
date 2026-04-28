---
phase: 05-zwift-click-integration
plan: "03"
subsystem: engine-integration
tags: [click, ble, websocket, asyncio, gear-engine]
dependency_graph:
  requires:
    - "05-02 — ClickShifter with on_state_change hook"
    - "03-01 — broadcast_queue + broadcast_loop contract (INFRA-01)"
  provides:
    - "click_task sibling asyncio.Task in main.py"
    - "WS outbound message click_status {type, connected}"
    - "on_state_change callback wired from ClickShifter -> broadcast_queue"
  affects:
    - "engine/engine/main.py — new import + task + shutdown wiring"
    - "cockpit UI — can now render Click connection indicator"
tech_stack:
  added: []
  patterns:
    - "drop-oldest broadcast_queue pattern (mirrors _on_reading closure)"
    - "plain def closure as asyncio-safe synchronous callback"
    - "asyncio.create_task with name= for debug tracing"
key_files:
  created: []
  modified:
    - "engine/engine/main.py"
    - "engine/tests/ws/test_server.py"
decisions:
  - "click_task spawned after ws_task so broadcast_queue is ready when first click_status fires"
  - "on_state_change is a plain def closure (not async) — BLE notify callback safety rule preserved"
  - "_on_click_state_change uses same drop-oldest QueueFull guard as _on_reading (INFRA-01)"
metrics:
  duration: "~2m"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  tests_before: 108
  tests_after: 110
  completed_date: "2026-04-27"
---

# Phase 5 Plan 3: Wire ClickShifter into main.py Summary

**One-liner:** `run_click_shifter` wired as a sibling asyncio.Task in `main.py`; `click_status {connected: bool}` broadcast added to the existing WS queue; keyboard fallback unchanged.

## What Was Built

### Task 1: on_state_change callback hook (already complete from 05-02)

The `ClickShifter` class in `engine/engine/input/click.py` already had the `on_state_change` callback and `_emit_state` helper implemented as part of 05-02. The three new async tests (`test_state_change_called_on_connect`, `test_state_change_called_on_disconnect_via_bleak_error`, `test_state_change_callback_optional`) were also already present in `engine/tests/input/test_click.py`.

Committed in: `d212b8f` (from 05-02 plan execution)

### Task 2: Wire ClickShifter into main.py + WS click_status tests

**engine/engine/main.py changes:**
- Added `from engine.input.click import run_click_shifter` import
- Added `_on_click_state_change(connected: bool)` plain def closure inside `main()` that builds `{"type": "click_status", "connected": connected}` and puts it on `broadcast_queue` using the drop-oldest pattern (mirrors `_on_reading`)
- Spawned `click_task = asyncio.create_task(run_click_shifter(..., on_state_change=_on_click_state_change), name="click_shifter")`
- Added `click_task` to the `asyncio.gather(...)` shutdown call
- Added `click_task` to the `for t in (...)` cancel-on-timeout fallback loop
- Added `_log.debug("click_task spawned...")` for debug tracing (4th `click_task` reference)

**engine/tests/ws/test_server.py additions:**
- `test_click_status_message_serializes_cleanly` — validates JSON shape of the new message type
- `test_click_status_drop_oldest_on_full_queue` — validates the drop-oldest queue behavior for click_status

Committed in: `8d1b201`

## Test Results

| Suite | Before | After | Status |
|-------|--------|-------|--------|
| tests/input/test_click.py | 11 passed | 11 passed | GREEN |
| tests/input/test_keyboard.py | passed | passed | GREEN (untouched) |
| tests/ws/test_server.py | 10 passed | 12 passed | GREEN |
| tests/ (full suite) | 108 passed | 110 passed | GREEN |

## Locked API Additions (STATE.md updates)

| Contract | Detail |
|----------|--------|
| `engine/engine/main.py` | Now spawns `click_task` alongside `reconnect_task`, `consumer_task`, `gear_logger_task`, `ws_task`; all five included in shutdown gather + cancel loop |
| `engine/engine/input/click.py` | `on_state_change: Callable[[bool], None] | None` kwarg on `ClickShifter.__init__` and `run_click_shifter`; `_emit_state(bool)` helper (never raises) |
| WS protocol (outbound) | New message type: `{"type": "click_status", "connected": bool}` — broadcast whenever Click connects or disconnects during a session |

## Keyboard Fallback Confirmation

`git diff engine/engine/input/keyboard.py` — empty. `KeyboardShifter` is byte-for-byte unchanged. Running `python -m engine` without a Zwift Click still works: the click_task scans in the background, logs warnings when no device is found, and retries — no crash, no error spam that would disrupt the ride.

## Deviations from Plan

None — plan executed exactly as written. Task 1 implementation was already present from 05-02 (the on_state_change hook was part of that plan's locked API). Task 2 proceeded directly to main.py wiring.

## Self-Check: PASSED

- `engine/engine/main.py` — FOUND and contains all required patterns
- `engine/tests/ws/test_server.py` — FOUND with both new test functions
- `engine/engine/input/keyboard.py` — UNCHANGED (verified via git diff)
- Commit `d212b8f` — FOUND (Task 1 / click.py callback from 05-02)
- Commit `8d1b201` — FOUND (Task 2 / main.py wiring + WS tests)
- All 110 tests PASS
