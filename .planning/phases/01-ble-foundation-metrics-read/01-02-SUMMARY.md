---
phase: 01-ble-foundation-metrics-read
plan: 02
subsystem: ble
tags: [ftms, parser, indoor-bike-data, struct, dataclass, pytest]

# Dependency graph
requires:
  - phase: 01-ble-foundation-metrics-read
    plan: 01
    provides: engine/ uv scaffold, IBD byte fixtures in conftest.py, xfail(strict) parser test stubs
provides:
  - IndoorBikeData frozen dataclass (speed_kmh, cadence_rpm, power_watts)
  - parse_indoor_bike_data(data: bytes | bytearray) -> IndoorBikeData
  - Locked encoding contract for three FTMS gotchas (inverted speed flag, cadence /2, power signed int16)
  - Green test suite (5/5 passed, zero xfail/skip)
affects:
  - 01-03 connect-subscribe (feeds notification bytes into this parser)
  - 01-04 reconnect loop (consumes parsed IndoorBikeData)
  - phase 02 control-loop (reads power/speed from parser output)
  - phase 03 websocket-bridge (serializes IndoorBikeData fields to cockpit UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure parser module: no IO, no asyncio, no bleak — deterministic bytes -> dataclass"
    - "Named flag masks as module-private constants (_FLAG_*) for readability over magic numbers"
    - "Frozen dataclass as the single typed boundary between BLE layer and engine"
    - "struct.unpack_from with explicit offset tracking per optional field"

key-files:
  created:
    - "engine/engine/ftms/__init__.py (package marker)"
    - "engine/engine/ftms/parsers.py (IndoorBikeData + parse_indoor_bike_data)"
  modified:
    - "engine/tests/ftms/test_parsers.py (removed xfail markers and _parse indirection)"

key-decisions:
  - "struct format <h (signed int16) for power — critical for braking / negative watts"
  - "Inverted bit-0 speed flag encoded as not (flags & _FLAG_MORE_DATA_SPEED_ABSENT) with self-documenting constant name"
  - "Bits 7..12 (avg power, energy, HR, MET, elapsed, remaining) explicitly ignored; parser stops after bit 6"
  - "Accept bytes | bytearray via bytes(data) coercion — bleak callbacks deliver bytearray, tests pass bytes"

patterns-established:
  - "Pattern: bytes-in, frozen-dataclass-out parser — no BLE dependency, trivially unit-testable"
  - "Pattern: named flag masks (_FLAG_INST_POWER = 0x0040) instead of inline 0x40 literals"
  - "Pattern: RED-GREEN handoff across plans via xfail(strict=True) stubs in wave N-1"

requirements-completed: [BLE-02]

# Metrics
duration: 3min
completed: 2026-04-13
---

# Phase 1 Plan 02: FTMS Indoor Bike Data Parser Summary

**Pure `bytes -> IndoorBikeData` parser for FTMS characteristic 0x2AD2 with hardened encoding rules for inverted speed flag, cadence /2 scaling, and signed int16 power.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-13T04:41:30Z
- **Completed:** 2026-04-13T04:44:49Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 rewritten)

## Accomplishments
- `IndoorBikeData` frozen dataclass locks the downstream contract for speed/cadence/power across the rest of the stack
- Three FTMS encoding gotchas each protected by a dedicated passing test: inverted bit-0 speed flag, cadence-raw/2, power as signed int16
- Test suite is now fully green (5/5 passed, zero xfail / skip) — the RED→GREEN handoff from plan 01 is complete
- Parser is fully hardware-free: no bleak, no asyncio, no IO — consumes `bytes | bytearray`, returns a dataclass

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement parse_indoor_bike_data + IndoorBikeData dataclass** — `851e529` (feat)
2. **Task 2: Flip xfail to expected-pass and verify test suite is green** — `7781272` (test)

_Note: Plan 01 already shipped the RED test stubs, so this plan had a single GREEN commit rather than a separate test+feat pair._

**Plan metadata:** pending (docs commit captures SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `engine/engine/ftms/__init__.py` — Package marker for the ftms subpackage (empty).
- `engine/engine/ftms/parsers.py` — `IndoorBikeData` dataclass + `parse_indoor_bike_data()`. Handles flags bits 0, 1, 2, 3, 4, 5, 6 (speed through inst power). Bits 7–12 ignored per Phase 1 scope.
- `engine/tests/ftms/test_parsers.py` — Removed all five `@pytest.mark.xfail(strict=True)` decorators, dropped the `_parse()` lazy-import helper, moved to module-scope `from engine.ftms.parsers import parse_indoor_bike_data`.

## Parser Public API (locked for downstream plans)

```python
from engine.ftms.parsers import parse_indoor_bike_data, IndoorBikeData

@dataclass(frozen=True)
class IndoorBikeData:
    speed_kmh: Optional[float] = None   # 0.01 km/h raw, divided by 100
    cadence_rpm: Optional[float] = None # 0.5 rpm raw, divided by 2
    power_watts: Optional[int] = None   # signed int16, 1 W units

def parse_indoor_bike_data(data: bytes | bytearray) -> IndoorBikeData: ...
```

**Three locked encoding rules:**
1. **Inverted speed flag** — bit 0 of flags word: speed is present when the bit is CLEAR (most FTMS fields use the opposite convention).
2. **Cadence /2** — raw uint16 must be divided by 2 to get rpm (fixture: raw 241 → 120.5 rpm).
3. **Power signed int16** — struct format `<h`, not `<H`. Negative values are valid (e.g., braking / freewheel on KICKR Core).

## Decisions Made
- **`<h` signed format for power** — explicit in RESEARCH.md Pattern 3 and required by the `ibd_power_negative` fixture (-50 W).
- **Inverted speed flag encoded with a named constant** — `_FLAG_MORE_DATA_SPEED_ABSENT = 0x0001`, read as `if not (flags & _FLAG_MORE_DATA_SPEED_ABSENT)`. Comments call this gotcha out at the use site as well.
- **Drop avg/energy/HR/MET/elapsed/remaining fields (bits 7–12)** — out of scope for Phase 1. They are offset-skipped implicitly by stopping iteration after bit 6 (no bytes past that are read, since none of the plan's fixtures set those flags).
- **Accept `bytes | bytearray`** — bleak notification callbacks deliver `bytearray`; tests supply `bytes`. `bytes(data)` coercion handles both without branching.

## Deviations from Plan

None that required a plan change. One smoke-test command in the plan's `<acceptance_criteria>` (`bytes([0x04,0x00,0xF1,0x00])`) had a typo — it used flags=0x0004 (bit 0 clear → speed present), which is inconsistent with the `ibd_cadence_only_scaling` fixture in conftest.py (flags=0x0005 = bit 0 set + bit 2 set = speed absent + cadence present). The authoritative fixture is correct; I verified the parser against the actual fixture bytes (`flags=0x0005`) and the full pytest suite — both pass. No code change needed; the plan's inline smoke command was a documentation typo, not a parser bug.

**Total deviations:** 0 auto-fixes.
**Impact on plan:** None.

## Issues Encountered
- **Plan smoke-test typo (not a deviation):** The plan's `<acceptance_criteria>` CLI command used `bytes([0x04,0x00,0xF1,0x00])` (flags=0x0004). With bit 0 clear, the parser correctly tries to read speed at offset 2, so the 4-byte buffer under-runs — `struct.error: requires a buffer of at least 6 bytes`. This is **correct parser behavior**: the real cadence-only fixture uses flags=0x0005. Confirmed by running pytest against the `ibd_cadence_only_scaling` fixture — `120.5 rpm`, speed is `None`, test green.

## User Setup Required

None - no external service configuration required. Plan is hardware-free; real KICKR verification happens in plan 01-03 (`connect-subscribe`) which requires the user to run `scan.py` once for macOS Bluetooth permission.

## Next Phase Readiness
- **Ready for plan 01-03:** connect to KICKR, subscribe to the Indoor Bike Data characteristic, pipe `bytearray` notifications into `parse_indoor_bike_data()` and log the `IndoorBikeData` dataclass.
- **Contract is locked** — downstream plans (01-04 reconnect, phase 2 control loop, phase 3 WS bridge) can import `IndoorBikeData` with confidence that field shape won't drift.
- **No blockers.**

---
*Phase: 01-ble-foundation-metrics-read*
*Completed: 2026-04-13*

## Self-Check: PASSED

- Files verified: engine/engine/ftms/__init__.py, engine/engine/ftms/parsers.py, engine/tests/ftms/test_parsers.py, .planning/phases/01-ble-foundation-metrics-read/01-02-SUMMARY.md
- Commits verified: 851e529 (feat), 7781272 (test)
- Tests verified: `uv run python -m pytest tests/ -q` → 5 passed, 0 xfail / 0 skip / 0 error
