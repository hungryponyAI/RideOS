---
phase: 03-websocket-bridge-cockpit-ui
plan: "04"
subsystem: ui
tags: [react, websocket, typescript, python, asyncio, gear-shifting]

requires:
  - phase: 03-websocket-bridge-cockpit-ui
    provides: WS broadcast server + React cockpit with useTelemetry hook

provides:
  - Bidirectional WS: browser J/K keypresses shift gears via engine
  - engine/engine/main.py passes gear_engine to broadcast_loop
  - useTelemetry exports sendMessage for outbound WS messages
  - Connection banner waits for first telemetry (not just WS open)
  - "connected" status bridges WS open and first telemetry arrival

affects:
  - phase-04-gpx (will send grade updates via same WS channel)
  - phase-05-zwift-click (will replace keyboard with BLE signals)

tech-stack:
  added: []
  patterns:
    - "WS bidirectional: _handler async-for loop drains inbound messages; gear_engine injected via functools.partial"
    - "Banner UX: onopen -> connected (amber banner), onmessage -> live (banner hides) — no false 'live' on socket open"
    - "sendMessage: useCallback wrapping ws.readyState === OPEN guard, stable ref via wsRef"

key-files:
  created: []
  modified:
    - engine/engine/ws/server.py
    - engine/engine/main.py
    - ui/src/hooks/useTelemetry.ts
    - ui/src/App.tsx
    - ui/src/types/telemetry.ts
    - engine/tests/ws/test_server.py

key-decisions:
  - "ConnectionStatus gains 'connected' variant: WS open but no telemetry yet — banner stays amber, hides only on first message"
  - "gear_engine defaults to None in broadcast_loop; inbound messages silently ignored when None (backward-compatible)"
  - "sendMessage useCallback depends on [] (not wsRef) — wsRef is mutable ref, not reactive; readyState guard replaces dependency"

patterns-established:
  - "Inbound WS handler: async for raw in ws, json.loads, type dispatch — no queue, direct GearEngine call"
  - "Banner status flow: connecting -> connected (onopen) -> live (first onmessage) -> disconnected (onclose)"

requirements-completed:
  - UI-01

duration: 2min
completed: "2026-04-20"
---

# Phase 3 Plan 04: Gap Closure — Browser Gear Shifts + Banner Fix Summary

**Browser J/K keypresses now shift virtual gears via bidirectional WebSocket, and the connection banner correctly waits for first telemetry data before hiding**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T18:25:24Z
- **Completed:** 2026-04-20T18:27:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- GAP-03-01 closed: J/K keys in browser send `gear_shift` messages over WS to engine; engine dispatches `shift_up/shift_down` on `GearEngine`
- GAP-03-02 closed: `onopen` sets `"connected"` (banner stays amber), `onmessage` sets `"live"` (banner hides only after real data arrives)
- `KeyboardShifter` (terminal stdin) preserved untouched as permanent fallback
- 83 engine tests pass; 6 WS server tests pass including 2 new inbound message tests

## Task Commits

1. **Task 1: Engine WS bidirectional + browser gear shift listener** - `9d0b0d6` (feat)
2. **Task 2: Engine WS server test update for inbound messages** - `a2c20ed` (test)

## Files Created/Modified

- `engine/engine/main.py` - Pass `gear_engine=gear_engine` to `broadcast_loop`
- `engine/engine/ws/server.py` - Already had bidirectional handler (pre-implemented in gap closure plan setup)
- `ui/src/hooks/useTelemetry.ts` - Added `sendMessage` export; `onopen` -> `"connected"`, `onmessage` -> `"live"`
- `ui/src/App.tsx` - Added `useEffect` keydown listener sending `gear_shift` via `sendMessage`
- `ui/src/types/telemetry.ts` - Added `"connected"` to `ConnectionStatus` union
- `engine/tests/ws/test_server.py` - Added `test_inbound_gear_shift` and `test_inbound_no_gear_engine`

## Decisions Made

- Added `"connected"` status to `ConnectionStatus` union (not in original plan spec) — required for TypeScript to accept `setStatus("connected")` in `onopen`. `ConnectionBanner` naturally shows amber for any non-`"live"` state, so behavior is correct without further changes.
- `server.py` `_handler` and `broadcast_loop` already had `gear_engine` parameter from a prior partial implementation; only `main.py` was missing the wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added "connected" to ConnectionStatus union**
- **Found during:** Task 1 (useTelemetry.ts modification)
- **Issue:** Plan said set `"connected"` on `onopen` but `ConnectionStatus` type only had `"connecting" | "live" | "disconnected" | "reconnecting"` — TypeScript would reject the assignment
- **Fix:** Added `"connected"` to the union in `ui/src/types/telemetry.ts`
- **Files modified:** `ui/src/types/telemetry.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `9d0b0d6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing type variant)
**Impact on plan:** Essential for TypeScript correctness. No scope creep.

## Issues Encountered

`server.py` was already partially pre-implemented with the `gear_engine` parameter and bidirectional `_handler` — only `main.py` needed updating. This shortened Task 1 significantly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 fully complete: WS bridge bidirectional, cockpit UI renders all 7 components, gear shifting works from browser AND terminal
- Ready for Phase 4: GPX Route Integration (grade values will flow through existing `broadcast_queue` and `gear_engine.effective_grade`)
- Zwift Click BLE (Phase 5) will replace keyboard with same `gear_shift` WS message format — interface is already in place

---
*Phase: 03-websocket-bridge-cockpit-ui*
*Completed: 2026-04-20*
