---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: "Phase 1 Plan 03 complete — BLE discovery + notify + telemetry consumer green (13/13 tests pass)"
stopped_at: Completed .planning/phases/01-ble-foundation-metrics-read/01-03-PLAN.md
last_updated: "2026-04-13T13:04:35.762Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# STATE: RideOS

**Last updated:** 2026-04-13

---

## Project Reference

**What it is:** Personal macOS indoor cycling app controlling a Wahoo KICKR Core via BLE/FTMS with a virtual gearing system and React cockpit UI.

**Core value:** Virtual gearing — software-defined gear ratios that translate real route grade into trainer resistance via `effective_grade = real_grade / gear_factor`.

**Current focus:** Phase 1 — BLE Foundation + Metrics Read (plan 03 of 4 complete)

---

## Current Position

- **Phase:** 1 — BLE Foundation + Metrics Read
- **Plan:** 04 (next) — BleakClient lifecycle + reconnect/backoff around the plan-03 read primitives
- **Status:** Plan 03 complete (`323e893`/`0eb7298` scanner, `a1d58f1`/`241a264` client); `engine.ble.scanner` + `engine.ble.client` APIs locked, 13/13 tests green
- **Progress:** [████████░░] 75%

```
[ ] Phase 1: BLE Foundation + Metrics Read
[ ] Phase 2: FTMS Control Loop + Virtual Gearing
[ ] Phase 3: WebSocket Bridge + Cockpit UI
[ ] Phase 4: GPX Route Integration
[ ] Phase 5: Zwift Click Integration
```

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Phases planned | 5 | 5 |
| v1 requirements mapped | 15 / 15 | 15 / 15 |
| Plans executed | — | 3 |
| Success criteria verified | — | 3 |

### Execution Metrics

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 01-01 | 4m | 3 | 11 | 2026-04-13 |
| 01-02 | 3m | 2 | 3  | 2026-04-13 |
| 01-03 | 2m | 2 | 6  | 2026-04-13 |

---

## Accumulated Context

### Decisions (from PROJECT.md)

- Python + bleak for local engine (more stable than noble; native asyncio)
- Keyboard shifter as Click stand-in for MVP, permanent fallback after
- LLM layer isolated, never writes to FTMS control loop
- macOS only (single BLE stack target)
- Personal use only (no auth, no multi-user)

### Decisions (from research/SUMMARY.md)

- Single Python asyncio process shares event loop between bleak + websockets
- `websockets` library (not FastAPI) — zero framework overhead for localhost WS
- Zustand for React state; naive useState causes full-tree re-renders at 60 Hz
- uplot for live charting (only viable at 60 fps)
- Only `control_loop.py` writes to trainer; WS commands mutate state for next 4 Hz tick
- Reconnect logic is a separate asyncio task from the control loop

### Decisions (from plan 01-01 execution)

- bleak 3.x removed `__version__` — use `importlib.metadata.version('bleak')` instead
- Flat package layout `engine/engine/` (overrides uv init default `src/rideos_engine/`)
- pytest `testpaths=["tests"]`, `asyncio_mode="auto"` — no decorator needed on async tests
- xfail(strict=True) stubs gate plan 02 parser implementation (RED→GREEN contract)
- scan.py exit codes: 0 = devices found, 1 = empty scan (likely macOS permission), 2 = BleakError
- Python 3.12.12 provisioned by uv automatically (cpython-3.12.12-macos-aarch64-none)

### Decisions (from plan 01-02 execution)

- Power parsed as signed int16 (`struct` format `<h`) — negative watts are valid on KICKR Core (braking/freewheel)
- Bit 0 of IBD flags is INVERTED — speed present when CLEAR; encoded via named constant `_FLAG_MORE_DATA_SPEED_ABSENT` with a `not (...)` test for readability
- `IndoorBikeData` is a frozen dataclass with `speed_kmh` / `cadence_rpm` / `power_watts` (all `Optional`) — the single typed boundary between BLE layer and engine
- Parser accepts `bytes | bytearray` via `bytes(data)` coercion (bleak notifications deliver `bytearray`, tests use `bytes`)
- Flags bits 7–12 (avg power, energy, HR, MET, elapsed, remaining) are explicitly out of Phase 1 scope — parser stops after bit 6
- Plan-embedded CLI smoke assertions can drift from conftest fixtures; the pytest suite is the authoritative contract, not inline `uv run python -c` snippets

### Decisions (from plan 01-03 execution)

- BLE notification callback is a plain `def` with a single `queue.put_nowait(bytes(data))` statement — awaiting inside a CoreBluetooth callback deadlocks the macOS event loop (structurally enforced by acceptance-grep checks)
- Scanner discovery strategy is name-first (`BleakScanner.find_device_by_name("KICKR CORE")`) then FTMS-UUID-filter fallback (`find_device_by_filter` with `FTMS_SERVICE_UUID` predicate); never scan by MAC on macOS (CoreBluetooth exposes UUIDs, not MACs) and never pass `adapter=` or `scanning_mode="passive"`
- `telemetry_consumer` dispatches to sync or async handlers via `inspect.isawaitable(result)` — WS bridge and control loop can plug in without wrapper coroutines
- `None` on the queue is the shutdown sentinel (first-class value, not exception) so any future lifecycle owner can stop the consumer composably
- Parser errors inside the consumer are caught + logged + skipped (broad `except Exception`) — a single malformed BLE packet must never terminate the read loop
- Unit-test seam: `find_kickr(scanner_cls=...)` injection keeps bleak out of tests; `StubScanner` classmethod doubles exercise the full name-then-filter branch logic without hardware
- Reconnect / lifecycle stays out of this plan by design — plan 04 owns `BleakClient` connect/disconnect so the control-loop boundary in phase 2 has a clean seam

### Open Design Questions (surfaced during planning)

1. Gear factor curve: linear vs geometric progression across 10 gears (Phase 2)
2. Grade smoothing window before FTMS write (Phase 2 / Phase 4)
3. Speed model for GPX position integration — trainer speed vs estimated virtual speed (Phase 4)
4. Shift debounce window for keyboard and Click (Phase 2, Phase 5)
5. FTMS write cadence fine-tuning — 4 Hz starting point, may need empirical adjustment (Phase 2)

### Todos

- Run plan 01-04 — wrap `find_kickr` + `start_indoor_bike_notify` + `telemetry_consumer` in a `BleakClient` lifecycle with reconnect/backoff; run `scan.py` once on the target Mac first to grant CoreBluetooth permission
- Before Phase 2 execution: check QZ / ftms-bike OSS for Wahoo FTMS quirks
- Before Phase 5 execution: full Zwift Click spike (nRF Connect capture + community OSS review)

### Blockers

None.

---

## Session Continuity

**Last session:** 2026-04-13 — Executed plan 01-03 (find_kickr scanner + start/stop_indoor_bike_notify + telemetry_consumer, TDD RED→GREEN per task, 13/13 tests green).

**Stopped at:** Completed .planning/phases/01-ble-foundation-metrics-read/01-03-PLAN.md

**Next action:** Execute plan 01-04 — wrap `find_kickr` + `start_indoor_bike_notify` + `telemetry_consumer` in a BleakClient lifecycle with connect/disconnect + reconnect/backoff, closing out phase 1. **Prerequisite:** run `engine/scan.py` once on target hardware to grant macOS Bluetooth permission before any real-KICKR verification.

**Key files:**
- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 + v2 requirements with traceability
- `.planning/ROADMAP.md` — 5-phase structure with success criteria
- `.planning/phases/01-ble-foundation-metrics-read/01-01-SUMMARY.md` — plan 01-01 outcome
- `.planning/phases/01-ble-foundation-metrics-read/01-02-SUMMARY.md` — plan 01-02 outcome (parser API + encoding rules)
- `.planning/phases/01-ble-foundation-metrics-read/01-03-SUMMARY.md` — plan 01-03 outcome (BLE discovery + notify pipeline API)
- `.planning/research/SUMMARY.md` — stack/architecture/pitfalls synthesis
- `.planning/config.json` — mode: yolo, granularity: coarse
- `engine/engine/ftms/parsers.py` — **locked** `IndoorBikeData` + `parse_indoor_bike_data` contract
- `engine/engine/ble/scanner.py` — **locked** `find_kickr` + `KICKR_NAME` + `FTMS_SERVICE_UUID`
- `engine/engine/ble/client.py` — **locked** `start_indoor_bike_notify` + `stop_indoor_bike_notify` + `telemetry_consumer` + `INDOOR_BIKE_DATA_UUID`
- `engine/scan.py` — run once to validate macOS BLE permission

---
*State initialized: 2026-04-12*
*Plan 01-01 complete: 2026-04-13*
*Plan 01-02 complete: 2026-04-13*
*Plan 01-03 complete: 2026-04-13*
