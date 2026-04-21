---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 04-02-PLAN.md
last_updated: "2026-04-21T10:42:44.935Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 17
  completed_plans: 14
  percent: 82
---

# STATE: RideOS

## Current Position

- **Phase:** 4 — GPX Route Integration — IN PROGRESS
- **Plan:** 04-02 complete (RouteTracker: position integration + bisect grade lookup + ROUTE-02 + ROUTE-03)
- **Next:** 04-03 — main.py wiring (integrate RouteTracker as sibling asyncio.Task, --gpx CLI arg, WS broadcast of position_m)

```
[x] Phase 1: BLE Foundation + Metrics Read
[x] Phase 2: FTMS Control Loop + Virtual Gearing
[x] Phase 3: WebSocket Bridge + Cockpit UI (03-01 + 03-02 + 03-03 + 03-04 done)
[~] Phase 4: GPX Route Integration (04-01 done)
[ ] Phase 5: Zwift Click Integration
```

Progress: [████████░░] 82%

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
| 03-01 | 3m | 2 | 9  | 2026-04-20 |
| 03-02 | 3m | 2 | 13 | 2026-04-20 |
| 03-03 | 4m | 2 | 3  | 2026-04-20 |
| 03-04 | 2m | 2 | 6  | 2026-04-20 |
| 04-01 | 8m | 2 | 9  | 2026-04-21 |
| 04-02 | 2m | 2 | 2  | 2026-04-21 |

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
| `engine/engine/control/state.py` | `RideState` dataclass (gear_engine, real_grade_percent=0.0, last_speed_kmh, last_power_w, last_cadence_rpm) |
| `engine/engine/ws/server.py` | `broadcast_loop(broadcast_queue, stop_event, gear_engine, host, port)` + `CLIENTS: set[ServerConnection]` + inbound `gear_shift` dispatch |
| `engine/engine/control/controller.py` | `FtmsController` + `FtmsControlError` + `run_control_loop` |
| `engine/engine/route/model.py` | `RouteData` frozen dataclass (lats, lons, elevations_m, cum_dist_m, grades_pct, total_dist_m) |
| `engine/engine/route/loader.py` | `load_gpx(path: str) -> RouteData` + `_rolling_mean(values, window)` |
| `engine/engine/route/tracker.py` | `RouteTracker.__init__(route)`, `position_m` property, `async run(state, stop_event, *, tick_s=0.25)` + `ROUTE_COMPLETE_GRADE = 0.0` |

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
- INFRA-01 (03-01): `broadcast_loop` = sibling asyncio.Task; `_on_reading` plain def closure; bounded `broadcast_queue(maxsize=10)` with drop-oldest; websockets.asyncio.server API (not legacy)
- UI-01 (03-02): React.memo on all leaf components required for 60 Hz cockpit stability; Tailwind v3 locked; useTelemetry retryCountRef for backoff state
- UI-02/UI-03 (03-03): ElevationProfile empty-state uses Recharts AreaChart with isAnimationActive=false; MiniMap uses leaflet/dist/leaflet.css explicit import; overlay text at z-[1000] to clear Leaflet tile layers; CartoDB dark_all requires no API token
- UI-01 (03-04): ConnectionStatus gains "connected" variant; onopen -> connected (banner stays amber), onmessage -> live (banner hides); sendMessage useCallback with readyState guard; J/K keydown -> gear_shift WS message; Zwift Click (Phase 5) uses same gear_shift format
- ROUTE-01 (04-01): RouteData frozen dataclass with tuple fields; load_gpx does all expensive work at startup (haversine, 5-point rolling mean, ±20% clamp); 04-02 RouteTracker does O(log n) bisect only at 4 Hz
- ROUTE-02/03 (04-02): RouteTracker exits at total_dist_m-0.5m epsilon, sets grade=0.0 then returns; TYPE_CHECKING guard prevents circular deps; task exits via return not stop_event (main.py detects completion via Task.done())

## Todos

- Before Phase 5: full Zwift Click spike (nRF Connect capture + community OSS review)

## Blockers

None.

## Session Continuity

**Stopped at:** Completed 04-02-PLAN.md
**Next action:** Phase 4 — 04-03 main.py wiring (RouteTracker as sibling asyncio.Task + --gpx CLI arg + position_m in WS broadcast)
**Key reference files:**
- `.planning/phases/04-gpx-route-integration/04-02-SUMMARY.md`
- `engine/engine/route/tracker.py` (RouteTracker contract)
- `engine/engine/route/model.py` (RouteData contract)
- `engine/engine/main.py` (locked API to extend)
- `memory/decisions.md`
