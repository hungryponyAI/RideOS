---
phase: 2
slug: ftms-control-loop-virtual-gearing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23+ (`asyncio_mode = "auto"`) |
| **Config file** | `engine/pyproject.toml` → `[tool.pytest.ini_options]` (already exists; no changes needed) |
| **Quick run command** | `uv run pytest tests/ftms/test_control_point.py tests/gears/ tests/control/ tests/input/ -x -q` |
| **Full suite command** | `uv run pytest -x -q` |
| **Estimated runtime** | ~2–3 seconds (all hardware-free unit tests) |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/ftms/test_control_point.py tests/gears/ tests/control/ tests/input/ -x -q`
- **After every plan wave:** Run `uv run pytest -x -q` (full suite; Phase 1's 17 tests must stay green)
- **Before `/gsd:verify-work`:** Full suite green + manual bench smoke (see manual verifications below)
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | BLE-03 | unit | `uv run pytest tests/ftms/test_control_point.py -x` | ❌ Wave 0 | ⬜ pending |
| 2-01-02 | 01 | 0 | BLE-03 | unit | `uv run pytest tests/ftms/test_control_point.py::test_encode_grade_positive -x` | ❌ Wave 0 | ⬜ pending |
| 2-01-03 | 01 | 0 | BLE-03 | unit | `uv run pytest tests/ftms/test_control_point.py::test_encode_grade_negative -x` | ❌ Wave 0 | ⬜ pending |
| 2-01-04 | 01 | 0 | BLE-03 | unit | `uv run pytest tests/ftms/test_control_point.py::test_parse_response_success -x` | ❌ Wave 0 | ⬜ pending |
| 2-02-01 | 02 | 0 | GEAR-01 | unit | `uv run pytest tests/gears/test_engine.py -x` | ❌ Wave 0 | ⬜ pending |
| 2-02-02 | 02 | 0 | GEAR-01 | unit | `uv run pytest tests/gears/test_engine.py::test_effective_grade_formula -x` | ❌ Wave 0 | ⬜ pending |
| 2-02-03 | 02 | 0 | GEAR-02 | unit | `uv run pytest tests/gears/test_engine.py::test_shift_bounds -x` | ❌ Wave 0 | ⬜ pending |
| 2-02-04 | 02 | 0 | GEAR-02 | unit | `uv run pytest tests/input/test_keyboard.py -x` | ❌ Wave 0 | ⬜ pending |
| 2-03-01 | 03 | 1 | BLE-03 | unit | `uv run pytest tests/control/test_controller.py::test_handshake_happy_path -x` | ❌ Wave 0 | ⬜ pending |
| 2-03-02 | 03 | 1 | BLE-03 | unit | `uv run pytest tests/control/test_controller.py::test_tick_coalescing -x` | ❌ Wave 0 | ⬜ pending |
| 2-03-03 | 03 | 1 | BLE-03 | unit | `uv run pytest tests/control/test_controller.py::test_no_write_before_handshake -x` | ❌ Wave 0 | ⬜ pending |
| 2-04-01 | 04 | 1 | INFRA-02 | unit | `uv run pytest tests/control/test_controller.py::test_shutdown_sequence -x` | ❌ Wave 0 | ⬜ pending |
| 2-04-02 | 04 | 1 | INFRA-02 | unit | `uv run pytest tests/control/test_controller.py::test_shutdown_on_crash -x` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `engine/engine/ftms/control_point.py` — encoders + response parser + UUIDs + OpCode/ResultCode enums
- [ ] `engine/engine/gears/__init__.py` — package marker
- [ ] `engine/engine/gears/engine.py` — `GearEngine` dataclass + pinned factor table
- [ ] `engine/engine/control/__init__.py` — package marker
- [ ] `engine/engine/control/controller.py` — `FtmsController` (handshake + shutdown) + `run_control_loop` tick function
- [ ] `engine/engine/input/__init__.py` — package marker
- [ ] `engine/engine/input/keyboard.py` — `KeyboardShifter` (add_reader + cbreak)
- [ ] `engine/tests/ftms/__init__.py` — test package marker
- [ ] `engine/tests/ftms/test_control_point.py` — ≥ 6 tests: encoders (grade ±, zero, clamp), response parse (success, not-permitted, malformed)
- [ ] `engine/tests/gears/__init__.py` — test package marker
- [ ] `engine/tests/gears/test_engine.py` — formula + all-10-gears parametrised + shift bounds
- [ ] `engine/tests/control/__init__.py` — test package marker
- [ ] `engine/tests/control/test_controller.py` — handshake, tick coalescing, no-write-before-handshake, shutdown sequence, shutdown on crash
- [ ] `engine/tests/input/__init__.py` — test package marker
- [ ] `engine/tests/input/test_keyboard.py` — shift debounce + arrow key ESC sequences

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real KICKR resistance changes at known grade | BLE-03 | Requires hardware | Bench ride at fixed 5% grade, observe resistance increase vs flat |
| Keyboard gear shifts visible in ride logs | GEAR-02 | Requires running trainer | Press k/j during ride; confirm gear number and effective grade change in log output |
| SIGINT produces Stop + Reset before exit | INFRA-02 | Process lifecycle, requires hardware | Run engine, Ctrl-C during active ride; inspect final 3 log lines for STOP and RESET opcodes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
