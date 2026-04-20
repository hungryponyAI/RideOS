---
phase: 4
slug: gpx-route-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.3 + pytest-asyncio 1.3.0 |
| **Config file** | `engine/pyproject.toml` — `asyncio_mode = "auto"` |
| **Quick run command** | `cd engine && uv run pytest tests/route/ -x -q` |
| **Full suite command** | `cd engine && uv run pytest -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd engine && uv run pytest tests/route/ -x -q`
- **After every plan wave:** Run `cd engine && uv run pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | ROUTE-01 | unit | `uv run pytest tests/route/test_loader.py -x` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | ROUTE-01 | unit | `uv run pytest tests/route/test_loader.py::test_missing_elevation -x` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | ROUTE-01 | unit | `uv run pytest tests/route/test_loader.py::test_grade_clamp -x` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | ROUTE-02 | unit | `uv run pytest tests/route/test_tracker.py -x` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | ROUTE-02 | unit | `uv run pytest tests/route/test_tracker.py::test_position_clamp -x` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 1 | ROUTE-02 | unit | `uv run pytest tests/route/test_tracker.py::test_none_speed -x` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | ROUTE-03 | unit | `uv run pytest tests/route/test_tracker.py::test_grade_lookup -x` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | ROUTE-03 | unit | `uv run pytest tests/route/test_tracker.py::test_state_mutation -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `engine/tests/route/__init__.py` — package marker
- [ ] `engine/tests/route/test_loader.py` — stubs for ROUTE-01
- [ ] `engine/tests/route/test_tracker.py` — stubs for ROUTE-02, ROUTE-03
- [ ] `engine/engine/route/__init__.py` — module package marker
- [ ] `cd engine && uv add gpxpy` — gpxpy not yet in pyproject.toml

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MiniMap renders route polyline + live position dot | ROUTE-02 | Requires browser + GPX file + running engine | Load GPX, start engine, open UI, verify blue polyline + red dot moves as speed increases |
| ElevationProfile shows current position indicator | ROUTE-03 | Requires browser + GPX file + live telemetry | Verify the ReferenceLine advances along the X-axis as the ride progresses |
| Full route ride end-to-end with matching resistance | ROUTE-03 | Requires real KICKR hardware | Load GPX, ride; resistance changes should match elevation profile grades |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
