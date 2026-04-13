# Roadmap: RideOS

**Created:** 2026-04-12
**Granularity:** coarse (5 phases)
**Core Value:** Virtual gearing — software-defined gear ratios that translate route grade into trainer resistance

---

## Phases

- [ ] **Phase 1: BLE Foundation + Metrics Read** - Stable KICKR connection, live telemetry parsing
- [ ] **Phase 2: FTMS Control Loop + Virtual Gearing** - Grade writes, 10-gear system, keyboard shifter — first real ride
- [ ] **Phase 3: WebSocket Bridge + Cockpit UI** - 60 fps React cockpit displaying all live metrics
- [ ] **Phase 4: GPX Route Integration** - Load routes, track position, drive grade from elevation profile
- [ ] **Phase 5: Zwift Click Integration** - Replace keyboard shifter with reverse-engineered BLE shift signals

---

## Phase Details

### Phase 1: BLE Foundation + Metrics Read
**Goal**: Python engine establishes a stable, resilient BLE link to the KICKR Core and parses live Indoor Bike Data into a usable telemetry stream.
**Depends on**: Nothing (first phase)
**Requirements**: BLE-01, BLE-02, BLE-04
**Success Criteria** (what must be TRUE):
  1. Running the engine discovers and connects to the KICKR Core on macOS by name or FTMS service UUID
  2. Live speed, power (watts), and cadence values are observable in the engine log, updating in real time while pedaling
  3. Unplugging/replugging the trainer or toggling BLE triggers auto-reconnect with exponential backoff — engine keeps running, no crash, no restart required
  4. A diagnostic `scan.py` script confirms macOS CoreBluetooth permission is granted for the shell host (surfaces silent-permission-block failures)
**Plans**: TBD

### Phase 2: FTMS Control Loop + Virtual Gearing
**Goal**: Engine writes simulated grade to the trainer at 4 Hz under the virtual gearing formula, letting the user ride a fixed grade and shift through 10 gears with the keyboard. First real ride.
**Depends on**: Phase 1
**Requirements**: BLE-03, GEAR-01, GEAR-02, INFRA-02
**Success Criteria** (what must be TRUE):
  1. Engine performs the full FTMS handshake (Request Control + Start) and then sends simulated grade at 4 Hz; writes take visible effect on trainer resistance
  2. Shifting up/down via keyboard changes the effective grade sent to the trainer per `effective_grade = real_grade / gear_factor` across all 10 gears
  3. Killing the Python process (Ctrl-C, crash, SIGTERM) issues FTMS Stop + Reset before exit — trainer never stays stuck at the last grade
  4. User can complete a full indoor ride at a fixed test grade, shifting gears, with no BLE drops or resistance glitches
**Plans**: TBD

### Phase 3: WebSocket Bridge + Cockpit UI
**Goal**: A glanceable React cockpit displays all live metrics at 60 fps, driven by a localhost WebSocket stream from the Python engine. Elevation profile and mini-map render as scaffolded components (populated in Phase 4).
**Depends on**: Phase 2
**Requirements**: INFRA-01, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. React cockpit connects to the Python engine over localhost WebSocket and displays speed, current gear, watts, cadence, and simulated grade updating at 60 fps with no visible stutter
  2. UI layout is glanceable and dark-themed: speed is the primary visual element, gear is prominently displayed, telemetry stays readable at riding distance
  3. Elevation profile component renders across the bottom of the cockpit with gradient coloring (red = climb, blue = descent) — empty-state until routes exist in Phase 4
  4. Mini-map component renders top-right with route line and position marker — empty-state until routes exist in Phase 4
  5. Telemetry stream never blocks the BLE control loop (WebSocket I/O stays off the FTMS write path)
**Plans**: TBD

### Phase 4: GPX Route Integration
**Goal**: User loads a GPX file, the engine tracks position along the route, and the route's smoothed grade drives the FTMS control loop — making virtual gearing meaningful on real terrain. Phase 3 UI scaffolds (elevation profile, mini-map) light up with real route data.
**Depends on**: Phase 3
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria** (what must be TRUE):
  1. User can load a GPX file and the engine extracts an elevation profile and ordered coordinate list without error
  2. During a ride, current position advances along the route by integrating trainer speed over time (haversine distance model); position marker moves on the mini-map and elevation profile accordingly
  3. The smoothed grade at the current route position is fed into the FTMS control loop as the base grade — climbs feel harder, descents feel easier, gearing modulates the effort
  4. A full route ride completes end-to-end: load GPX, ride to the end, resistance matches the profile, position tracking reaches the route end
**Plans**: TBD

### Phase 5: Zwift Click Integration
**Goal**: Replace the keyboard shifter with the physical Zwift Click as the primary shift input, via a reverse-engineered BLE characteristic. Keyboard remains a permanent fallback.
**Depends on**: Phase 4 (or Phase 2 — route integration not strictly required, but this phase ships last by design)
**Requirements**: GEAR-03
**Success Criteria** (what must be TRUE):
  1. Research spike complete: Zwift Click BLE shift characteristic documented (from nRF Connect capture + community OSS review) before implementation begins
  2. Engine reads shift-up and shift-down signals from a paired Zwift Click and maps them to the same `GearEngine` up/down actions as the keyboard
  3. Shifts from the Click feel responsive during a ride (no missed presses, no double-counts) with a suitable debounce window
  4. Keyboard shifter still works as a fallback when the Click is unpaired or out of range
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. BLE Foundation + Metrics Read | 1/4 | In Progress|  |
| 2. FTMS Control Loop + Virtual Gearing | 0/0 | Not started | - |
| 3. WebSocket Bridge + Cockpit UI | 0/0 | Not started | - |
| 4. GPX Route Integration | 0/0 | Not started | - |
| 5. Zwift Click Integration | 0/0 | Not started | - |

---

## Coverage

- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

| Requirement | Phase |
|-------------|-------|
| BLE-01 | Phase 1 |
| BLE-02 | Phase 1 |
| BLE-04 | Phase 1 |
| BLE-03 | Phase 2 |
| GEAR-01 | Phase 2 |
| GEAR-02 | Phase 2 |
| INFRA-02 | Phase 2 |
| INFRA-01 | Phase 3 |
| UI-01 | Phase 3 |
| UI-02 | Phase 3 |
| UI-03 | Phase 3 |
| ROUTE-01 | Phase 4 |
| ROUTE-02 | Phase 4 |
| ROUTE-03 | Phase 4 |
| GEAR-03 | Phase 5 |

---

## Design Notes

- **Coarse granularity applied:** Research suggested 6 phases (including Ride Export). Export is v2 scope, so Phase 6 is excluded from this roadmap — 5 phases matches coarse granularity and the v1 requirement set exactly.
- **UI-02 and UI-03 scaffolding in Phase 3, population in Phase 4:** The elevation profile and mini-map components ship as structural UI in Phase 3 (empty-state) and receive real data in Phase 4. This avoids a monolithic UI phase and keeps Phase 3 verifiable on its own.
- **Phase 5 is a research spike, not a blocker:** Zwift Click BLE protocol is undocumented; the keyboard shifter is a permanent fallback by design, so Phase 5 can slip or be deferred without blocking a shippable product.
- **First real ride = end of Phase 2.** Phase 3 is cockpit polish; the core training loop works without it (via engine logs) but is not glanceable until UI ships.

---
*Roadmap created: 2026-04-12*
