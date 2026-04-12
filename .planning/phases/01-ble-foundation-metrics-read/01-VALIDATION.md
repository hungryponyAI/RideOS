---
phase: 1
slug: ble-foundation-metrics-read
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | pyproject.toml or pytest.ini (Wave 0 installs) |
| **Quick run command** | `python -m pytest tests/ -x -q` |
| **Full suite command** | `python -m pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/ -x -q`
- **After every plan wave:** Run `python -m pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | BLE-01 | unit | `python -m pytest tests/test_parser.py -x -q` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | BLE-01 | unit | `python -m pytest tests/test_parser.py -x -q` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | BLE-02 | integration/manual | `python engine/scan.py` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 2 | BLE-04 | manual | manual reconnect test | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/__init__.py` — make tests a package
- [ ] `tests/conftest.py` — shared fixtures (sample IBD byte payloads)
- [ ] `tests/test_parser.py` — unit test stubs for IBD byte parsing (BLE-01)
- [ ] `pytest` — install if not present (`pip install pytest`)

*Wave 0 creates the test scaffold before any implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| KICKR Core discovered by name/FTMS UUID on macOS | BLE-01 | Requires physical hardware + BLE radio | Run `python engine/scan.py`, observe device list |
| macOS CoreBluetooth permission granted | BLE-02 | OS permission dialog cannot be automated | Run `scan.py`, verify non-empty scan results; if empty, check Privacy & Security > Bluetooth |
| Auto-reconnect on BLE drop | BLE-04 | Requires physical device power cycle | Unplug/replug KICKR, observe reconnect log with backoff delays |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
