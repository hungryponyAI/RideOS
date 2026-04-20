---
phase: 03-websocket-bridge-cockpit-ui
plan: 03
subsystem: ui
tags: [react, recharts, leaflet, react-leaflet, tailwind, cockpit, elevation-profile, mini-map]

requires:
  - phase: 03-02
    provides: App.tsx cockpit scaffold with 5 components, useTelemetry hook, TypeScript types

provides:
  - ElevationProfile component — Recharts AreaChart empty-state scaffold (120px bottom strip)
  - MiniMap component — 160x160px Leaflet map with CartoDB dark tiles empty-state scaffold
  - Complete cockpit grid layout (all 7 components wired in App.tsx)

affects: [04-gpx-route-integration]

tech-stack:
  added: []
  patterns:
    - "ElevationProfile: memo-wrapped Recharts AreaChart, isAnimationActive=false, absolute overlay text"
    - "MiniMap: memo-wrapped Leaflet MapContainer, all interactions disabled, z-[1000] overlay text"
    - "Cockpit grid: grid-cols-[1fr_auto] for main area + mini-map column"

key-files:
  created:
    - ui/src/components/ElevationProfile.tsx
    - ui/src/components/MiniMap.tsx
  modified:
    - ui/src/App.tsx

key-decisions:
  - "UI-02: ElevationProfile uses Recharts AreaChart with flat EMPTY_DATA; no axes, no grid; pointer-events unset"
  - "UI-03: MiniMap uses leaflet/dist/leaflet.css explicit import (Pitfall 4); all interactions disabled for display-only scaffold"

patterns-established:
  - "Broadcast layer components (MiniMap, ElevationProfile) are display-only scaffolds in Phase 3 — no interactivity until Phase 4 GPX"
  - "CartoDB dark_all tiles require no API token — use for all dark-theme map scaffolds"

requirements-completed: [UI-02, UI-03]

duration: 4min
completed: 2026-04-20
---

# Phase 3 Plan 03: ElevationProfile + MiniMap Scaffold Summary

**Recharts AreaChart + Leaflet MiniMap empty-state scaffolds wired into cockpit grid, completing all 7 Phase 3 UI components**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-20T04:49:00Z
- **Completed:** 2026-04-20T04:53:17Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 3

## Accomplishments

- ElevationProfile renders Recharts AreaChart flat empty-state at 120px bottom strip with "Keine Strecke geladen" overlay
- MiniMap renders 160x160px Leaflet map with CartoDB dark matter tiles and "Keine Strecke" overlay in top-right corner
- App.tsx refactored from flex-col to CSS grid (`grid-cols-[1fr_auto]`) placing MiniMap in right column and ElevationProfile at bottom
- Production build succeeds (622 modules, TypeScript clean)

## Task Commits

1. **Task 1: Create ElevationProfile and MiniMap empty-state components, wire into App** - `4ce3b0d` (feat)
2. **Task 2: Visual verification of complete cockpit** - auto-approved (checkpoint:human-verify)

## Files Created/Modified

- `ui/src/components/ElevationProfile.tsx` — Recharts AreaChart empty-state scaffold, memo-wrapped, `isAnimationActive={false}`
- `ui/src/components/MiniMap.tsx` — Leaflet MapContainer 160x160px with CartoDB dark tiles, all interactions disabled
- `ui/src/App.tsx` — Updated to grid layout; imports + renders ElevationProfile and MiniMap

## Decisions Made

- `leaflet/dist/leaflet.css` imported directly in MiniMap.tsx (required per Pitfall 4 — Leaflet CSS must be imported at component level or Leaflet renders without styles)
- All map interactions disabled (`dragging`, `scrollWheelZoom`, `doubleClickZoom`, `touchZoom`) — display-only scaffold until Phase 4 GPX integration
- Overlay text at `z-[1000]` to render above Leaflet tile layers (Leaflet uses z-index ~400 for tiles)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Chunk size warning from Vite (>500 kB) is expected with Leaflet + Recharts bundled together — not an error, build successful.

## User Setup Required

None - no external service configuration required. CartoDB tiles load without API token.

## Next Phase Readiness

- All 7 Phase 3 UI components complete and rendering
- Phase 4 (GPX route integration) can replace ElevationProfile's `EMPTY_DATA` with actual GPX elevation data and MiniMap's static center with route coordinates
- WebSocket bridge (03-01) + cockpit UI (03-02 + 03-03) form a complete runnable stack

---
*Phase: 03-websocket-bridge-cockpit-ui*
*Completed: 2026-04-20*
