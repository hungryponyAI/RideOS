---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 02-04-PLAN.md (Phase 2 complete)
last_updated: "2026-04-19T18:26:30.522Z"
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# STATE: RideOS

## Current Position

- **Phase:** 2 — FTMS Control Loop + Virtual Gearing — COMPLETE
- **Plan:** 02-04 complete (Phase 2 integration: FtmsController + GearEngine + KeyboardShifter wired into main.py; 73/73 tests green)
- **Next:** Phase 3 — WebSocket Bridge + Cockpit UI

```
[x] Phase 1: BLE Foundation + Metrics Read
[x] Phase 2: FTMS Control Loop + Virtual Gearing
[ ] Phase 3: WebSocket Bridge + Cockpit UI
[ ] Phase 4: GPX Route Integration
[ ] Phase 5: Zwift Click Integration
```

Progress: [██████████] 100%

## Execution Metrics

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 01-01 | 4m | 3 | 11 | 2026-04-13 |
| 01-02 | 3m | 2 | 3  | 2026-04-13 |
| 01-03 | 2m | 2 | 6  | 2026-04-13 |
| 01-04 | 3m | 3 | 5  | 2026-04-13 |
| 02-01 | 8m | 2 | 9  | 2026-04-15 |
| 02-02 | 2m30s | 2 | 4 | 2026-04-15 |
| 02-03 | 4m | 2 | 4  | 2026-04-15 |
| 02-04 | 8m | 4 | 5  | 2026-04-19 |

## Locked APIs

| File | Locked contract |
|------|----------------|
| `engine/engine/ftms/parsers.py` | `IndoorBikeData` + `parse_indoor_bike_data` |
| `engine/engine/ble/scanner.py` | `find_kickr` + `KICKR_NAME` + `FTMS_SERVICE_UUID` |
| `engine/engine/ble/client.py` | `start_indoor_bike_notify` + `stop_indoor_bike_notify` + `telemetry_consumer` + `INDOOR_BIKE_DATA_UUID` |
| `engine/engine/ble/reconnect.py` | `reconnect_loop` + `ReconnectConfig` (single BleakClient owner) |
| `engine/engine/main.py` | `async main()` + signal-driven shutdown; `python -m engine` canonical entry |
| `engine/engine/ftms/control_point.py` | FTMS Control Point encoders + ControlPointResponse parser |
| `engine/engine/gears/engine.py` | `GearEngine`: factor table, shift_up/shift_down, effective_grade |
| `engine/engine/input/keyboard.py` | `KeyboardShifter`: cbreak + add_reader + debounce + ESC-sequence state machine |
| `engine/engine/control/state.py` | `RideState` dataclass (gear_engine, real_grade_percent=0.0) |
| `engine/engine/control/controller.py` | `FtmsController` + `FtmsControlError` + `run_control_loop` |

## Key Decisions

→ All decisions in memory/decisions.md

Critical architectural rules:
- `reconnect_loop` = SOLE owner of `BleakClient`; Phase 2+ reads via shared state, never opens second connection
- Only `control_loop.py` writes to trainer; WS/UI commands mutate state for next tick
- BLE notification callback = plain `def` + `queue.put_nowait` only (no await)
- LLM must never write to FTMS control loop
- INFRA-02: `controller.shutdown()` in try/finally inside reconnect_loop — before stop_indoor_bike_notify (Pitfall 6)
- `asyncio.wait(FIRST_COMPLETED)` on {stop_event, disconnected} — clean Ctrl-C during active connection
- `KeyboardShifter.stop()` in outer finally of `main()` — tty always restored

## Todos

- Before Phase 5: full Zwift Click spike (nRF Connect capture + community OSS review)

## Blockers

None.

## Session Continuity

**Stopped at:** Completed 02-04-PLAN.md (Phase 2 complete)
**Next action:** Phase 3 — WebSocket Bridge + Cockpit UI
**Key reference files:**
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
- `.planning/phases/02-ftms-control-loop-virtual-gearing/02-04-SUMMARY.md`
- `.planning/research/SUMMARY.md`
- `memory/decisions.md`
