---
phase: 5
slug: zwift-click-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio |
| **Config file** | `engine/pyproject.toml` (asyncio_mode = "auto") |
| **Quick run command** | `cd engine && uv run pytest tests/input/ -x -q` |
| **Full suite command** | `cd engine && uv run pytest tests/ -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd engine && uv run pytest tests/input/ -x -q`
- **After every plan wave:** Run `cd engine && uv run pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py -x -q` | ❌ Wave 0 | ⬜ pending |
| 5-02-01 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_plus_button_shifts_up -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-02 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_minus_button_shifts_down -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-03 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_debounce_rejects_rapid_repeat -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-04 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_debounce_allows_after_window -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-05 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_release_not_dispatched -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-06 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_unknown_message_type_ignored -x` | ❌ Wave 0 | ⬜ pending |
| 5-02-07 | 02 | 1 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_click.py::test_connection_failure_retries -x` | ❌ Wave 0 | ⬜ pending |
| 5-03-01 | 03 | 2 | GEAR-03 | unit | `cd engine && uv run pytest tests/input/test_keyboard.py -x -q` | ✅ exists | ⬜ pending |
| 5-03-02 | 03 | 2 | GEAR-03 | manual | hardware spike — nRF Connect BLE sniff | manual only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `engine/tests/input/test_click.py` — unit test stubs for all GEAR-03 behaviors (plus/minus shift, debounce, release, unknown message type, connection failure)
- [ ] No framework gaps — pytest + pytest-asyncio already installed and configured in `engine/pyproject.toml`
- [ ] `cryptography` dependency: `cd engine && uv add cryptography` — add only if encrypted handshake path is required during hardware spike

*Existing `tests/input/test_keyboard.py` already covers keyboard fallback — re-run as regression check.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| nRF Connect spike: confirm service UUID, button byte values on real hardware | GEAR-03 | Requires physical Zwift Click + smartphone; BLE sniffing cannot be automated | 1. Open nRF Connect on phone. 2. Scan for "Zwift Click". 3. Connect and read advertising data (expect manufacturer ID 0x094A, device type 0x09). 4. Enable notifications on ASYNC char (`00000002-19ca-4651-86e5-fa29dcdd09d1`). 5. Press plus/minus — record byte sequences. 6. Confirm message type byte 0x37, key '1' = plus, key '2' = minus. |
| End-to-end: Click button triggers visible gear change in cockpit UI | GEAR-03 | Requires physical hardware + running engine + browser | 1. Start engine. 2. Open cockpit in browser. 3. Press plus on Click — confirm gear number increments. 4. Press minus — confirm gear decrements. 5. Press plus 10 times rapidly — confirm debounce (no >1 gear change per 100ms). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
