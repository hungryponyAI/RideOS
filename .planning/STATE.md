---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: "Phase 1 Plan 01 complete — scaffold + fixtures + scan.py shipped"
last_updated: "2026-04-13T04:37:26Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 25
---

# STATE: RideOS

**Last updated:** 2026-04-12

---

## Project Reference

**What it is:** Personal macOS indoor cycling app controlling a Wahoo KICKR Core via BLE/FTMS with a virtual gearing system and React cockpit UI.

**Core value:** Virtual gearing — software-defined gear ratios that translate real route grade into trainer resistance via `effective_grade = real_grade / gear_factor`.

**Current focus:** Phase 1 — BLE Foundation + Metrics Read (plan 01 of 4 complete)

---

## Current Position

- **Phase:** 1 — BLE Foundation + Metrics Read
- **Plan:** 02 (next) — parser implementation turns 5 xfail stubs green
- **Status:** Plan 01 complete (`899ff9d`, `c219f97`, `ad78fdf`); engine/ scaffold ready
- **Progress:** [███░░░░░░░] 25% (1 / 4 plans in phase 1 complete)

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
| Plans executed | — | 1 |
| Success criteria verified | — | 1 |

### Execution Metrics

| Phase-Plan | Duration | Tasks | Files | Completed |
|------------|----------|-------|-------|-----------|
| 01-01 | 4m | 3 | 11 | 2026-04-13 |

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

### Open Design Questions (surfaced during planning)

1. Gear factor curve: linear vs geometric progression across 10 gears (Phase 2)
2. Grade smoothing window before FTMS write (Phase 2 / Phase 4)
3. Speed model for GPX position integration — trainer speed vs estimated virtual speed (Phase 4)
4. Shift debounce window for keyboard and Click (Phase 2, Phase 5)
5. FTMS write cadence fine-tuning — 4 Hz starting point, may need empirical adjustment (Phase 2)

### Todos

- Run plan 01-02 — implement `engine/engine/ftms/parsers.py::parse_indoor_bike_data` to turn the 5 xfail stubs green
- Run `scan.py` once on target hardware to validate macOS Bluetooth permission (one-time User Setup before plan 01-03)
- Before Phase 1 execution: check bleak issue tracker for macOS 14/15 CoreBluetooth regressions
- Before Phase 2 execution: check QZ / ftms-bike OSS for Wahoo FTMS quirks
- Before Phase 5 execution: full Zwift Click spike (nRF Connect capture + community OSS review)

### Blockers

None.

---

## Session Continuity

**Last session:** 2026-04-13 — Executed plan 01-01 (engine scaffold, bleak 3.0.1, 5 xfail parser stubs, scan.py diagnostic).

**Stopped at:** Completed `.planning/phases/01-ble-foundation-metrics-read/01-01-PLAN.md`. Ready for plan 01-02.

**Next action:** Execute plan 01-02 — implement FTMS Indoor Bike Data parser at `engine/engine/ftms/parsers.py` so the 5 xfail tests turn green.

**Key files:**
- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 + v2 requirements with traceability
- `.planning/ROADMAP.md` — 5-phase structure with success criteria
- `.planning/phases/01-ble-foundation-metrics-read/01-01-SUMMARY.md` — plan 01-01 outcome
- `.planning/research/SUMMARY.md` — stack/architecture/pitfalls synthesis
- `.planning/config.json` — mode: yolo, granularity: coarse
- `engine/tests/ftms/test_parsers.py` — xfail stubs awaiting plan 02 parser
- `engine/scan.py` — run once to validate macOS BLE permission

---
*State initialized: 2026-04-12*
*Plan 01-01 complete: 2026-04-13*
