---
phase: 3
slug: websocket-bridge-cockpit-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23 |
| **Config file** | `engine/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `cd engine && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd engine && uv run pytest tests/ -ra` |
| **Estimated runtime** | ~5 seconds |

> Frontend tests are out of scope for Phase 3 — React cockpit is pure display with no business logic to unit-test. Manual verification covers UI-02/UI-03.

---

## Sampling Rate

- **After every task commit:** Run `cd engine && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd engine && uv run pytest tests/ -ra`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | INFRA-01 | unit | `cd engine && uv run pytest tests/ws/test_server.py -x -q` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | INFRA-01 | unit | `cd engine && uv run pytest tests/ws/test_server.py::test_fanout -x` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | INFRA-01 | unit | `cd engine && uv run pytest tests/ws/test_server.py::test_shutdown -x` | ❌ W0 | ⬜ pending |
| 3-01-04 | 01 | 1 | UI-01 | unit | `cd engine && uv run pytest tests/control/test_state.py -x -q` | ❌ W0 | ⬜ pending |
| 3-01-05 | 01 | 1 | UI-01 | unit | `cd engine && uv run pytest tests/ws/test_server.py::test_snapshot_schema -x` | ❌ W0 | ⬜ pending |
| 3-01-06 | 01 | 1 | INFRA-01 | unit | `cd engine && uv run pytest tests/ble/ -x -q` | ✅ | ⬜ pending |
| 3-02-01 | 02 | 1 | UI-01 | manual | Open cockpit in browser, verify speed/gear/watts/cadence/grade display | manual-only | ⬜ pending |
| 3-03-01 | 03 | 2 | UI-02 | manual | Open cockpit in browser, verify empty elevation chart visible | manual-only | ⬜ pending |
| 3-04-01 | 04 | 2 | UI-03 | manual | Open cockpit in browser, verify dark map tile loads | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `engine/tests/ws/__init__.py` — ws test package
- [ ] `engine/tests/ws/test_server.py` — stubs for INFRA-01: start/accept/fan-out/shutdown/snapshot-schema
- [ ] `engine/tests/control/test_state.py` — extended RideState telemetry field assertions (UI-01)

*Existing infrastructure (`tests/ble/`, `engine/pyproject.toml` pytest config) covers BLE constraint test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Elevation profile renders in empty state | UI-02 | No data available until Phase 4; render verification requires browser | Start `python engine/main.py` + `npm run dev` in `ui/`; open `localhost:5173`; confirm AreaChart visible at bottom |
| Mini-map renders in empty state | UI-03 | CartoDB tile load requires browser + internet; no headless test | Same as above; confirm dark-themed map tile appears top-right |
| 60 fps cockpit update (no stutter) | UI-01 | fps measurement requires DevTools | Open browser DevTools → Performance tab; record 5s; confirm >55 fps average |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
