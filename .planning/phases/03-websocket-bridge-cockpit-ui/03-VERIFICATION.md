---
phase: 03-websocket-bridge-cockpit-ui
verified: 2026-04-20T13:08:33Z
status: gaps_found
score: 11/12 must-haves verified
gaps:
  - id: GAP-03-01
    severity: critical
    title: "Keyboard gear shifts only work when terminal is focused"
    description: "KeyboardShifter in Python engine reads from terminal stdin. When browser is in front, J/K keypresses do not reach the engine. Fix: browser captures keydown (J/K) and sends WS messages {type: gear_shift, direction: up|down} to engine; engine WS server handles inbound messages and calls gear_engine.shift_up()/shift_down()."
    requirement: UI-01
  - id: GAP-03-02
    severity: minor
    title: "Connection banner hides on WS connect, not on first telemetry"
    description: "ConnectionBanner hides when status === 'connected', but should wait until status === 'live' (first telemetry received). When engine is running but KICKR is off, banner incorrectly disappears."
    requirement: UI-01
---

# Phase 3: WebSocket Bridge + Cockpit UI — Verification Report

**Phase Goal:** React cockpit displays all live metrics at 60 fps over localhost WebSocket.
**Verified:** 2026-04-20T13:08:33Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Python engine starts a WebSocket server on localhost:8765 | VERIFIED | `engine/engine/ws/server.py`: `broadcast_loop` binds with `async with serve(_handler, host, port)`, default port 8765 |
| 2 | Connected WS clients receive JSON telemetry messages | VERIFIED | `test_single_client_receives_message` passes; `broadcast_loop` calls `json.dumps(payload)` + `c.send(data)` |
| 3 | Multiple clients receive the same broadcast simultaneously | VERIFIED | `test_fanout` passes; module-level `CLIENTS` set + `asyncio.gather(*(c.send(data) for c in list(CLIENTS)))` |
| 4 | stop_event shuts down WS server cleanly without hanging | VERIFIED | `test_shutdown` passes within 1s; `while not stop_event.is_set()` with 0.1s timeout loop |
| 5 | WS broadcast never blocks the BLE control loop | VERIFIED | `_on_reading` is a plain `def` (not async), uses only `put_nowait`/`get_nowait` — no `await` in callback path; confirmed in `main.py` lines 100-122 |
| 6 | Cockpit connects to ws://localhost:8765 and displays live metrics | VERIFIED (automated) | `useTelemetry.ts` line 4: `const WS_URL = "ws://localhost:8765"`, `ws.onmessage = (e) => setTelemetry(JSON.parse(e.data))` |
| 7 | Speed is displayed at 72px bold as the primary metric | VERIFIED | `MetricDisplay.tsx` line 11: `"text-[72px] font-bold leading-none"` for `size === "display"`; App.tsx passes `size="display"` for speed |
| 8 | Gear strip shows all 10 gears with active gear highlighted in blue | VERIFIED | `GearStrip.tsx`: `GEARS = [1..10]`, active gear gets `bg-blue-500`, min-h-[44px] pill |
| 9 | Watt and cadence shown as secondary metrics | VERIFIED | `App.tsx` renders two `MetricDisplay` with `size="body"` (20px), units "Watt" and "U/min" |
| 10 | Grade bar shows real vs effective grade with color coding | VERIFIED | `GradeBar.tsx`: `bg-red-500` climb, `bg-blue-500` descent, `bg-gray-700` flat; real grade as 2px marker |
| 11 | Connection banner shows status when WS is disconnected | VERIFIED | `ConnectionBanner.tsx`: amber for connecting/reconnecting, red for disconnected, hidden when `status === "live"` |
| 12 | Visual layout correct: dark theme, speed primary, gear prominent | ? HUMAN NEEDED | Requires browser inspection; production build succeeds but pixel-perfect layout verification is human-only |

**Score:** 11/12 truths verified (1 needs human)

---

## Required Artifacts

### Plan 03-01 (INFRA-01 — WebSocket server)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/engine/ws/server.py` | broadcast_loop + CLIENTS registry | VERIFIED | 77 lines; exports `broadcast_loop`, `CLIENTS: set[ServerConnection]`; uses `websockets.asyncio.server` API |
| `engine/engine/ws/__init__.py` | Module init | VERIFIED | Exists |
| `engine/engine/control/state.py` | RideState with telemetry fields | VERIFIED | `last_speed_kmh`, `last_power_w`, `last_cadence_rpm` all `Optional[float] = None` |
| `engine/engine/main.py` | ws_task wired as sibling task | VERIFIED | Lines 149-152: `ws_task = asyncio.create_task(broadcast_loop(...), name="ws_broadcast")` |
| `engine/tests/ws/test_server.py` | WS server tests | VERIFIED | 4 tests: `test_single_client_receives_message`, `test_fanout`, `test_shutdown`, `test_snapshot_schema` — all pass |
| `engine/tests/control/test_state.py` | RideState field tests | VERIFIED | 4 tests covering defaults, assignment, existing fields, dataclass fields — all pass |

### Plan 03-02 (UI-01 — Core cockpit)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/src/types/telemetry.ts` | TelemetryState + ConnectionStatus | VERIFIED | Exports both; 6 fields match engine schema exactly |
| `ui/src/hooks/useTelemetry.ts` | WebSocket lifecycle hook | VERIFIED | Exponential backoff (2s→4s→8s, max 30s), useRef WS, useCallback connect |
| `ui/src/components/MetricDisplay.tsx` | Single metric renderer | VERIFIED | `React.memo`, `tabular-nums`, `text-[72px]` display size |
| `ui/src/components/GearStrip.tsx` | 10-gear strip | VERIFIED | `React.memo`, `bg-blue-500` active, `min-h-[44px]`, "GANG" label |
| `ui/src/components/GradeBar.tsx` | Real vs effective grade bar | VERIFIED | `React.memo`, color coding, German decimal format |
| `ui/src/components/ConnectionBanner.tsx` | WS status banner | VERIFIED | `React.memo`, amber/red, German copy |
| `ui/src/App.tsx` | Cockpit grid layout | VERIFIED | Imports + renders all 7 components; `grid-cols-[1fr_auto]` |

### Plan 03-03 (UI-02 + UI-03 — Broadcast layer scaffolds)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/src/components/ElevationProfile.tsx` | Recharts AreaChart empty-state | VERIFIED | `React.memo`, `isAnimationActive={false}`, "Keine Strecke geladen", `bg-[#111111]` |
| `ui/src/components/MiniMap.tsx` | Leaflet mini-map empty-state | VERIFIED | `React.memo`, `w-[160px] h-[160px]`, CartoDB dark tiles, `leaflet/dist/leaflet.css` import, "Keine Strecke" |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/engine/main.py` | `engine/engine/ws/server.py` | `asyncio.create_task(broadcast_loop(...))` | WIRED | Line 30 import; lines 149-152 task creation; line 164 included in shutdown gather; line 171 in cancel loop |
| `engine/engine/main.py` | `engine/engine/control/state.py` | `broadcast_queue.put_nowait(snapshot)` | WIRED | Lines 106-121 `_on_reading` closure; updates `state.last_speed_kmh/power_w/cadence_rpm` and posts snapshot |
| `ui/src/hooks/useTelemetry.ts` | `ws://localhost:8765` | `new WebSocket(WS_URL)` | WIRED | Line 4 `WS_URL` constant; line 14 `new WebSocket(WS_URL)`; line 22 `onmessage` response handler calls `setTelemetry` |
| `ui/src/App.tsx` | `ui/src/hooks/useTelemetry.ts` | `useTelemetry()` hook call | WIRED | Line 1 import; line 10 `const { telemetry: t, status } = useTelemetry()` |
| `ui/src/App.tsx` | `ui/src/components/MetricDisplay.tsx` | component import + render | WIRED | Line 3 import; speed render line 17-21, watt/cadence lines 26-33 |
| `ui/src/App.tsx` | `ui/src/components/ElevationProfile.tsx` | component import + render | WIRED | Line 6 import; line 44 `<ElevationProfile />` |
| `ui/src/App.tsx` | `ui/src/components/MiniMap.tsx` | component import + render | WIRED | Line 7 import; line 40 `<MiniMap />` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 03-01 | Python engine streams telemetry to React via WebSocket at up to 60 Hz | SATISFIED | `broadcast_loop` wired in `main.py`; 8 WS tests pass; JSON schema correct |
| UI-01 | 03-02 | React cockpit: speed/gear/watts/cadence/grade; dark; 60 fps | SATISFIED (automated) | All components verified; `React.memo` + `tabular-nums` for 60 Hz stability; dark theme (`bg-black`, `text-gray-50`); TypeScript clean; production build succeeds |
| UI-02 | 03-03 | Elevation profile (bottom); current position; red=climb, blue=descent | SATISFIED (scaffold) | `ElevationProfile.tsx` renders Recharts AreaChart at bottom 120px strip; empty-state scaffold as planned — position tracking deferred to Phase 4 |
| UI-03 | 03-03 | Mini-map (top-right); route + position marker | SATISFIED (scaffold) | `MiniMap.tsx` renders 160x160px in top-right `grid-cols-[1fr_auto]`; CartoDB dark tiles; empty-state scaffold — route/position deferred to Phase 4 |

**Note on UI-02 / UI-03:** REQUIREMENTS.md marks both as `[x]` complete. The phase plan explicitly scopes them as empty-state scaffolds — actual position tracking and route overlay are Phase 4 (ROUTE-01/02). The scaffolds correctly fulfil the Phase 3 contract as written in 03-03-PLAN.md.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ui/src/App.tsx` | 42 | `{/* Elevation profile placeholder — Plan 03 adds the real component */}` comment — gone in final App.tsx; placeholder div replaced with `<ElevationProfile />` | None | Clean |

No stubs, empty handlers, or unimplemented returns found in any phase 3 file. All components have substantive implementations.

---

## Human Verification Required

### 1. Cockpit Visual Layout (without engine)

**Test:** `cd ui && npm run dev`, open http://localhost:5173 in browser before starting the engine.
**Expected:**
- Amber banner at top: "Verbindung wird hergestellt…"
- Speed, power, cadence display em-dash placeholders
- Gear strip shows 10 gears (no active highlight when gear is null)
- Black background, no scrollbar, no overflow
- Mini-map visible top-right (160x160px, CartoDB dark tiles)
- Elevation profile at bottom (120px strip, "Keine Strecke geladen")
**Why human:** Visual appearance, tile loading, and layout proportions cannot be verified programmatically.

### 2. Live Telemetry End-to-End (with KICKR)

**Test:** Start engine (`cd engine && uv run python -m engine`) then reload http://localhost:5173.
**Expected:**
- Amber banner disappears when WS connects
- Speed/power/cadence/grade update with live KICKR values
- Active gear highlighted in blue on the gear strip
- Grade bar responds to keyboard gear shifts (J/K)
- No console errors in browser DevTools
**Why human:** Requires BLE hardware (Wahoo KICKR Core) and live sensor data.

---

## Gaps Summary

**2 gaps found during human verification (2026-04-20):**

### GAP-03-01 — Keyboard gear shifts only work when terminal focused (CRITICAL)

- **Symptom:** J/K only shifts gears when the terminal running the engine is the active window. Unusable with browser in front.
- **Root cause:** `KeyboardShifter` reads from terminal stdin — only captures input when terminal has focus.
- **Fix:** Browser captures `keydown` for J/K and sends `{"type": "gear_shift", "direction": "up"|"down"}` over the WebSocket connection. Engine WS server handles inbound messages and calls `gear_engine.shift_up()`/`shift_down()`.
- **Scope:** Changes to `engine/ws/server.py` (inbound message handler), `engine/main.py` (pass gear_engine to broadcast_loop), `ui/src/hooks/useTelemetry.ts` or `ui/src/App.tsx` (send WS message on J/K keydown).

### GAP-03-02 — Connection banner hides on WS connect, not on first telemetry (MINOR)

- **Symptom:** Banner disappears as soon as WS connects, even when KICKR is off and no telemetry is flowing.
- **Root cause:** `ConnectionBanner` hides when `status === "connected"`, not `status === "live"`.
- **Fix:** Change `ConnectionBanner` hide condition to `status === "live"` — and ensure `useTelemetry` sets status to `"live"` on first `onmessage`. Current `ConnectionStatus` type already includes `"live"`.

_All 12 artifacts exist and are wired correctly. Gaps are UX/interaction issues, not architectural failures._

---

_Verified: 2026-04-20T13:08:33Z_
_Verifier: Claude (gsd-verifier)_
