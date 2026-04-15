---
phase: 02-ftms-control-loop-virtual-gearing
plan: 01
subsystem: ble
tags: [ftms, bluetooth, python, pytest, control-point, byte-encoding]

# Dependency graph
requires:
  - phase: 01-ble-foundation-metrics-read
    provides: IndoorBikeData parser, hand-rolled stdlib-only module policy, pytest asyncio_mode=auto setup
provides:
  - FMCP_UUID + FMS_UUID constants (characteristic identifiers for FTMS write path)
  - OpCode enum (REQUEST_CONTROL, RESET, START_OR_RESUME, STOP_OR_PAUSE, SET_INDOOR_BIKE_SIMULATION_PARAMETERS, RESPONSE)
  - ResultCode enum (SUCCESS, NOT_SUPPORTED, INCORRECT_PARAMETER, OPERATION_FAILED, CONTROL_NOT_PERMITTED)
  - encode_request_control / encode_reset / encode_start_or_resume / encode_stop_or_pause — simple opcode encoders
  - encode_set_simulation_parameters — opcode 0x11 grade encoder (sint16 LE, 0.01% resolution, ±327.68% clamped)
  - ControlPointResponse frozen dataclass + parse_control_point_response — indication parser
  - Package markers: engine/engine/control/, engine/engine/gears/, engine/engine/input/
  - Test package markers: engine/tests/gears/, engine/tests/control/, engine/tests/input/
affects:
  - 02-02 (GearEngine imports from engine.gears)
  - 02-03 (FtmsController imports from engine.ftms.control_point, engine.control)
  - 02-04 (keyboard shifter imports from engine.input)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Hand-rolled stdlib-only encoder module matching Phase 1 parser style (no pycycling)
    - Frozen dataclass as typed parse result (ControlPointResponse mirrors IndoorBikeData pattern)
    - Grade encoding as sint16 LE with resolution 0.01% and symmetric clamping to ±327.68%
    - TDD RED→GREEN: failing ImportError test → minimal correct implementation

key-files:
  created:
    - engine/engine/ftms/control_point.py
    - engine/engine/control/__init__.py
    - engine/engine/gears/__init__.py
    - engine/engine/input/__init__.py
    - engine/tests/ftms/test_control_point.py
    - engine/tests/ftms/__init__.py
    - engine/tests/gears/__init__.py
    - engine/tests/control/__init__.py
    - engine/tests/input/__init__.py
  modified: []

key-decisions:
  - "Grade encoding: sint16 LE with resolution 0.01% → grade_i = round(grade_percent * 100), clamped to [-32768, 32767]"
  - "RESEARCH.md byte fixture for grade=-3.5 is a typo: '5e fe' is wrong; correct sint16 LE encoding of -350 is 'a2 fe'"
  - "encode_stop_or_pause(pause=False) → b'\\x08\\x01' (stop); pause=True → b'\\x08\\x02'"
  - "parse_control_point_response accepts bytes | bytearray via bytes(data) coercion — same pattern as IndoorBikeData parser"

patterns-established:
  - "Pattern: encode_* functions return bare bytes, no struct.pack — int.to_bytes for variable-width fields"
  - "Pattern: parse_* raises ValueError on malformed input (wrong header byte or truncated payload)"

requirements-completed: [BLE-03]

# Metrics
duration: 8min
completed: 2026-04-15
---

# Phase 2 Plan 01: FTMS Control Point Encoders + Package Markers Summary

**Hand-rolled FTMS Control Point write-path (5 opcode encoders + response parser) byte-locked under 15 pure-Python unit tests, plus 7 package markers enabling all downstream Phase 2 imports.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-15T00:00:00Z
- **Completed:** 2026-04-15T00:08:00Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 9

## Accomplishments

- Created `engine/engine/ftms/control_point.py` with full FTMS opcode 0x11 encoder, 4 simple opcode encoders, and response parser — all hand-rolled with no new dependencies
- Established 7 package markers (3 engine/ + 4 tests/) enabling Plans 02-02, 02-03, 02-04 to import from engine.control, engine.gears, engine.input
- 15 byte-fixture tests locked the wire format (grade=+5.0 → `11 00 00 f4 01 00 00`, clamping, malformed response handling); full suite grows from 17 to 32 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — write failing tests for control_point encoders and response parser** - `cd84ce4` (test)
2. **Task 2: GREEN — implement control_point.py so all Wave 0 tests pass** - `f968e0d` (feat)

**Plan metadata:** (committed with docs below)

_Note: TDD tasks have two commits (test → feat)_

## Files Created/Modified

- `/Users/partydj/Desktop/Projekte/RideOS/engine/engine/ftms/control_point.py` — FTMS Control Point encoders + response parser (the primary deliverable)
- `/Users/partydj/Desktop/Projekte/RideOS/engine/engine/control/__init__.py` — package marker for FtmsController (Plan 02-03)
- `/Users/partydj/Desktop/Projekte/RideOS/engine/engine/gears/__init__.py` — package marker for GearEngine (Plan 02-02)
- `/Users/partydj/Desktop/Projekte/RideOS/engine/engine/input/__init__.py` — package marker for keyboard shifter (Plan 02-04)
- `/Users/partydj/Desktop/Projekte/RideOS/engine/tests/ftms/test_control_point.py` — 15 byte-fixture tests (updated in GREEN to fix byte fixture typo)
- `/Users/partydj/Desktop/Projekte/RideOS/engine/tests/ftms/__init__.py` — test package marker
- `/Users/partydj/Desktop/Projekte/RideOS/engine/tests/gears/__init__.py` — test package marker
- `/Users/partydj/Desktop/Projekte/RideOS/engine/tests/control/__init__.py` — test package marker
- `/Users/partydj/Desktop/Projekte/RideOS/engine/tests/input/__init__.py` — test package marker

## Decisions Made

- Grade encoding uses `round(grade_percent * 100)` (sint16, resolution 0.01%) with symmetric clamping to `[-32768, 32767]` — matches FTMS v1.0 §4.16 spec
- `parse_control_point_response` raises `ValueError` on both empty input and wrong header byte (first byte != 0x80) — same defensive pattern as Phase 1 parser
- `bytes(data)` coercion at top of parse function handles `bytearray` from bleak without branching

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RESEARCH.md byte fixture typo in test_encode_grade_negative**
- **Found during:** Task 2 (GREEN — running tests against the implementation)
- **Issue:** RESEARCH.md and PLAN.md both stated `encode_set_simulation_parameters(-3.5)` should produce `b'\x11\x00\x00\x5e\xfe\x00\x00'` (= sint16 -418 LE), but the mathematically correct encoding of -350 (= -3.5 * 100) is `b'\x11\x00\x00\xa2\xfe\x00\x00'`
- **Fix:** Updated test fixture from `b'\x5e\xfe'` to `b'\xa2\xfe'` to match the correct sint16 LE encoding
- **Files modified:** `engine/tests/ftms/test_control_point.py`
- **Verification:** `encode_set_simulation_parameters(-3.5)` returns `b'\x11\x00\x00\xa2\xfe\x00\x00'`; verified via Python: `(-350).to_bytes(2, 'little', signed=True)` = `b'\xa2\xfe'`
- **Committed in:** f968e0d (Task 2 commit, test file updated alongside implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 — documentation/fixture bug)
**Impact on plan:** Correction necessary for mathematical correctness. The implementation is byte-for-byte per FTMS spec; only the test fixture in RESEARCH.md was wrong.

## Issues Encountered

- RESEARCH.md Pitfall 2 comment claims `-350 LE = 5e fe` but the correct 16-bit signed little-endian representation of -350 is `a2 fe`. The PLAN.md test behavior inherited this typo. Fixed by verifying against Python's `int.to_bytes` and correcting the test fixture.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `engine.ftms.control_point` API is locked and tested — Plans 02-02 and 02-03 can import directly
- All 7 package markers in place — `from engine.control import ...`, `from engine.gears import ...`, `from engine.input import ...` all resolve
- Phase 1's 17 tests unaffected; full suite at 32/32 green
- Plan 02-02 (GearEngine) can proceed immediately

---
*Phase: 02-ftms-control-loop-virtual-gearing*
*Completed: 2026-04-15*
