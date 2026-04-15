# Requirements: RideOS

**Defined:** 2026-04-12
**Core Value:** Virtual gearing — software-defined gear ratios that translate route grade into trainer resistance, giving full control over how hard any climb feels

## v1 Requirements

### BLE & Trainer Control

- [x] **BLE-01**: User can connect to KICKR Core by device name or service UUID scan on macOS
- [x] **BLE-02**: App reads speed, power (watts), and cadence from FTMS Indoor Bike Data characteristic in real time
- [x] **BLE-03**: App sends simulated grade to KICKR via FTMS simulation mode (full Request Control + Start handshake, 4 Hz control loop)
- [x] **BLE-04**: App auto-reconnects to KICKR after BLE drop using exponential backoff without crashing or requiring restart

### Virtual Gearing

- [ ] **GEAR-01**: 10-gear virtual system applies a gear factor to real grade (`effective_grade = real_grade / gear_factor`)
- [ ] **GEAR-02**: Keyboard input (up/down arrow or configurable key) shifts gear up and down during a ride
- [ ] **GEAR-03**: Zwift Click BLE integration — app reads shift signals from Click via reverse-engineered BLE characteristic and maps to gear up/down

### Cockpit UI

- [ ] **UI-01**: React cockpit displays speed, current gear, watts, cadence, and simulated grade — glanceable, dark theme, 60 fps updates
- [ ] **UI-02**: Elevation profile displayed across the bottom of the cockpit with current position marker and gradient coloring (red = climb, blue = descent)
- [ ] **UI-03**: Mini-map (top-right) shows full route as a line with current position marker

### Route & Position

- [ ] **ROUTE-01**: User can load a GPX file and the app extracts the elevation profile and coordinates
- [ ] **ROUTE-02**: App tracks current position along the route by integrating speed over time (haversine distance model)
- [ ] **ROUTE-03**: Grade at current position (smoothed) is fed into the FTMS control loop as the base grade for virtual gearing

### Infrastructure

- [ ] **INFRA-01**: Python engine streams telemetry (speed, power, cadence, gear, grade, position) to React cockpit via WebSocket at up to 60 Hz
- [ ] **INFRA-02**: App performs a safe shutdown (FTMS Stop + Reset) when the Python process exits or crashes to prevent trainer being stuck at last grade

## v2 Requirements

### Export & History

- **EXP-01**: Ride session exported as CSV (timestamp, speed, power, cadence, grade, gear) after each ride
- **EXP-02**: Ride exported as FIT file compatible with Garmin Connect / Strava

### LLM Layer (optional, isolated)

- **LLM-01**: Route analyzer segments GPX by type (climb, descent, flat) and generates structured description
- **LLM-02**: AI coach provides live text feedback based on current power/cadence/grade
- **LLM-03**: Natural language route request ("60 min with 2 hard climbs") generates or modifies a route

## Out of Scope

| Feature | Reason |
|---------|--------|
| Street View / video overlay | High complexity, not needed for core training loop |
| Multiplayer / social | Personal use only |
| Cloud sync / accounts / auth | Local app, single user |
| Windows / Linux support | macOS only; single BLE stack target |
| ERG mode (fixed wattage) | Simulation mode is the core experience; ERG is a different product |
| Avatars / virtual worlds | Anti-feature — not what this is |
| Structured workout builder | Post-MVP; requires training zone config and workout scripting |
| LLM directly controlling trainer | Hard architectural boundary — LLM must never write to the FTMS control loop |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BLE-01 | Phase 1 | Complete (scan.py + find_kickr name-first/FTMS-UUID-fallback; verified on real KICKR in 01-04 smoke test) |
| BLE-02 | Phase 1 | Complete (parser + start/stop_indoor_bike_notify + telemetry_consumer; live readings verified in 01-04 smoke test) |
| BLE-03 | Phase 2 | Complete |
| BLE-04 | Phase 1 | Complete |
| GEAR-01 | Phase 2 | Pending |
| GEAR-02 | Phase 2 | Pending |
| GEAR-03 | Phase 5 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| ROUTE-01 | Phase 4 | Pending |
| ROUTE-02 | Phase 4 | Pending |
| ROUTE-03 | Phase 4 | Pending |
| INFRA-01 | Phase 3 | Pending |
| INFRA-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-13 — BLE-01/BLE-02 now In Progress after plan 01-01 (scan + parser scaffold)*
