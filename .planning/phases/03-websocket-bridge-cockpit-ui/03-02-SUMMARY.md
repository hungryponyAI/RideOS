---
phase: 03-websocket-bridge-cockpit-ui
plan: "02"
subsystem: ui
tags: [react, vite, tailwind, websocket, cockpit, typescript]
dependency_graph:
  requires: []
  provides: [ui-cockpit, useTelemetry-hook, TelemetryState-type]
  affects: [03-03-minimap-elevation]
tech_stack:
  added:
    - React 19 + Vite 8 (npm create vite@latest react-ts)
    - Tailwind CSS v3.4
    - recharts 3.x (elevation profile, Phase 4)
    - react-leaflet 5 + leaflet 1.9 (mini-map, Phase 4)
    - lucide-react (connection status icons)
  patterns:
    - React.memo on all leaf components (prevents 60 Hz full-tree re-renders)
    - tabular-nums for layout-stable digit rendering
    - useTelemetry hook encapsulates WS lifecycle + exponential backoff
key_files:
  created:
    - ui/package.json
    - ui/vite.config.ts
    - ui/tailwind.config.js
    - ui/postcss.config.js
    - ui/src/index.css
    - ui/src/main.tsx
    - ui/src/types/telemetry.ts
    - ui/src/hooks/useTelemetry.ts
    - ui/src/components/MetricDisplay.tsx
    - ui/src/components/GearStrip.tsx
    - ui/src/components/GradeBar.tsx
    - ui/src/components/ConnectionBanner.tsx
    - ui/src/App.tsx
  modified: []
decisions:
  - "Tailwind v3 locked (not v4) — v4 CSS-first config incompatible with existing toolchain"
  - "React.memo on all leaf components — required for 60 Hz stability at hardware telemetry rate"
  - "@import Inter before @tailwind directives — PostCSS ordering rule"
  - "useTelemetry retryCountRef tracks backoff state — avoids stale closure pitfall"
metrics:
  duration: "~3m"
  tasks_completed: 2
  files_created: 13
  files_modified: 0
  completed_date: "2026-04-20"
---

# Phase 3 Plan 02: React Cockpit UI Scaffold Summary

React + Vite + Tailwind cockpit scaffolded with five typed components connecting to ws://localhost:8765 with exponential backoff reconnect.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scaffold Vite + React + Tailwind project with types and hook | d6f0293 | package.json, tailwind.config.js, telemetry.ts, useTelemetry.ts |
| 2 | Build core cockpit components and App layout | 79198c4 | MetricDisplay, GearStrip, GradeBar, ConnectionBanner, App.tsx |

## What Was Built

**TelemetryState contract** (`ui/src/types/telemetry.ts`): 6-field interface matching the engine JSON schema exactly — `speed_kmh`, `power_w`, `cadence_rpm`, `gear`, `real_grade_pct`, `effective_grade_pct`. `ConnectionStatus` union type for WS state machine.

**useTelemetry hook** (`ui/src/hooks/useTelemetry.ts`): WebSocket lifecycle management with `useRef`-held WS instance (no re-renders on ref changes), `useCallback`-wrapped `connect` to avoid stale closures, and `retryCountRef` for stateful exponential backoff: 2s → 4s → 8s → max 30s.

**MetricDisplay** (`ui/src/components/MetricDisplay.tsx`): Two-size renderer — `display` (72px bold) for speed, `body` (20px regular) for watt/cadence. `tabular-nums` prevents layout shifts at 4–60 Hz update rate.

**GearStrip** (`ui/src/components/GearStrip.tsx`): Horizontal flex strip of 10 gear numbers. Active gear rendered as blue-500 rounded pill (44px min-height touch target), inactive gears as gray-600 text. GANG label in 12px gray-500.

**GradeBar** (`ui/src/components/GradeBar.tsx`): Dual-overlay grade visualization — effective grade as colored fill (red-500 climb, blue-500 descent, gray-700 flat), real grade as 2px gray-600 line marker. ±20% scale, German decimal format.

**ConnectionBanner** (`ui/src/components/ConnectionBanner.tsx`): Top banner hidden when live. Amber for connecting/reconnecting, red for disconnected. German copy per UI-SPEC.

**App.tsx**: Full-screen black cockpit (`w-screen h-screen bg-black`), flex column layout: ConnectionBanner → speed → gear strip → watt/cadence row → grade bar → 120px elevation placeholder. Em-dash (`—`) placeholders when telemetry is null.

## Verification

- `cd ui && npx tsc --noEmit` — passes clean
- `cd ui && npm run build` — production build succeeds (193KB JS, 5.8KB CSS)
- All 5 component files in `ui/src/components/`
- All acceptance criteria checked and confirmed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSS @import ordering in index.css**
- **Found during:** Task 2 production build
- **Issue:** `@import url(...)` placed after `@tailwind` directives caused PostCSS warning "must precede all other statements"
- **Fix:** Moved `@import` before all `@tailwind` directives
- **Files modified:** `ui/src/index.css`
- **Commit:** 79198c4 (included in Task 2 commit)

## Self-Check

All created files verified to exist.
