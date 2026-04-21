# Requirements: RideOS

**Defined:** 2026-04-12

## v1 Requirements

### BLE & Trainer Control
- [x] **BLE-01**: Connect to KICKR Core by name or FTMS UUID on macOS
- [x] **BLE-02**: Read speed/power/cadence from FTMS Indoor Bike Data (0x2AD2) in real time
- [x] **BLE-03**: Send simulated grade via FTMS simulation mode (Request Control + Start handshake, 4 Hz)
- [x] **BLE-04**: Auto-reconnect after BLE drop with exponential backoff; no crash/restart

### Virtual Gearing
- [x] **GEAR-01**: 10-gear system: `effective_grade = real_grade / gear_factor`
- [x] **GEAR-02**: Keyboard shifts gear up/down during ride
- [ ] **GEAR-03**: Zwift Click BLE → shift signals via reverse-engineered characteristic

### Cockpit UI
- [x] **UI-01**: React cockpit: speed/gear/watts/cadence/grade; dark; 60 fps
- [x] **UI-02**: Elevation profile (bottom); current position; red=climb, blue=descent
- [x] **UI-03**: Mini-map (top-right); route + position marker

### Route & Position
- [x] **ROUTE-01**: Load GPX; extract elevation profile + coordinates
- [ ] **ROUTE-02**: Track position by integrating speed × time (haversine)
- [ ] **ROUTE-03**: Grade at position → FTMS control loop base grade

### Infrastructure
- [x] **INFRA-01**: Python engine streams telemetry to React via WebSocket at up to 60 Hz
- [x] **INFRA-02**: FTMS Stop + Reset on process exit/crash — trainer never stuck at last grade

## v2 Requirements

- **EXP-01**: Session CSV export (timestamp, speed, power, cadence, grade, gear)
- **EXP-02**: FIT file export (Garmin Connect / Strava compatible)
- **LLM-01**: Route analyzer segments GPX by type; structured description
- **LLM-02**: AI coach: live text feedback from power/cadence/grade
- **LLM-03**: Natural language route request → generate/modify route

## Out of scope

Street View / video overlay, multiplayer, cloud sync / auth, Windows/Linux, ERG mode, avatars, structured workout builder, LLM → trainer control

## Traceability

| Req | Phase | Status |
|-----|-------|--------|
| BLE-01 | 1 | Complete |
| BLE-02 | 1 | Complete |
| BLE-04 | 1 | Complete |
| BLE-03 | 2 | Complete |
| GEAR-01 | 2 | Complete |
| GEAR-02 | 2 | Complete |
| INFRA-02 | 2 | Pending (Plan 02-04) |
| GEAR-03 | 5 | Pending |
| UI-01 | 3 | Complete |
| UI-02 | 3 | Complete |
| UI-03 | 3 | Complete |
| INFRA-01 | 3 | Complete |
| ROUTE-01 | 4 | Complete |
| ROUTE-02 | 4 | Pending |
| ROUTE-03 | 4 | Pending |

v1: 15 reqs, all mapped.
