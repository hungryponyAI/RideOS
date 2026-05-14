# OUDENA UI/UX Gap Implementation Roadmap

## Purpose

This roadmap turns the remaining gaps from `docs/guidelines/UI_UX_IMPLEMENTATION_SPEC.md` and `docs/guidelines/UI_UX_GUIDELINES.md` into implementation phases for the current RideOS/OUDENA app.

The first OUDENA UI pass in `docs/oudena_ui_ux_implementation_plan.md` covered the visual rebrand, pre-ride restyling, route cards, route detail, live HUD, Mapbox styling, climb focus, responsiveness, and basic accessibility.

This document plans the next product-level UX work: onboarding, app navigation, home recommendations, route discovery, device readiness, ride lifecycle controls, ride summary, history, analytics, and quit/exit continuity.

## Current Baseline

The app currently has:

- OUDENA visual identity, tokens, logo, favicon, and calm UI styling.
- A pre-ride screen with GPX import, Strava connect/sync, route library, route selection, route detail, trim, and ride options.
- A live ride screen with full-viewport Mapbox route visualization, metrics HUD, ghost marker/delta, elevation timeline, pause overlay, connection banner, climb focus, and completed banner.
- A settings drawer with athlete settings and basic device status.
- Backend support for route library, Strava route import, ride start, pause, gear shift, phase completion, ride event persistence, and ride repository query helpers.

The app does not yet have:

- Full app navigation or separate Home, Routes, History, Analytics, Devices, and Profile screens.
- First-launch onboarding.
- Recommended rides, continue riding, recovery suggestions, or seasonal context.
- Route filters, map previews, favorites, or visible last-attempt/ghost-availability metadata.
- A ride start ritual with preparing/countdown/trainer engagement.
- Full touch-visible live ride controls.
- An explicit end ride / quit ride flow.
- A real ride summary screen.
- User-facing ride history and analytics.

## Target User Story

The target OUDENA journey should be:

1. User opens the app.
2. App shows a calm personal riding hub with a recommended route and trainer readiness.
3. First-time users are guided through trainer connection, optional Strava connection, route import, and a first ride.
4. Returning users can start the recommended ride immediately or browse routes.
5. Route detail explains the ride with map, elevation, previous/best ride context, ghost availability, and advanced options hidden by default.
6. Starting a ride enters a preparation ritual: route expands, trainer readiness is confirmed, HUD initializes, countdown appears, then movement begins.
7. During the ride, route immersion dominates while controls remain touch-accessible and calm.
8. User can pause, resume, change view, toggle ghost where possible, adjust ride mode where possible, or end the ride intentionally.
9. Completion or manual end transitions into a reflective summary with one or two useful insights.
10. User can inspect ride history/analytics, ride again, choose a suggested next ride, return home, or quit the app.

## Phase Principles

- Keep route immersion above metrics and analytics.
- Prefer small, shippable phases that keep existing ride behavior working.
- Introduce backend/WebSocket contract changes only where the UX cannot be completed without them.
- Keep beginner mode simple and make advanced depth discoverable.
- Maintain calm German UI copy where current UI is German.
- Preserve current OUDENA token/style system.
- Add tests alongside each behavioral phase.

## Phase 1: App Shell And Navigation Foundation

### Goal

Create the information architecture needed for the full product without implementing every destination at once.

### Why This Phase First

The guidelines require Home, Ride, Routes, History, Analytics, Devices, and Settings on desktop, plus simplified mobile navigation. The current app only switches between pre-ride and live ride with local `started` state.

### Scope

- Replace the binary `started` app state with explicit app view/state.
- Add a lightweight navigation model:
  - `home`
  - `routes`
  - `ride`
  - `summary`
  - `history`
  - `analytics`
  - `devices`
  - `settings`
- Keep navigation hidden or minimized during active rides.
- Make current `PreRideScreen` reachable as either `home` or `routes` during the transition.
- Add mobile navigation slots, even if some screens start as placeholders.
- Preserve settings drawer behavior while preparing for a later full Settings screen.

### Likely Files

- `ui/src/app/App.tsx`
- `ui/src/app/` new shell/navigation components
- `ui/src/features/pre-ride/PreRideScreen.tsx`
- `ui/src/features/ride/RideScreen.tsx`

### Acceptance Criteria

- User can move between Home/Routes, Ride, History, Analytics, Devices, and Settings placeholders.
- Active ride hides primary navigation and preserves route immersion.
- Browser reload does not accidentally start a ride UI without state.
- Existing route start behavior still works.

### Tests

- App renders default Home/Routes state.
- Navigation changes visible screen.
- Starting a ride switches to ride state.
- Active ride shell does not render the main navigation.

## Phase 2: Ride Lifecycle Protocols

### Goal

Expose the complete ride lifecycle to the UI: prepare, countdown, ride, pause, manual end, completed, summary, and return home.

### Why This Phase Matters

The backend has `RideService.end_ride`, but there is no inbound WebSocket message for ending a ride. The UI can show "Fahrt beendet" after natural completion, but cannot intentionally end/quit a ride through the visible UX.

### Scope

- Add inbound WebSocket message for `end_ride`.
- Add a ride lifecycle read model message or extend telemetry carefully with:
  - ride status
  - ended reason where useful: completed, user-ended, engine-error
  - current ride id if available
- Add UI state transitions:
  - idle -> preparing
  - preparing -> countdown
  - countdown -> riding
  - riding -> paused
  - riding/paused -> ending
  - ending -> summary
- Decide whether countdown is client-side, server-side, or mixed.
- Add a route-safe way to return from summary to Home/Routes.

### Likely Files

- `engine/engine/transport/ws/schemas.py`
- `engine/engine/transport/ws/inbound.py`
- `engine/engine/application/ride_service.py`
- `engine/engine/transport/ws/outbound.py`
- `ui/src/shared/types/telemetry.ts`
- `ui/src/features/ride/RideScreen.tsx`
- `ui/src/app/App.tsx`

### Acceptance Criteria

- User can manually end an active ride.
- User is asked to confirm ending a ride.
- Ended ride persists through existing ride persistence.
- Completion and manual ending both transition to summary.
- Returning home clears the live ride UI and does not leave controls in an ambiguous state.

### Tests

- Protocol test for `end_ride`.
- Inbound handler test calls `RideService.end_ride`.
- UI test confirms end ride button opens confirmation.
- UI test confirms confirmed end sends `end_ride`.

## Phase 3: First Launch And Device Readiness

### Goal

Reduce first-run anxiety and make trainer readiness visible before the ride.

### Scope

- Add first-launch onboarding state in local storage.
- Add a calm Welcome step.
- Add trainer readiness step:
  - connection status
  - searching/reconnecting state
  - clear next action
- Add optional Strava connection step.
- Add route import step.
- Add first ride selection/start step.
- Make skipping possible without making it feel like failure.
- Promote device readiness to pre-ride/Home instead of hiding it only in Settings.
- Add a dedicated Devices view as a more complete version of the current settings device rows.

### UX Notes

- Beginner mode should show only connect trainer, select route, start ride, and basic metrics.
- Technical BLE/FTMS details should stay out of user-facing copy.
- Good copy examples:
  - `Trainer wird gesucht`
  - `Trainer verbunden`
  - `Du kannst auch ohne Strecke starten`
  - `Strava spaeter verbinden`

### Likely Files

- `ui/src/features/onboarding/` new
- `ui/src/features/devices/` new
- `ui/src/features/settings/SettingsPanel.tsx`
- `ui/src/app/App.tsx`
- `ui/src/shared/ui/ConnectionBanner.tsx`

### Backend Considerations

- Current device status appears derived client-side from telemetry/WebSocket state.
- Battery and signal require backend/device fields before they can be real.
- If real battery/signal is not available, do not fake values; show only supported status.

### Acceptance Criteria

- First-time user sees a guided path to first ride.
- Returning user does not see onboarding unless manually reopened.
- Trainer readiness is visible before ride start.
- Device copy is calm and non-technical.

### Tests

- Onboarding shows when local storage flag is absent.
- Completing/skipping onboarding stores state.
- Device readiness component renders connected/searching/disconnected copy.

## Phase 4: Home Recommendation Hub

### Goal

Create the "personal indoor cycling studio" described by the guidelines.

### Scope

- Build a Home screen with a dominant hero recommendation.
- Recommended route can initially use deterministic local logic:
  - prefer route with recent import and previous/best time
  - fallback to first available route
  - fallback to import/connect empty state
- Add sections progressively:
  - Hero recommendation
  - Continue riding / last selected route
  - Routes worth revisiting
  - Ghost challenges
  - Recovery suggestion
- Keep max five primary sections.
- Keep one dominant CTA.

### Data Needs

Initial local data:

- route library entries
- best time
- Strava id
- moving time where available
- local last selected route in local storage

Later data:

- ride history summaries
- seasonal trends
- recovery suggestion logic
- unfinished ride state

### Likely Files

- `ui/src/features/home/HomeScreen.tsx`
- `ui/src/features/home/components/`
- `ui/src/features/routes/hooks/useRouteLibrary.ts`
- `ui/src/app/App.tsx`

### Acceptance Criteria

- Returning user can open app and start a recommended ride quickly.
- Empty Home state points to trainer, Strava, or GPX import without clutter.
- Home does not feel like a statistics dashboard.

### Tests

- Empty Home renders import/connect prompts.
- Home with routes renders one dominant recommendation CTA.
- Starting recommendation sends the existing route selection/start path.

## Phase 5: Route Browser And Route Detail Upgrade

### Goal

Move from a simple route list to calm route discovery and intent-building.

### Scope

- Split route browsing from route detail if needed.
- Add route filters:
  - easy
  - recovery
  - short
  - flat
  - climb-heavy
  - ghost available
  - favorites
- Add favorite state locally first, then persist later if needed.
- Add route card metadata:
  - last attempt
  - ghost availability
  - estimated duration
  - best ride
- Add map preview to route cards or detail.
- Add route detail map above/beside elevation.
- Add ghost comparison section.
- Add advanced drawer fields not currently present:
  - trainer difficulty
  - pacing target
- Keep route trimming discoverable but secondary.

### Backend Considerations

- Last attempt and route history require ride query API.
- Favorites need persistence. Start local storage unless backend route metadata exists.
- Trainer difficulty and pacing target require protocol and ride engine support before they can affect behavior.

### Likely Files

- `ui/src/features/routes/` new or expanded
- `ui/src/features/pre-ride/RouteCard.tsx`
- `ui/src/features/pre-ride/RouteCardExpanded.tsx`
- `ui/src/features/pre-ride/RideOptions.tsx`
- `engine/engine/transport/ws/schemas.py` for future option fields

### Acceptance Criteria

- User can browse routes without dense controls.
- Filters are lightweight and beginner-friendly.
- Detail screen includes map, elevation, distance, elevation gain, estimated duration, best/previous context, and ghost availability.
- Advanced options remain collapsed by default.

### Tests

- Route filters reduce visible route list.
- Favorite toggle persists locally.
- Route detail shows required metadata when available.
- Start payload remains backward-compatible until new protocol fields are intentionally added.

## Phase 6: Ride Start Ritual

### Goal

Make the transition from selection to riding feel intentional, premium, and confidence-building.

### Scope

- Add preparing overlay:
  - route loading
  - trainer readiness
  - HUD initializing
- Add countdown after route/trainer readiness.
- Smoothly transition:
  - route detail expands or fades
  - navigation hides
  - map zooms to route
  - HUD sharpens
  - countdown fades
  - ride unpauses
- Send `set_paused: true` during preparation and `set_paused: false` when countdown completes, if this remains the chosen model.
- Handle failure states:
  - route load error
  - trainer disconnected
  - WebSocket disconnected
- Respect reduced motion.

### Likely Files

- `ui/src/features/ride-start/` new
- `ui/src/features/ride/RideScreen.tsx`
- `ui/src/features/pre-ride/PreRideScreen.tsx`
- `ui/src/app/App.tsx`

### Acceptance Criteria

- Starting a ride never feels like an abrupt screen swap.
- User understands whether the trainer and route are ready.
- Countdown can be cancelled.
- Reduced-motion users get a simple non-cinematic transition.

### Tests

- Start ritual shows preparing state.
- Countdown appears after route data is available.
- Countdown completion sends resume/unpause message.
- Cancel returns to route detail without starting movement.

## Phase 7: Live Ride Controls And State Refinement

### Goal

Complete the live ride cockpit controls while preserving route immersion.

### Scope

- Add bottom/right ride controls:
  - pause/resume
  - end ride
  - camera mode
  - gear shift controls for touch
  - ghost toggle where protocol supports it
  - ERG/resistance mode where protocol supports it
- Add clearer paused state:
  - expanded controls
  - resume primary
  - end ride secondary
- Add reconnecting overlay that preserves ride state and does not block the route.
- Add descent state:
  - slightly wider camera
  - lower peripheral emphasis
- Add recovery and sprint visual states only if telemetry supports them cleanly.
- Add ghost feedback:
  - closing gap subtle emphasis
  - passing ghost pulse
  - losing pace emphasis
- Add screen reader announcements:
  - ride started
  - ride paused
  - trainer disconnected
  - ride completed

### Backend Considerations

- Mid-ride ghost toggle may require enabling/disabling `ctx.ghost_tracker`.
- ERG/resistance mid-ride toggles require explicit engine behavior before UI can safely expose them.
- If touch shifting is exposed, ensure it uses existing `gear_shift` messages.

### Likely Files

- `ui/src/features/ride/RideScreen.tsx`
- `ui/src/features/ride/components/`
- `ui/src/shared/ui/IconButton.tsx`
- `engine/engine/application/ride_service.py`
- `engine/engine/transport/ws/schemas.py`
- `engine/engine/transport/ws/inbound.py`

### Acceptance Criteria

- All essential ride controls are visible or easily revealed on touch devices.
- User can safely pause, resume, and end ride.
- Controls do not obscure the route or elevation timeline.
- Keyboard shortcuts remain supported.

### Tests

- Pause/resume button sends `set_paused`.
- Touch gear controls send `gear_shift`.
- End ride opens confirmation.
- Screen reader live region announces key ride state changes.

## Phase 8: Ride Summary

### Goal

Replace the bare completed banner with a reflective cooldown experience.

### Scope

- Add `RideSummaryScreen`.
- On ride completion or manual end, transition to summary.
- Include:
  - ride hero with route name/map/elevation
  - route replay preview
  - key metrics
  - one or two narrative insights
  - ghost comparison if ghost was enabled
  - suggested next ride
  - ride again
  - return home
- Keep tone calm. Avoid trophies, loud celebrations, and achievement spam.

### Data Needs

Initial summary can use live telemetry and route data:

- elapsed time
- distance
- average or current power if available
- best time update from route library
- ghost delta if available

Better summary requires persisted ride query:

- avg power
- max power
- event-derived cadence stability
- pacing consistency
- climbing efficiency
- route/segment breakdown

### Backend Considerations

- Add a `ride_summary` WebSocket message or route for querying last ride.
- Use `RideRepoSink` and `SqliteRideRepo` query helpers.
- Consider broadcasting `ride_id` when ride starts/ends.

### Likely Files

- `ui/src/features/summary/RideSummaryScreen.tsx`
- `ui/src/features/summary/components/`
- `ui/src/app/App.tsx`
- `engine/engine/adapters/persistence/sqlite/ride_repo.py`
- `engine/engine/transport/ws/inbound.py`
- `engine/engine/transport/ws/outbound.py`

### Acceptance Criteria

- Completed rides do not dead-end at the ride screen.
- Summary appears progressively after completion.
- User can ride again, choose next ride, return home, or inspect details.
- Summary remains interpretation-first, not a dense dashboard.

### Tests

- Completed ride state routes to summary.
- Summary renders with minimal available telemetry.
- Summary renders optional ghost comparison when ghost data exists.
- Return home clears summary state.

## Phase 9: History

### Goal

Expose recorded rides so OUDENA has continuity between rides.

### Scope

- Add History screen.
- Query persisted rides.
- Show recent rides with:
  - date/time
  - route name
  - duration
  - distance
  - avg power
  - completion status
- Add ride detail entry point.
- Link route cards and Home sections to history where useful.

### Backend Scope

- Add inbound `list_rides`.
- Add inbound `get_ride`.
- Return compact ride summaries from SQLite.
- Optionally add route name enrichment in backend or UI.

### Likely Files

- `ui/src/features/history/`
- `engine/engine/transport/ws/schemas.py`
- `engine/engine/transport/ws/inbound.py`
- `engine/engine/adapters/persistence/sqlite/ride_repo.py`
- `engine/engine/ports/repos.py`

### Acceptance Criteria

- User can open History and see completed rides.
- User can open a ride detail shell.
- Empty state is calm and points to starting a first ride.

### Tests

- Backend returns ride list sorted by newest first.
- History renders empty and populated states.
- Selecting ride opens ride detail.

## Phase 10: Analytics

### Goal

Add layered, interpretation-first analytics without turning OUDENA into a dense dashboard.

### Scope

- Add Analytics overview:
  - simple trends
  - recent consistency
  - climbing pattern
  - cadence stability
  - route comparison
- Add Ride Detail analytics:
  - effort timeline
  - power/cadence traces
  - pacing consistency
  - climb breakdown
  - ghost comparison
- Add Advanced Analytics drawer/tab:
  - detailed pacing analysis
  - segment/PR comparisons
  - export/debug values only if needed
- Keep charts monochrome-first with restrained accents.

### Backend Scope

- Build read models from `ride_events`.
- Compute:
  - avg power
  - max power
  - cadence consistency
  - pacing consistency
  - climb efficiency
  - route comparison deltas
- Add query endpoints/messages for analytics summaries.

### Likely Files

- `ui/src/features/analytics/`
- `engine/engine/application/analytics_service.py` new
- `engine/engine/transport/ws/schemas.py`
- `engine/engine/transport/ws/inbound.py`
- `engine/tests/application/` new analytics tests

### Acceptance Criteria

- Analytics starts with interpretation and trends.
- Advanced details are progressively disclosed.
- No dense chart wall appears by default.
- History and Summary can link into analytics.

### Tests

- Analytics service computes metrics from sample ride events.
- Analytics overview renders simple trend state.
- Advanced analytics is collapsed by default.

## Phase 11: Elevation, Ghost, And Terrain Depth

### Goal

Bring the ride visualization closer to the full guideline vision.

### Scope

- Add ghost marker to elevation timeline.
- Add climb and descent highlighting.
- Add pacing zones if data exists.
- Add PR/segment markers if data exists.
- Refine climb focus camera:
  - lower/closer framing during climb
  - relax when climb ends
- Refine descent camera:
  - wider framing
- Add topographic analytical mode with calmer controls.
- Respect reduced motion for camera changes.

### Backend/Data Scope

- Route preprocessing may need climb/descent segment detection.
- Ghost position in distance space may need to be exposed, not only lat/lng/time gap.
- PR segments require historical ride comparison.

### Likely Files

- `ui/src/features/ride/components/ElevationProfile.tsx`
- `ui/src/features/ride/components/MiniMap.tsx`
- `ui/src/features/ride/hooks/useClimbFocus.ts`
- `engine/engine/domain/route.py`
- `engine/engine/route/ghost.py`
- `engine/engine/transport/ws/outbound.py`

### Acceptance Criteria

- Elevation timeline shows rider and ghost position when available.
- Climbs/descents are readable without clutter.
- Camera changes support climb/descent states.
- Reduced motion disables major cinematic movement.

### Tests

- Elevation profile renders ghost marker when provided.
- Climb segments render from sample route metadata.
- Reduced-motion mode avoids camera transition classes where possible.

## Phase 12: Settings, Profile, Integrations, And Preferences

### Goal

Expand Settings from a compact drawer into a complete but beginner-friendly configuration area.

### Scope

- Organize settings categories:
  - ride
  - trainer
  - visuals
  - audio
  - integrations
  - notifications
  - advanced
- Keep advanced collapsed.
- Add profile/preferences screen for mobile if needed.
- Move Strava management into Integrations while keeping quick access on Home.
- Add visual preferences:
  - theme
  - reduced motion follow-up copy, if needed
  - camera default
  - metric preference
- Add ride preferences:
  - default ghost on/off
  - default warm-up/cool-down
  - preferred ride mode
- Add trainer preferences:
  - trainer difficulty when supported
  - resistance mode when supported

### Acceptance Criteria

- Settings no longer feels like a tiny utility drawer only.
- Beginner-facing controls are first.
- Advanced/debug options do not dominate.
- Settings changes preview or apply immediately where safe.

### Tests

- Settings categories render.
- Advanced section collapsed by default.
- Preference updates persist locally.

## Phase 13: Mobile, Tablet, And Accessibility Hardening

### Goal

Make the full journey intentionally usable on desktop, tablet, mobile, and later Capacitor.

### Scope

- Test and tune each screen at:
  - mobile portrait
  - mobile landscape
  - tablet
  - desktop
  - wide desktop
- Ensure ride mode is not a compressed desktop layout.
- Ensure thumb-accessible controls.
- Ensure no text overlap.
- Ensure all icon buttons have labels/tooltips where needed.
- Add ARIA live regions for ride lifecycle events.
- Improve color-independent communication.
- Audit focus traps in modals/drawers.
- Validate reduced motion across start ritual, ride transitions, and summary.

### Tooling

- Add Playwright or equivalent visual smoke tests if not already available.
- Keep Vitest for component logic.
- Manually test with Mapbox token available.

### Acceptance Criteria

- Core journey works on mobile without clipped controls.
- Ride controls remain reachable while riding.
- Screen reader announcements exist for required ride events.
- Reduced motion avoids cinematic drift and large transitions.

### Tests

- Responsive smoke tests for Home, Route Detail, Ride, Summary, History.
- Accessibility tests for dialogs/drawers.
- Component tests for ARIA live events.

## Phase 14: Native App Readiness

### Goal

Prepare the UX for iPad, iPhone, and Android packaging without forcing native work into earlier phases.

### Scope

- Capacitor shell planning.
- Safe-area layout support.
- App icon and splash screen.
- Native BLE validation.
- Native quit/background behavior.
- Offline-first assumptions for routes/history.
- Privacy/account screens if cloud sync arrives later.

### Acceptance Criteria

- Web UI uses safe-area-aware layout primitives.
- App can later be packaged without redesigning navigation.
- Native BLE and background constraints are documented before app-store work.

## Suggested Implementation Order

1. Phase 1: App Shell And Navigation Foundation
2. Phase 2: Ride Lifecycle Protocols
3. Phase 6: Ride Start Ritual
4. Phase 7: Live Ride Controls And State Refinement
5. Phase 8: Ride Summary
6. Phase 9: History
7. Phase 4: Home Recommendation Hub
8. Phase 5: Route Browser And Route Detail Upgrade
9. Phase 3: First Launch And Device Readiness
10. Phase 10: Analytics
11. Phase 11: Elevation, Ghost, And Terrain Depth
12. Phase 12: Settings, Profile, Integrations, And Preferences
13. Phase 13: Mobile, Tablet, And Accessibility Hardening
14. Phase 14: Native App Readiness

This order prioritizes the ride lifecycle because it is the largest current user-story break: users can start and ride, but cannot intentionally end, review, and continue gracefully.

## Recommended MVP Cut

For a strong next milestone, implement:

1. App shell with Home/Routes/Ride/Summary/History placeholders.
2. `end_ride` protocol and UI confirmation.
3. Ride start preparing/countdown flow.
4. Touch-visible ride controls.
5. Ride summary with basic metrics and return-home/ride-again actions.
6. History list using existing SQLite ride persistence.
7. Home hero recommendation using local route library and last ride data.

This produces a complete loop:

Open app -> choose recommended route -> prepare/countdown -> ride -> end/complete -> summary -> history/home -> quit.

## Cross-Phase Risks

- Adding navigation too late will create duplicated state between pre-ride, ride, summary, and history.
- Summary and history depend on ride IDs and persisted ride data; define the contract before building too much UI.
- Mid-ride ERG/resistance toggles should not be exposed until engine behavior is explicit.
- Mobile ride controls can easily obscure map/elevation; test early.
- Analytics can drift into dashboard density; keep interpretation-first by default.
- Mapbox camera transitions and frosted overlays can be expensive on mobile.

## Definition Of Done For The Full Gap Roadmap

The roadmap is complete when:

- First launch guides a new rider to a first ride.
- Returning launch shows a useful recommended ride.
- Routes can be browsed, filtered, understood, and started with low friction.
- The ride starts through a calm preparation/countdown flow.
- The ride cockpit has complete visible controls, including end ride.
- Completion or manual end leads to a reflective summary.
- History and analytics expose recorded rides without overwhelming the user.
- Device readiness and recovery flows reduce technical anxiety.
- Desktop, tablet, mobile, and reduced-motion experiences are intentionally designed.
- The app supports the full journey from startup to riding, analyzing, returning home, and quitting.
