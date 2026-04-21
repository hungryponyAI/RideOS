---
phase: 04-gpx-route-integration
plan: "04"
subsystem: ui
tags: [react, typescript, recharts, leaflet, websocket, gpx]

# Dependency graph
requires:
  - phase: 04-03
    provides: "WS schema with route_data/route_error/telemetry message types; engine broadcasts position_m"
provides:
  - "PreRideScreen component: GPX file picker + absolute path input + free-ride bypass"
  - "useTelemetry hook with full msg.type discrimination (telemetry/route_data/route_error)"
  - "ui/src/types/route.ts: full discriminated-union WS schema mirroring engine"
  - "Live ElevationProfile: red-blue gradient AreaChart + amber ReferenceLine at positionM"
  - "Live MiniMap: gray Polyline + amber CircleMarker + fitBounds-once via RouteLayer"
  - "App.tsx: PreRideScreen gate (started state), cockpit wired with routeRef + positionM"
affects:
  - "04-05 human-verify checkpoint (end-to-end KICKR ride with GPX)"
  - "05-zwift-click-integration (gear_shift WS format unchanged)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route arrays in useRef (not useState) — prevents 4 Hz re-render thrash on 10k-point routes"
    - "msg.type switch-discriminator in ws.onmessage — single handler for 3 message types"
    - "fitBounds-once: depends on coords.length not coords identity"
    - "PreRideScreen dismissal is one-way: pre-ride never re-appears after started=true"
    - "route_error after dismissal logged to console only (MVP recovery = restart)"

key-files:
  created:
    - ui/src/types/route.ts
    - ui/src/components/PreRideScreen.tsx
  modified:
    - ui/src/types/telemetry.ts
    - ui/src/hooks/useTelemetry.ts
    - ui/src/components/ElevationProfile.tsx
    - ui/src/components/MiniMap.tsx
    - ui/src/App.tsx

key-decisions:
  - "Route arrays (lats/lons/elevations/cum_dist) stored in useRef not useState — avoids 4 Hz re-render on 10k-point route (UI-SPEC Phase 4 constraint)"
  - "Browser File API does not expose absolute path; path transport = text input over WS; file picker is extension validator + convenience prefill only"
  - "route_error after PreRideScreen dismissal is console.warn only; user recovery is app restart (acceptable MVP)"
  - "isFront prop removed from Recharts ReferenceLine (does not exist in that version's type definitions)"

patterns-established:
  - "Pattern: useTelemetry returns routeRef (MutableRefObject) not routeData (state) for large arrays"
  - "Pattern: routeLoaded boolean state triggers single re-render on transition; downstream reads routeRef.current"

requirements-completed: [ROUTE-01, ROUTE-02, ROUTE-03]

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 4 Plan 04: GPX Route Integration — UI Layer Summary

**React UI promoted from empty-states to live GPX route display: PreRideScreen with file-picker/path-input, useTelemetry msg.type discriminator storing routes in useRef, live ElevationProfile with red-blue gradient + amber position marker, and MiniMap with Polyline + CircleMarker + fitBounds-once**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-21T15:04:45Z
- **Completed:** 2026-04-21T15:07:05Z
- **Tasks:** 2
- **Files modified:** 7 (5 modified, 2 created)

## Accomplishments

- Created `ui/src/types/route.ts` with full discriminated-union WS schema (`TelemetryMessage`, `RouteDataMessage`, `RouteErrorMessage`, `IncomingMessage`, `GearShiftMessage`, `LoadRouteMessage`, `OutgoingMessage`, `StoredRoute`, `ElevationChartDatum`)
- Extended `TelemetryState` with optional `position_m` and `route_loaded` fields; rewrote `useTelemetry` to dispatch on `msg.type` and store route arrays in `routeRef` (useRef) rather than state
- Built `PreRideScreen` with native file picker (.gpx validation), absolute-path text input, "Strecke laden" and "Ohne Strecke starten" buttons — wired to `sendMessage({type:"load_route",path})` and `onStarted()` callback
- Promoted `ElevationProfile` to accept `data: ElevationChartDatum[] | null` + `positionM: number | null`; renders red-to-blue linearGradient AreaChart with amber ReferenceLine when route loaded
- Promoted `MiniMap` to accept `coords/cumDist/positionM`; `RouteLayer` inner component uses `useMap().fitBounds(coords)` in a `useEffect([coords.length])` — fires exactly once on first route load
- Gated `App.tsx` on `started` state: `PreRideScreen` renders first, cockpit after; J/K gear-shift keydown preserved

## Task Commits

1. **Task 1: Extend types + useTelemetry hook** — `2565656` (feat)
2. **Task 2: PreRideScreen + live ElevationProfile/MiniMap + App gating** — `ebf08a5` (feat)

## Files Created/Modified

- `ui/src/types/route.ts` (created) — Full WS schema: all inbound/outbound message types, StoredRoute, ElevationChartDatum
- `ui/src/types/telemetry.ts` (modified) — Extended with optional `position_m?: number | null` and `route_loaded?: boolean`
- `ui/src/hooks/useTelemetry.ts` (modified) — msg.type discriminator, routeRef (useRef), routeLoaded/routeError state, clearRouteError callback; retryCountRef backoff preserved
- `ui/src/components/PreRideScreen.tsx` (created) — GPX file picker + path text input + load/free-ride buttons; cockpit-themed dark layout
- `ui/src/components/ElevationProfile.tsx` (modified) — Promoted with data/positionM props; red-blue gradient + amber ReferenceLine; empty-state unchanged
- `ui/src/components/MiniMap.tsx` (modified) — Promoted with coords/cumDist/positionM; RouteLayer with Polyline+CircleMarker+fitBounds-once; empty-state unchanged
- `ui/src/App.tsx` (modified) — started state gate; PreRideScreen first; cockpit with routeRef.current + positionM pipes; routeError logged

## Decisions Made

1. **Route arrays in useRef** — `lats`, `lons`, `elevations_m`, `cum_dist_m` on a typical GPX are 5k–30k points. Storing them in `useState` would trigger a full React reconciliation on every `route_data` message. `useRef` stores the data without scheduling a render; `routeLoaded` boolean is the single state bit that triggers the one re-render needed.
2. **Text-input path transport** — Chromium does not expose `File.path` in browser context (only Electron does). The file picker validates the `.gpx` extension and pre-fills the filename; the user pastes the absolute path. This is the locked decision from 04-CONTEXT.md "Claude's Discretion".
3. **route_error after dismissal = console only** — Once `started=true`, the PreRideScreen is unmounted. Re-mounting it would be confusing mid-cockpit. For MVP, the error is logged; the user can restart the app to re-pick a file. A future plan could add an in-cockpit error toast.
4. **isFront removed from ReferenceLine** — `isFront` is not a valid prop in the installed Recharts version. Removed to fix the TypeScript build error (Rule 1 auto-fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unsupported `isFront` prop from Recharts ReferenceLine**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** `isFront` does not exist on `ReferenceLineProps` in the installed Recharts version — TypeScript error TS2322 blocking build
- **Fix:** Removed `isFront` from `<ReferenceLine>` in `ElevationProfile.tsx`; the amber line still renders correctly as the last SVG element in the chart
- **Files modified:** `ui/src/components/ElevationProfile.tsx`
- **Verification:** `npm run build` exits 0 with `✓ built in 532ms`
- **Committed in:** `ebf08a5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan-provided code)
**Impact on plan:** Minimal — amber marker renders correctly without `isFront`. Build is green.

## Issues Encountered

None beyond the auto-fixed Recharts prop above.

## Known Limitations

- **route_error after PreRideScreen dismissal:** Logged to `console.warn` only. User recovery = restart app and re-pick file. A future in-cockpit toast is left for post-MVP.
- **Absolute path UX:** Browser security prevents reading `File.path`. User must paste the absolute path manually. Documented on screen with Finder tip ("Als Pfad kopieren").

## useTelemetry Hook — Final Return Shape

```ts
{
  telemetry: TelemetryState | null,     // null until first WS message
  status: ConnectionStatus,              // connecting | connected | live | disconnected | reconnecting
  sendMessage: (msg: OutgoingMessage | object) => void,
  routeRef: MutableRefObject<StoredRoute | null>,  // route arrays — read .current
  routeLoaded: boolean,                  // state — triggers re-render on load transition
  routeError: string | null,             // state — set on route_error message
  clearRouteError: () => void,
}
```

## ElevationProfile / MiniMap Prop Contracts

```ts
// ElevationProfile
interface ElevationProfileProps {
  data: ElevationChartDatum[] | null;  // null = empty state
  positionM: number | null;             // null = no marker
}

// MiniMap
interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;
}
```

## Next Phase Readiness

- **04-05** is a `checkpoint:human-verify` for end-to-end ride on real KICKR hardware: load GPX → watch MiniMap draw route → pedal → resistance follows grade → position marker moves
- All ROUTE-01/02/03 UI-side requirements complete
- React.memo + isAnimationActive + fitBounds-once invariants from UI-SPEC preserved

---
*Phase: 04-gpx-route-integration*
*Completed: 2026-04-21*
