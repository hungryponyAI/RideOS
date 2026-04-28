---
phase: 05-zwift-click-integration
plan: "04"
subsystem: hardware-verification
tags: [click, ble, hardware, verification, gear-engine]

requires:
  - phase: "05-03"
    provides: "click_task wired into main.py; click_status WS message; 110 tests GREEN"
  - phase: "05-02"
    provides: "ClickShifter implementation with ECDH handshake skeleton; 11 unit tests"
  - phase: "05-01"
    provides: "Hardware-confirmed BLE protocol doc (click-ble-spike.md)"
provides:
  - "docs/phase-05-verification.md hardware sign-off checklist (8 hardware tests)"
  - "Pending human sign-off to close GEAR-03"
affects:
  - "REQUIREMENTS.md — GEAR-03 pending hardware verification"

tech-stack:
  added: []
  patterns:
    - "Hardware verification checklist format matching phase-04-verification.md cadence"

key-files:
  created:
    - "docs/phase-05-verification.md"
  modified: []

key-decisions:
  - "Verification doc pre-populated with engine commit hash at checklist creation time (51ab8ca)"
  - "Phase 5 is a research spike — deferral acceptable per ROADMAP design note; keyboard fallback is permanent production shifter"
  - "Fallback gates (Tests 1, 6, 8) are hard gates — phase cannot ship if those fail even with Click tests passing"

requirements-completed: []  # GEAR-03 stays pending until human signs off

duration: ~2m
completed: 2026-04-28
---

# Phase 5 Plan 4: Hardware Verification Checklist Summary

**Hardware verification checklist for Zwift Click end-to-end integration created and committed; awaiting user to run 8 hardware tests on real KICKR + Click rig and sign off GEAR-03.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-28T04:47:24Z
- **Completed:** 2026-04-28T04:49:00Z
- **Tasks:** 1 (checkpoint:human-verify — checklist created, human sign-off pending)
- **Files modified:** 1

## Accomplishments

- Created `docs/phase-05-verification.md` with exact skeleton specified in plan
- Pre-populated engine commit hash (`51ab8ca7ea351df0500e91b14b938cf7d0c09894`) — no placeholder remaining
- 8 hardware test rows cover: no-Click resilience, BLE connect on startup, plus/minus button shifts (5x), debounce burst, keyboard fallback with Click connected, mid-ride disconnect/reconnect, and clean shutdown
- Automated acceptance check passes: file exists, `## Sign-off` heading present, exactly 8 `PASS / FAIL / SKIP` rows, real commit hash embedded

## Task Commits

1. **Task 1: Hardware verification checklist** - `6d98056` (feat — `docs/phase-05-verification.md` created)

**Plan metadata:** pending (will be added after human sign-off and state updates)

## Files Created/Modified

- `/Users/partydj/Desktop/Projekte/RideOS/docs/phase-05-verification.md` — 8-test hardware verification checklist; user fills PASS/FAIL/SKIP and signs to close GEAR-03

## Decisions Made

None — plan executed exactly as written. File skeleton is verbatim from the plan's `<action>` block.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Hardware verification required.**

The user must run the following 8 tests in order on the real Zwift Click + KICKR Core rig:

1. Engine boots without Click present (no-Click resilience)
2. Engine connects to Click on startup (within 30 s)
3. Plus button shifts up (5 presses; gear caps at 10)
4. Minus button shifts down (5 presses; gear floors at 1)
5. Debounce on rapid plus burst (5 presses in ~300 ms — document actual shift count)
6. Keyboard k/j fallback works while Click is connected
7. Click disconnect mid-ride → engine stable → reconnects when powered back on
8. Clean Ctrl-C shutdown within 15 s; KICKR not stuck at last grade

**Pre-flight before hardware tests:**
```bash
cd engine && uv run pytest tests/ -q   # must exit 0
```

**Resume signals:**
- `"phase 05 verified"` with PASS/FAIL/SKIP summary → STATE.md marks GEAR-03 complete, Phase 5 closed
- `"phase 05 deferred: <reason>"` → STATE.md records partial state; keyboard fallback remains the production shifter; ROADMAP.md notes the deferral

**Verification doc location:** `docs/phase-05-verification.md`

## Pass/Fail/Skip Counts (to be filled after sign-off)

| Outcome | Count |
|---------|-------|
| PASS | — |
| FAIL | — |
| SKIP | — |

Phase 5 status: **PENDING HARDWARE SIGN-OFF**

## GEAR-03 Acceptance Status

- [ ] Full success: All 8 tests PASS — GEAR-03 verified on real hardware, Phase 5 closed
- [ ] Acceptable partial: Tests 1, 6, 8 PASS (fallback safety); rest SKIP with deferral reason

GEAR-03 requirement stays `[ ]` in REQUIREMENTS.md until user signs the verification doc.

## Next Phase Readiness

- Phase 5 is the final planned phase (v1.0 milestone)
- If GEAR-03 deferred: keyboard fallback is production-ready; project ships without Click support
- If GEAR-03 accepted: cockpit Click indicator (click_status UI rendering) is a v1.x candidate (was explicitly deferred from Phase 5 scope — cockpit only needs to receive the WS message, not render it, for GEAR-03 sign-off)
- Follow-up gap-closure candidate: cockpit `click_status` indicator component (render connected/disconnected state in the cockpit UI; currently the WS message is broadcast but the UI ignores it)

---
*Phase: 05-zwift-click-integration*
*Completed: 2026-04-28*
