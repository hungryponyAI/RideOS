# Roadmap: RideOS

**Created:** 2026-04-12 | **Granularity:** coarse (5 phases)

## Phases

| Phase | Name | Status | Done |
|-------|------|--------|------|
| 1 | BLE Foundation + Metrics Read | Complete | 2026-04-13 |
| 2 | 4/4 | Complete   | 2026-04-19 |
| 3 | 4/4 | Complete   | 2026-04-20 |
| 4 | 5/5 | Complete   | 2026-04-22 |
| 5 | Zwift Click Integration | Planned | — |

## Phase 1: BLE Foundation + Metrics Read ✅
**Goal:** Stable BLE link to KICKR Core; parse live Indoor Bike Data.
**Reqs:** BLE-01, BLE-02, BLE-04
**Success:**
1. Engine discovers + connects to KICKR by name or FTMS UUID on macOS
2. Live speed/power/cadence visible in log while pedaling
3. Unplug/replug triggers auto-reconnect with exponential backoff; no crash
4. scan.py confirms macOS CoreBluetooth permission

## Phase 2: FTMS Control Loop + Virtual Gearing
**Goal:** Engine writes simulated grade at 4 Hz under virtual gearing formula; first real ride.
**Reqs:** BLE-03, GEAR-01, GEAR-02, INFRA-02
**Plans:** 4/4 plans complete
**Success:**
1. Full FTMS handshake (Request Control + Start); writes take visible effect on trainer
2. Keyboard shifts gear; `effective_grade = real_grade / gear_factor` applied across all 10 gears
3. Ctrl-C/crash issues FTMS Stop + Reset before exit — trainer never stuck at last grade
4. Full indoor ride at fixed test grade with shifting; no BLE drops

## Phase 3: WebSocket Bridge + Cockpit UI
**Goal:** React cockpit displays all live metrics at 60 fps over localhost WebSocket.
**Reqs:** INFRA-01, UI-01, UI-02, UI-03
**Success:**
1. Cockpit connects to engine WS; shows speed/gear/watts/cadence/grade at 60 fps, no stutter
2. Dark-themed, glanceable layout; speed primary, gear prominent
3. Elevation profile (bottom, empty-state) — red=climb, blue=descent
4. Mini-map (top-right, empty-state) — route line + position marker
5. WS I/O never blocks BLE control loop

## Phase 4: GPX Route Integration
**Goal:** Load GPX, track position, drive grade from elevation profile.
**Reqs:** ROUTE-01, ROUTE-02, ROUTE-03
**Success:**
1. GPX loads; elevation profile + coordinates extracted without error
2. Position advances along route by integrating speed × time (haversine)
3. Smoothed grade at current position fed into FTMS control loop
4. Full route ride completes end-to-end with matching resistance

## Phase 5: Zwift Click Integration
**Goal:** Replace keyboard shifter with Zwift Click BLE signals.
**Reqs:** GEAR-03
**Plans:** 4 plans
- [ ] 05-01-PLAN.md — Hardware spike: nRF Connect capture → confirm Click BLE protocol in `docs/click-ble-spike.md` (BLOCKER for 05-02)
- [ ] 05-02-PLAN.md — `engine/engine/input/click.py` ClickShifter implementation (TDD, 8 unit tests)
- [ ] 05-03-PLAN.md — Wire ClickShifter into `main.py`; broadcast `{"type":"click_status","connected":bool}`; keyboard regression
- [ ] 05-04-PLAN.md — Hardware end-to-end verification: real Click → cockpit gear changes; sign-off in `docs/phase-05-verification.md`
**Success:**
1. Research spike complete: Click BLE characteristic documented from nRF Connect + OSS
2. Engine reads shift-up/down from paired Click → same GearEngine actions as keyboard
3. Shifts responsive; debounce prevents missed/double presses
4. Keyboard still works as fallback

## Coverage

| Req | Phase | | Req | Phase |
|-----|-------|-|-----|-------|
| BLE-01 | 1 | | INFRA-01 | 3 |
| BLE-02 | 1 | | UI-01 | 3 |
| BLE-04 | 1 | | UI-02 | 3 |
| BLE-03 | 2 | | UI-03 | 3 |
| GEAR-01 | 2 | | ROUTE-01 | 4 |
| GEAR-02 | 2 | | ROUTE-02 | 4 |
| INFRA-02 | 2 | | ROUTE-03 | 4 |
| GEAR-03 | 5 | | | |

## Design notes
- Phase 5 = research spike; keyboard is permanent fallback — can slip without blocking shippable product
- First real ride = end of Phase 2; Phase 3 is cockpit polish
- UI-02/UI-03 scaffold in Phase 3 (empty-state), populated in Phase 4
