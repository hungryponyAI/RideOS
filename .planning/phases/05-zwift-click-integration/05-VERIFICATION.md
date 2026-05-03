---
phase: 05-zwift-click-integration
verified: 2026-04-28T00:00:00Z
status: human_needed
score: 3/4 must-haves verified (automated); 4th requires hardware
re_verification: false
human_verification:
  - test: "Run 8-test hardware verification table in docs/phase-05-verification.md"
    expected: "Tests 1 (no-Click resilience), 6 (keyboard fallback), 8 (clean shutdown) PASS as fallback gates; Tests 2-5, 7 PASS for full GEAR-03 acceptance"
    why_human: "Requires physical Zwift Click + KICKR Core powered on; BLE connection, button presses, debounce timing, and disconnect/reconnect cannot be verified programmatically"
  - test: "Fill the 'Actual' column and 'Status' cells in docs/phase-05-verification.md, then sign with name + date"
    expected: "All 8 rows have PASS/FAIL/SKIP, 'Signed' line filled — no placeholder text remaining"
    why_human: "Document designed as a sign-off record; unfilled cells (<user name>, <YYYY-MM-DD>, empty Status cells) confirm human review has not yet occurred"
---

# Phase 5: Zwift Click Integration — Verification Report

**Phase Goal:** Replace keyboard shifter with Zwift Click BLE signals.
**Verified:** 2026-04-28
**Status:** human_needed — all automated checks pass; hardware sign-off outstanding
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Research spike complete: Click BLE characteristic documented from nRF Connect + OSS | VERIFIED | `docs/click-ble-spike.md` filled with hardware-confirmed values; firmware 1.1.0 confirmed; ECDH path decided |
| 2 | Engine reads shift-up/down from paired Click → same GearEngine actions as keyboard | VERIFIED (automated) | `ClickShifter.on_notify` calls `gear_engine.shift_up/down`; 8 unit tests GREEN |
| 3 | Shifts responsive; debounce prevents missed/double presses | VERIFIED (automated) | `test_debounce_rejects_rapid_repeat`, `test_debounce_allows_after_window` GREEN; hardware timing needs human |
| 4 | Keyboard still works as fallback | VERIFIED (automated) | `KeyboardShifter` unchanged (`git diff engine/engine/input/keyboard.py` empty); keyboard regression suite GREEN; hardware confirmation pending |

**Score:** 3/4 fully verified, 1/4 requires hardware confirmation

---

## Required Artifacts

### Plan 05-01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `docs/click-ble-spike.md` | VERIFIED | Exists; contains `## Confirmed values` heading and all 11 rows of the constants table; all "Actual (this device)" cells filled with concrete values (no `???` remain); encrypted path checkbox ticked |

### Plan 05-02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `engine/tests/input/test_click.py` | VERIFIED | Exists; 11 test functions (`grep -c` = 11); all 8 required names present (`test_plus_button_shifts_up`, `test_minus_button_shifts_down`, `test_debounce_rejects_rapid_repeat`, `test_debounce_allows_after_window`, `test_release_not_dispatched`, `test_unknown_message_type_ignored`, `test_press_then_release_one_shift`, `test_connection_failure_retries`) |
| `engine/engine/input/click.py` | VERIFIED | Exists; contains `class ClickShifter`, `async def run_click_shifter`; all 8 required constants present; `on_notify` is plain `def` (not async); `on_state_change` kwarg and `_emit_state` helper present |
| `engine/pyproject.toml` | VERIFIED | `cryptography>=47.0.0` present (spike confirmed encrypted path required) |

### Plan 05-03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `engine/engine/main.py` | VERIFIED | Contains `click_task`; 4 references: `create_task`, `debug log`, `gather`, `cancel loop` |
| `engine/engine/input/click.py` | VERIFIED | `on_state_change` in constructor + `_emit_state(True)` after `start_notify` + `_emit_state(False)` in `finally` block + `_emit_state(False)` in error handlers |
| `engine/engine/ws/server.py` | PARTIAL | `click_status` tests exist in `engine/tests/ws/test_server.py`; the string `click_status` does not appear in `server.py` itself (message is put onto `broadcast_queue` by `main.py`; `server.py` forwards all queue items as JSON without type filtering — so this is by design, not a gap) |

### Plan 05-04 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `docs/phase-05-verification.md` | PARTIAL — NEEDS HUMAN | Exists; has `## Sign-off` heading; 8 rows with `PASS / FAIL / SKIP` (checklist populated); engine commit hash `51ab8ca7ea...` filled in (no `<git rev-parse HEAD>` placeholder); BUT all Status cells still read `PASS / FAIL / SKIP` (blank), `Signed: <user name>  Date: <YYYY-MM-DD>` — hardware tests have not been run |

---

## Key Link Verification

### Plan 05-02 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `click.py _on_notify` | `GearEngine.shift_up / shift_down` | direct synchronous call | WIRED | `gear_engine.shift_up()` at line 132, `gear_engine.shift_down()` at line 134; plain `def on_notify` confirmed (not async) |
| `click.py constants` | `docs/click-ble-spike.md` confirmed values | values copied verbatim | WIRED | All three UUIDs match spike doc; `CLICK_NOTIFY_MSG_TYPE = 0x37` matches research; `cryptography` added per spike decision |

### Plan 05-03 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/engine/main.py` | `engine.input.click.run_click_shifter` | `asyncio.create_task` with exception safety | WIRED | Line 29: import present; line 187: `click_task = asyncio.create_task(run_click_shifter(...), name="click_shifter")` |
| `click.py on_state_change callback` | `broadcast_queue.put_nowait` | `_on_click_state_change` closure posts `{"type": "click_status", "connected": bool}` | WIRED | `_on_click_state_change` at line 108; builds `click_status` dict; uses drop-oldest `QueueFull` guard; wired into `run_click_shifter` at line 191 |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| GEAR-03 | 05-01, 05-02, 05-03, 05-04 | Zwift Click BLE → shift signals via reverse-engineered characteristic | AUTOMATED VERIFIED / HARDWARE PENDING | Implementation complete and unit-tested; hardware sign-off not yet recorded; REQUIREMENTS.md marks as `[x]` but the 05-04 SUMMARY explicitly notes `requirements-completed: []` pending user sign-off |

Note: `REQUIREMENTS.md` traceability table already shows `GEAR-03 | 5 | Complete`, but this was written optimistically. The automated code path is verified; the hardware confirmation test (`docs/phase-05-verification.md`) has not been signed.

---

## Anti-Patterns Found

No blockers. Scan of `click.py` and `main.py`:

| File | Pattern | Severity | Finding |
|------|---------|----------|---------|
| `engine/engine/input/click.py` | `asyncio.run()` | Blocker check | Not present — clean |
| `engine/engine/input/click.py` | `async def on_notify` | Blocker check | Not present — `on_notify` is plain `def` as required |
| `engine/engine/input/click.py` | TODO/FIXME | Info | `_handshake_encrypted` docstring notes "Full AES-CCM decryption of notify stream deferred to 05-03" — this is a design note, not a code stub. The ECDH key exchange IS wired; the unresolved question is whether firmware decryption is fully handled end-to-end (requires hardware test to confirm) |
| `engine/engine/main.py` | TODO/FIXME | None | Clean |
| `docs/phase-05-verification.md` | Unfilled placeholders | Warning | All Status cells blank; `Signed:` line unpopulated — document is a checklist awaiting hardware run |

The ECDH handshake in `_handshake_encrypted` writes the key exchange payload to `SYNC_RX_CHAR_UUID` but does NOT complete the receive side (waiting for Click's public key response + deriving shared AES-CCM key). This means the current implementation performs a one-way ECDH write and then subscribes to notifications expecting decrypted `0x37` frames. Whether the Click accepts this and produces decryptable button frames is the core open question that only hardware testing can answer. This is not a code bug — it is the intended partial implementation scope — but it is the main risk to full GEAR-03 acceptance.

---

## Human Verification Required

### 1. Hardware end-to-end: Click button shifts gear in cockpit

**Test:** Power on KICKR Core and Zwift Click. Run `cd engine && uv run python -m engine`. Wait for "Zwift Click connected and notifying" log. Press Click PLUS 5 times slowly. Observe gear number in cockpit.
**Expected:** Each press increments gear by 1; gear caps at 10; no crash.
**Why human:** Requires physical BLE hardware. Also validates that the ECDH handshake skeleton in `_handshake_encrypted` is sufficient for firmware 1.1.0 to produce decryptable `0x37` button frames — this is unresolved in the automated tests.

### 2. No-Click resilience (fallback gate)

**Test:** Power OFF the Click. Run the engine. Use keyboard k/j to shift. Observe engine log.
**Expected:** Telemetry flows, keyboard shifts work, engine logs "Zwift Click not found; retrying" but no traceback or crash.
**Why human:** Keyboard fallback and log behavior require live session observation.

### 3. Clean shutdown (fallback gate)

**Test:** With or without Click connected, press Ctrl-C. Observe shutdown time and KICKR state.
**Expected:** Engine shuts down within 15 s; KICKR not stuck at last grade (FTMS Stop + Reset issued).
**Why human:** Shutdown timing and KICKR trainer state require physical hardware observation.

### 4. Debounce on real hardware

**Test:** From gear 5, press PLUS 5 times as fast as physically possible (~300 ms total). Record actual gear value.
**Expected:** Gear advanced by fewer than 5 (100 ms debounce window → ~3 shifts maximum).
**Why human:** Debounce is tested with fake clock in unit tests; real-world BLE notification timing may differ.

### 5. Disconnect/reconnect mid-ride

**Test:** While engine running with Click connected, power off the Click. Wait 5 s. Power it back on. Observe engine log and WS messages.
**Expected:** `click_status: false` message on disconnect; engine stable; `click_status: true` on reconnect within ~60 s.
**Why human:** Requires live BLE disconnect event and reconnect scan cycle.

### 6. Fill and sign docs/phase-05-verification.md

**Test:** After running the 8 hardware tests, fill the Status column (PASS/FAIL/SKIP), add observations, and sign with name + date.
**Expected:** No remaining `PASS / FAIL / SKIP` placeholders in status column; no `<user name>` or `<YYYY-MM-DD>` placeholders.
**Why human:** This is the formal sign-off document for GEAR-03.

---

## Gaps Summary

No automated code gaps. All implementation artifacts exist, are substantive, and are wired correctly:

- `engine/engine/input/click.py` — complete `ClickShifter` with ECDH skeleton, debounce, state callback
- `engine/engine/main.py` — `click_task` spawned and included in shutdown gather
- `engine/tests/input/test_click.py` — 11 tests, all passing
- Full suite: 110 tests GREEN
- Import smoke test: passes

The single outstanding item is the hardware sign-off in `docs/phase-05-verification.md`. All status cells are unfilled; the document has not been run or signed. Until the user runs the 8 hardware tests and signs, GEAR-03 cannot be formally closed.

Per ROADMAP.md design note: "Phase 5 = research spike; keyboard is permanent fallback — can slip without blocking shippable product." If hardware testing is deferred, the phase should be marked partially complete with keyboard fallback as the production shifter.

---

_Verified: 2026-04-28_
_Verifier: Claude (gsd-verifier)_
