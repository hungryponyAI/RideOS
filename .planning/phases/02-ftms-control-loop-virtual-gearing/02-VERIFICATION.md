---
phase: 02-ftms-control-loop-virtual-gearing
verified: 2026-04-19T08:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "KICKR resistance changes with DEFAULT_GRADE=2.0 vs 0%"
    expected: "Felt resistance difference on the trainer at the two grade values"
    why_human: "Physical hardware feedback — cannot verify programmatically"
  - test: "k/j keys shift gear; gear + effective grade visible in RIDE log"
    expected: "RIDE | gear=N/10 factor=X real=2.0% eff=Y% log line updates after each keypress"
    why_human: "Live terminal I/O and real-time logging — requires hardware run"
  - test: "Ctrl-C → final log shows STOP + RESET opcodes; trainer returns to free-roll"
    expected: "Shutdown sequence logged; trainer resistance drops to unloaded"
    why_human: "Signal handler + BLE shutdown path — requires live trainer"
  - test: "Unplug/replug KICKR mid-ride → backoff log → reconnect → control loop resumes"
    expected: "Log shows BLE drop, exponential backoff sleeps, then re-handshake and 4 Hz writes resume"
    why_human: "Hardware event (BLE disconnect) required to trigger reconnect path"
---

# Phase 2: FTMS Control Loop + Virtual Gearing — Verification Report

**Phase Goal:** Engine writes simulated grade at 4 Hz under virtual gearing formula; first real ride.
**Verified:** 2026-04-19T08:00:00Z
**Status:** human_needed (all automated checks pass; 4 human smoke-test items remain)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | FTMS Control Point encoders encode correct bytes (BLE-03 foundation) | VERIFIED | `control_point.py` fully implemented; `encode_set_simulation_parameters(5.0)` → `b'\x11\x00\x00\xf4\x01\x00\x00'` byte-locked in 15 tests |
| 2 | `GearEngine.effective_grade = real_grade / factor` with 10-gear table (GEAR-01) | VERIFIED | `engine.py` implements `effective_grade(r) = r / self.factor`; `_FACTORS` tuple pinned; 13 tests including all-10-gears parametrize |
| 3 | Keyboard shifts gear via `k`/`j`/arrows; debounced at 100ms (GEAR-02) | VERIFIED | `keyboard.py` ESC state machine + debounce; `_last_shift_t = float("-inf")`; 8 hardware-free tests |
| 4 | `FtmsController.start()` runs REQUEST_CONTROL + START_OR_RESUME handshake; non-SUCCESS raises `FtmsControlError` | VERIFIED | `controller.py` lines 54-61; `_on_fmcp_indication` is plain `def` (not async); `write_gatt_char` uses `response=True` keyword; 4 handshake tests |
| 5 | `run_control_loop` ticks at 0.25s (4 Hz); skips write if `|new - last| < 0.05` AND within 1.0s keepalive | VERIFIED | `controller.py` lines 107-130; `_TICK_S=0.25`, `_EPSILON_PCT=0.05`, `_KEEPALIVE_S=1.0`; `test_tick_coalescing` verifies |
| 6 | `controller.shutdown()` → STOP (0x08 0x01) then RESET (0x01) in order; never raises | VERIFIED | `controller.py` lines 68-77; `test_shutdown_sequence` + `test_shutdown_never_raises` confirm order and error resilience |
| 7 | Shutdown in try/finally: mid-tick crash still sends STOP + RESET | VERIFIED | `test_shutdown_on_crash` asserts `sim_idx < stop_idx < reset_idx` |
| 8 | `reconnect_loop`: `controller.shutdown()` BEFORE `stop_indoor_bike_notify` (INFRA-02, Pitfall 6) | VERIFIED | `reconnect.py` lines 147-157; `test_control_loop_wired_and_shutdown_before_notify_stop` enforces order via `call_order` list |
| 9 | `main.py`: GearEngine + RideState + KeyboardShifter + reconnect_loop(ride_state=state) + gear_status_logger wired | VERIFIED | `main.py` lines 91-120; `DEFAULT_GRADE=2.0`; `shifter.stop()` in outer `finally`; all imports present |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `engine/engine/ftms/control_point.py` | FTMS encoders + response parser | VERIFIED | 92 lines; `OpCode`, `ResultCode`, 5 encoders, `ControlPointResponse`, `parse_control_point_response` |
| `engine/engine/gears/engine.py` | GearEngine dataclass | VERIFIED | 41 lines; `_FACTORS` tuple, `shift_up/down`, `effective_grade` |
| `engine/engine/input/keyboard.py` | KeyboardShifter with cbreak + add_reader | VERIFIED | 124 lines; ESC state machine, debounce, `_last_shift_t = float("-inf")` |
| `engine/engine/control/state.py` | RideState dataclass | VERIFIED | 20 lines; mutable `real_grade_percent` field |
| `engine/engine/control/controller.py` | FtmsController + run_control_loop | VERIFIED | 131 lines; all constants, plain-def indication callback, response=True keyword |
| `engine/engine/ble/reconnect.py` | Extended reconnect_loop with ride_state | VERIFIED | 177 lines; keyword-only Phase 2 params; INFRA-02 shutdown ordering |
| `engine/engine/main.py` | Full integration wiring | VERIFIED | 152 lines; all 6 components wired; DEFAULT_GRADE; shifter.stop() in finally |
| `engine/tests/conftest.py` | FakeBleakClient + 6 FMCP fixtures | VERIFIED | 167 lines; auto_success_for, queue_indication, writes list |
| `engine/tests/control/test_controller.py` | 11 controller + control loop tests | VERIFIED | Handshake, timeout, encoding, coalescing, grade change, shutdown ×3 |
| `engine/tests/ble/test_reconnect.py` | reconnect_loop tests including INFRA-02 wiring | VERIFIED | 5 tests; shutdown-before-notify ordering verified with call_order |
| `engine/README.md` | Phase 2 run section appended | VERIFIED | "## Run the engine (Phase 2)" section at line 49 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `run_control_loop` | `GearEngine.effective_grade` | `state.gear_engine.effective_grade(state.real_grade_percent)` | WIRED | `controller.py` line 119 — virtual gearing formula applied on every tick |
| `run_control_loop` | `FtmsController.set_simulation_grade` | `await controller.set_simulation_grade(grade)` | WIRED | `controller.py` line 127 |
| `FtmsController._send` | `write_gatt_char` | `response=True` keyword (Pitfall 7) | WIRED | `controller.py` line 94 — keyword form confirmed |
| `_on_fmcp_indication` | `asyncio.Future.set_result` | plain `def`, no `await` (Pitfall 3) | WIRED | `controller.py` line 81 — sync callback confirmed |
| `reconnect_loop` | `controller.shutdown()` before `stop_indoor_bike_notify` | try/finally ordering (Pitfall 6, INFRA-02) | WIRED | `reconnect.py` lines 147-157 — shutdown at 147, notify-stop at 155 |
| `main.py` | `reconnect_loop` | `ride_state=state` keyword arg | WIRED | `main.py` line 108 — Phase 2 control loop activated |
| `main.py` | `KeyboardShifter.stop()` | `finally` block | WIRED | `main.py` line 145 — tty always restored |
| `asyncio.wait` | `FIRST_COMPLETED` (stop_event + disconnected) | replaces bare `disconnected.wait()` | WIRED | `reconnect.py` line 128 — clean Ctrl-C during active connection |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| BLE-03 | 02-01, 02-03, 02-04 | Send simulated grade via FTMS simulation mode (Request Control + Start handshake, 4 Hz) | SATISFIED | Full handshake in `FtmsController.start()`; 4 Hz loop in `run_control_loop` with `_TICK_S=0.25`; byte-exact encoding locked in tests |
| GEAR-01 | 02-02 | 10-gear system: `effective_grade = real_grade / gear_factor` | SATISFIED | `GearEngine.effective_grade` implements formula exactly; 10-factor geometric table locked |
| GEAR-02 | 02-02, 02-04 | Keyboard shifts gear up/down during ride | SATISFIED | `KeyboardShifter` implements k/j/arrows with debounce; wired into `main.py` via `shifter.start()` / `shifter.stop()` |
| INFRA-02 | 02-04 | FTMS Stop + Reset on process exit/crash — trainer never stuck at last grade | SATISFIED | `controller.shutdown()` in try/finally in `reconnect_loop`; STOP before RESET order enforced; `test_shutdown_on_crash` proves crash path; `test_shutdown_never_raises` proves resilience |

Note: REQUIREMENTS.md marks INFRA-02 as "Pending (Plan 02-04)" in the traceability table — this appears to be a stale label. The 02-04 SUMMARY confirms completion and the code fully implements the guarantee. The traceability row should be updated to "Complete".

---

### Anti-Patterns Found

No anti-patterns detected across all 7 implementation files. Zero TODO/FIXME/PLACEHOLDER comments; no stub returns; no empty handlers.

Minor naming deviation: Plan 02-03 specifies `set_simulation_parameters` as the public method name; implementation uses `set_simulation_grade`. This is a documentation-only mismatch — functionality is identical and the underlying `encode_set_simulation_parameters` is correctly called. No blocker.

---

### Human Verification Required

#### 1. KICKR Resistance Change

**Test:** Start engine with `DEFAULT_GRADE = 2.0`, then edit to `0.0` and restart. Ride briefly on the trainer.
**Expected:** Measurable difference in pedaling resistance between 2% and 0% grade.
**Why human:** Physical sensation on real hardware — not testable programmatically.

#### 2. Keyboard Gear Shifting with Live Log

**Test:** Start engine connected to KICKR. Press `k` and `j` keys during a ride. Watch log output.
**Expected:** Each keypress produces a "RIDE | gear=N/10 factor=X real=2.0% eff=Y%" log line within 5 seconds. Gear number increments/decrements. Effective grade changes correspondingly.
**Why human:** Requires real tty + live asyncio loop; stdin fd behaviour differs in test environment.

#### 3. Ctrl-C Clean Shutdown

**Test:** Start engine connected to KICKR. Press Ctrl-C.
**Expected:** Log shows "FTMS STOP_OR_PAUSE" then "FTMS RESET" opcodes. Trainer resistance drops to free-roll (no resistance).
**Why human:** Signal handler + live BLE writes — cannot simulate trainer physical state.

#### 4. BLE Reconnect Mid-Ride

**Test:** Start engine. Unplug KICKR power mid-ride (or use BLE radio kill). Wait ~10s. Replug KICKR.
**Expected:** Log shows "BLE error ... backoff=1.0s", then "backoff=2.0s", then "Connecting to KICKR CORE", then "FTMS handshake complete; control loop may begin". Resistance resumes.
**Why human:** Requires physical BLE disconnect event.

---

### Gaps Summary

No gaps. All 9 automated truths verified, all 4 requirements satisfied, all key links confirmed wired. The only outstanding items are the 4 physical hardware smoke tests listed above — these require a connected KICKR Core and cannot be verified statically.

The full test suite passes: **73/73 tests green** (confirmed by `uv run pytest -x -q` in `engine/`).

---

_Verified: 2026-04-19T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
