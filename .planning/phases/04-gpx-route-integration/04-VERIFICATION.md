---
phase: 04-gpx-route-integration
verified: 2026-04-21T00:00:00Z
status: human_needed
score: 9/9 automated must-haves verified
human_verification:
  - test: "End-to-end ride on real KICKR Core with GPX"
    expected: "All 14 items in 04-05 how-to-verify checklist tick green: GPX loads, MiniMap draws, position marker advances, KICKR resistance follows grade, BLE reconnect freezes/resumes, route-end sets grade 0, negative-path error handled"
    why_human: "Physical trainer resistance and marker sync cannot be verified programmatically; confirmed via git commit 10bc639 'Phase 4 accepted — all 14 hardware verification items approved'"
    note: "Hardware verification was completed and signed off on 2026-04-22. Commit 10bc639 documents user approval of all 14 checklist items. Phase 4 marked complete in STATE.md and ROADMAP.md."
---

# Phase 4: GPX Route Integration — Verification Report

**Phase Goal:** Load a GPX route, track position as the rider moves, and feed grade into the FTMS resistance control loop — delivering an end-to-end guided ride on real hardware.
**Verified:** 2026-04-21
**Status:** human_needed (automated checks all pass; human hardware verification completed and signed off in commit 10bc639)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `load_gpx(path)` returns a frozen `RouteData` with parallel arrays (lats, lons, elevations_m, cum_dist_m, grades_pct) and a total_dist_m scalar | VERIFIED | `engine/engine/route/model.py` `@dataclass(frozen=True) class RouteData`; `loader.py` returns correct structure; smoke test: `RouteData 3 260.6`; FrozenInstanceError confirmed |
| 2 | Missing elevation tags coerced to 0.0 with a warning, no crash | VERIFIED | `loader.py` lines 61–67: checks `None` elevation, logs WARNING to `rideos.route`; test `test_missing_elevation_coerced_to_zero` passes |
| 3 | Per-segment raw grades smoothed with 5-point rolling mean and clamped to ±20.0% | VERIFIED | `loader.py` `_GRADE_CLAMP_PCT = 20.0`, `_SMOOTH_WINDOW = 5`, `_rolling_mean` helper; test `test_grade_clamp_enforces_kickr_range` passes |
| 4 | Empty GPX raises `ValueError` with the file path | VERIFIED | `loader.py` line 54: `raise ValueError(f"GPX {source_label} contains no track points or route points")`; test `test_empty_gpx_raises_value_error` passes |
| 5 | `RouteTracker.run()` advances position by speed×dt, clamps at total_dist_m, handles None speed | VERIFIED | `tracker.py` lines 67–71; 6 tracker unit tests pass including `test_none_speed_treated_as_zero`, `test_position_clamp_and_route_complete` |
| 6 | `state.real_grade_percent` updated every tick via bisect lookup into `grades_pct` | VERIFIED | `tracker.py` lines 85–87: `bisect.bisect_right`, clamped idx, `state.real_grade_percent = self._route.grades_pct[idx]`; tests pass |
| 7 | WS `{"type":"load_route","path":"..."}` triggers load_gpx, broadcasts `route_data`, spawns RouteTracker task | VERIFIED | `server.py` `_load_route` + `_handler` elif branch; `DEFAULT_GRADE = 0.0` in `main.py`; 9 WS tests pass including `test_load_route_success_broadcasts_route_data` |
| 8 | UI pre-ride screen appears first; dispatches file content over WS; dismissed by "Ohne Strecke starten" | VERIFIED | `PreRideScreen.tsx` exists with file picker, drag-and-drop, `sendMessage({type:"load_route_content",content})`; `App.tsx` gates on `started` state |
| 9 | `useTelemetry` discriminates message types; route arrays stored in `useRef` not `useState`; ElevationProfile + MiniMap render live data with amber position markers | VERIFIED | `useTelemetry.ts` switch on `msg.type`; `routeRef = useRef<StoredRoute | null>(null)`; `ElevationProfile.tsx` has `ReferenceLine`, `linearGradient`, `memo()`; `MiniMap.tsx` has `Polyline`, `CircleMarker`, `fitBounds` on `coords.length` dep |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `engine/engine/route/model.py` | VERIFIED | `@dataclass(frozen=True) class RouteData` with 6 tuple fields; 21 lines |
| `engine/engine/route/loader.py` | VERIFIED | `load_gpx`, `load_gpx_content`, `_parse_gpx`, `_rolling_mean`; substantive 119-line implementation; imports gpxpy |
| `engine/engine/route/tracker.py` | VERIFIED | `class RouteTracker`, `ROUTE_COMPLETE_GRADE = 0.0`, `async def run`, `bisect.bisect_right`, `time.monotonic()`; no BLE/WS/FTMS imports |
| `engine/engine/ws/server.py` | VERIFIED | `class RouteContext`, `_load_route`, `_load_route_content`, `_do_load_route`, `load_route` + `load_route_content` dispatch in `_handler`, `broadcast_loop` with `route_context` kwarg |
| `engine/engine/main.py` | VERIFIED | `DEFAULT_GRADE: float = 0.0`, `RouteContext` instantiated, `route_context=route_ctx` passed to `broadcast_loop`, `"type": "telemetry"`, `"position_m"`, `"route_loaded"`, tracker shutdown |
| `engine/tests/route/test_loader.py` | VERIFIED | 5 test functions, all pass |
| `engine/tests/route/test_tracker.py` | VERIFIED | 6 async test functions, all pass |
| `engine/tests/fixtures/route_simple.gpx` | VERIFIED | Contains `52.5200`, `13.4050`, `<ele>100.0</ele>`, `<ele>120.0</ele>` |
| `engine/tests/fixtures/route_no_elevation.gpx` | VERIFIED | Self-closing trkpt with no ele tags |
| `engine/pyproject.toml` | VERIFIED | `"gpxpy>=1.6.2,<2.0"` in dependencies |
| `ui/src/types/route.ts` | VERIFIED | `TelemetryMessage`, `RouteDataMessage`, `RouteErrorMessage`, `IncomingMessage`, `LoadRouteMessage`, `StoredRoute`, `ElevationChartDatum` |
| `ui/src/types/telemetry.ts` | VERIFIED | `position_m?: number | null`, `route_loaded?: boolean` fields added |
| `ui/src/hooks/useTelemetry.ts` | VERIFIED | `switch(msg.type)` dispatch, `routeRef = useRef<StoredRoute|null>`, `routeLoaded`/`routeError` state, `retryCountRef` backoff preserved |
| `ui/src/components/PreRideScreen.tsx` | VERIFIED | File picker, drag-and-drop, `Ohne Strecke starten` button, `sendMessage({type:"load_route_content",content})` |
| `ui/src/components/ElevationProfile.tsx` | VERIFIED | `memo()`, `isAnimationActive={false}`, `linearGradient #EF4444→#3B82F6`, `ReferenceLine x={positionM} stroke="#F59E0B"`, empty-state label |
| `ui/src/components/MiniMap.tsx` | VERIFIED | `memo()`, `Polyline`, `CircleMarker`, `useMap`, `fitBounds` on `coords.length`, `dragging={false}`, amber `#F59E0B` marker |
| `ui/src/App.tsx` | VERIFIED | `PreRideScreen` gate, `started` state, `routeRef.current`, `positionM`, J/K gear-shift preserved, inline `routeError` banner |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `engine/engine/route/loader.py` | `gpxpy.parse` + `gpxpy.geo.haversine_distance` | `import gpxpy` / `import gpxpy.geo` | WIRED | Lines 16–17; used in `_parse_gpx` |
| `engine/tests/route/test_loader.py` | `engine.route.loader` | `from engine.route.loader import load_gpx` | WIRED | Inside test functions |
| `engine/engine/route/tracker.py` | `engine.route.model.RouteData` | `from engine.route.model import RouteData` | WIRED | Line 26 |
| `engine/engine/route/tracker.py` | `state.real_grade_percent` | direct mutation | WIRED | Lines 75, 87 |
| `engine/engine/route/tracker.py` | `bisect.bisect_right` | `import bisect` | WIRED | Line 21 |
| `engine/engine/ws/server.py` | `engine.route.loader.load_gpx` + `RouteTracker` | lazy imports inside `_load_route` / `_do_load_route` | WIRED | Lines 55–56, 71–72 |
| `engine/engine/ws/server.py` | `broadcast_queue` | `put_nowait` for route_data/route_error | WIRED | Lines 115–118, 90–98 |
| `engine/engine/main.py` | `RouteContext` + `broadcast_loop` | `route_context=route_ctx` kwarg | WIRED | Lines 31, 97–101, 159–166 |
| `engine/engine/main.py` | `position_m` in telemetry snapshot | `route_ctx.tracker.position_m` | WIRED | Line 124 |
| `ui/src/hooks/useTelemetry.ts` | engine WS (route_data/route_error/telemetry) | `switch(msg.type)` in `ws.onmessage` | WIRED | Lines 47–79 |
| `ui/src/components/PreRideScreen.tsx` | `useTelemetry.sendMessage` | `sendMessage({type:"load_route_content",content})` | WIRED | Line 25; engine handles `load_route_content` in `server.py` line 164 |
| `ui/src/components/ElevationProfile.tsx` | `positionM` + `RouteData` | props | WIRED | `ReferenceLine x={positionM}`, data flows from `routeRef.current.elevationChart` via App.tsx |
| `ui/src/components/MiniMap.tsx` | `RouteData.lats/lons` + `positionM` | props + `useMap().fitBounds` | WIRED | `Polyline positions={coords}`, `fitBounds` on `coords.length` dep |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ROUTE-01 | 04-01, 04-03, 04-04, 04-05 | Load GPX; extract elevation profile + coordinates | SATISFIED | `load_gpx` returns `RouteData` with all arrays; 5 unit tests pass; WS broadcasts `route_data`; UI renders ElevationProfile + MiniMap |
| ROUTE-02 | 04-02, 04-03, 04-04, 04-05 | Track position by integrating speed × time (haversine) | SATISFIED | `RouteTracker.run()` integrates `speed_ms * dt`; 6 unit tests pass; `position_m` propagated through WS to UI amber markers |
| ROUTE-03 | 04-02, 04-03, 04-04, 04-05 | Grade at position → FTMS control loop base grade | SATISFIED | `state.real_grade_percent` written every tick via `bisect_right`; `DEFAULT_GRADE = 0.0` baseline; hardware-verified resistance changes |

All 3 ROUTE requirements satisfied. REQUIREMENTS.md traceability confirms all mapped to Phase 4 and marked `[x]` complete.

### Notable Implementation Deviation

**PreRideScreen uses `load_route_content` (file content upload) not `load_route` (path-based)**

The 04-04 PLAN specified path-based WS transport (`{"type":"load_route","path":"..."}`) as the locked user decision (CONTEXT.md "Claude's Discretion"). The actual implementation pivoted to file-content upload (`{"type":"load_route_content","content":"..."}` via FileReader + drag-and-drop) after finding that browser File API does not expose `File.path` in non-Electron contexts.

This is a **correct divergence**: the original plan acknowledged the browser limitation and proposed a text-input fallback; the implementation chose a better UX (actual file upload) with matching engine support added in commit `b6359c6`. Both `load_route` (path-based, for programmatic/test use) and `load_route_content` (content-based, for browser UI) are wired and tested. The 04-04 SUMMARY documents the text-input approach in "Known Limitations" but does not fully document the pivot to content-upload. This is an undocumented deviation in the SUMMARY but the implementation is functionally correct and superior.

**Impact:** None on functionality. The 9/9 truths and all ROUTE requirements are satisfied. The WS test suite tests `load_route` (path); the UI uses `load_route_content` (content); both paths are exercised.

### Anti-Patterns Found

None detected across engine or UI modified files. No TODO/FIXME/PLACEHOLDER comments, no stub implementations, no empty handlers.

### Human Verification Required

#### 1. End-to-end ride on real KICKR Core

**Test:** Start engine (`uv run python -m engine`), start UI (`npm run dev`), load a real GPX file via the pre-ride screen file picker, pedal through the route, ride to completion.
**Expected:** All 14 items in the 04-05 checklist tick green — MiniMap draws route, amber marker advances with speed, ElevationProfile ReferenceLine tracks, KICKR resistance follows grade, BLE reconnect handled, route-end sets grade 0%.
**Why human:** Physical trainer resistance and visual marker sync cannot be verified programmatically.
**Current status:** COMPLETED — commit `10bc639` ("Phase 4 accepted — all 14 hardware verification items approved", 2026-04-22) documents user sign-off. Phase 4 marked complete in STATE.md and ROADMAP.md (5/5 plans done).

## Gaps Summary

No gaps. All automated checks pass (97 engine tests, TypeScript clean, production UI build succeeds). Hardware verification was completed and signed off by the user on 2026-04-22.

The `human_needed` status reflects that real-hardware behavior is definitionally beyond automated verification — not that anything is incomplete. The human checkpoint (plan 04-05) was executed and approved.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
