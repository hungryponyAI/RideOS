# OUDENA UI/UX Implementation Plan

## Purpose

This plan translates the ideas from `docs/guidelines/` into an implementation roadmap for the current RideOS React web UI. The goal is to visibly rebrand the product as **OUDENA** and move the interface toward the calm, premium, route-first experience described in the design, UI, UX, brand, and architecture guidelines.

This document is a plan only. It intentionally does not require backend, engine, WebSocket protocol, route-processing, or trainer-control changes in the first implementation phase.

## Source Material

The plan is based on:

- `docs/guidelines/BRAND_IDENTITY.md`
- `docs/guidelines/DESIGN_SYSTEM.md`
- `docs/guidelines/UI_UX_GUIDELINES.md`
- `docs/guidelines/UI_UX_IMPLEMENTATION_SPEC.md`
- `docs/guidelines/SW_DATA_ARCHITECTURE.md`
- `docs/guidelines/oudena_design_system_preview.html`
- `docs/guidelines/oudena_logo_original.svg`
- `docs/guidelines/oudena_logo_alt_01_ascent.svg`

## Product Direction

OUDENA should feel like a premium indoor cycling operating system built around real-world riding history.

The user experience should be:

- calm
- focused
- route-first
- cinematic
- technically capable
- emotionally restrained
- adult-focused
- non-gamified

The user experience should avoid:

- loud achievement language
- esports or arcade styling
- dense analytics by default
- high-contrast racing palettes
- aggressive motion
- technical error jargon
- dashboard-heavy layouts

## Scope

### In Scope For The First UI Implementation

- Rebrand visible UI from RideOS to OUDENA.
- Add OUDENA design tokens to global CSS and Tailwind.
- Use the OUDENA logo system in app shell, favicon, and pre-ride header.
- Restyle the current React UI with the OUDENA visual language.
- Improve pre-ride route selection, route cards, route detail, live ride HUD, and elevation timeline.
- Add responsive and accessibility improvements.
- Keep the existing Vite/React app, component structure, telemetry hook, WebSocket messages, and backend protocol.

### Out Of Scope For The First UI Implementation

- Supabase integration.
- Capacitor/mobile packaging.
- Local SQLite migrations.
- Official route catalog.
- Cloud sync.
- Ride recording database changes.
- Trainer-control changes.
- Physics-engine changes.
- Full analytics redesign.
- New app routing/navigation system.

These larger architecture items are documented as later phases because `SW_DATA_ARCHITECTURE.md` describes the long-term product direction, not a required first UI pass.

## Implementation Principles

- Preserve the current application architecture.
- Avoid broad folder restructuring.
- Prefer CSS variables and Tailwind token mapping over one-off color usage.
- Reuse existing components where possible.
- Keep the road/map/route visualization visually dominant.
- Put advanced controls behind progressive disclosure.
- Keep all primary ride controls touch-friendly.
- Do not change WebSocket message shapes.
- Do not add new telemetry requirements for the first pass.
- Derive visual ride states from existing telemetry and connection state.

## Phase 1: Planning Artifact And Design Inventory

### Goal

Create a clear implementation foundation before touching UI code.

### Tasks

- Save this plan in `docs/oudena_ui_ux_implementation_plan.md`.
- Treat `oudena_design_system_preview.html` as the visual reference, not as runtime code.
- Choose `oudena_logo_original.svg` as the primary product logo.
- Keep `oudena_logo_alt_01_ascent.svg` as an optional secondary exploration for app-icon or splash-screen work.
- Inventory existing UI entry points:
  - `ui/src/index.css`
  - `ui/tailwind.config.js`
  - `ui/src/App.tsx`
  - `ui/src/components/PreRideScreen.tsx`
  - `ui/src/components/RouteCard.tsx`
  - `ui/src/components/RouteCardExpanded.tsx`
  - `ui/src/components/RideOptions.tsx`
  - `ui/src/components/MiniMap.tsx`
  - `ui/src/components/ElevationProfile.tsx`
  - `ui/src/components/MetricDisplay.tsx`
  - `ui/src/components/ConnectionBanner.tsx`

### Acceptance Criteria

- The plan exists in the docs folder.
- The implementation has a stable source of truth for visual tokens, copy tone, and rollout phases.

### Phase 1 Implementation Notes

Status: complete as a docs-only preparation phase.

No current UI source files are changed in Phase 1. The purpose of this phase is to record the design source of truth and identify the exact current-code touchpoints for later implementation.

#### Confirmed Design Decisions

- Primary visible product brand: **OUDENA**.
- Internal technical/project naming may remain RideOS where it refers to the engine or codebase.
- Primary logo source: `docs/guidelines/oudena_logo_original.svg`.
- Secondary logo exploration: `docs/guidelines/oudena_logo_alt_01_ascent.svg`.
- Static design reference: `docs/guidelines/oudena_design_system_preview.html`.
- First implementation target: the existing React/Vite web UI in `ui/`.
- First implementation must keep WebSocket message shapes and backend/engine behavior unchanged.

#### Current UI Inventory

| Area | Current Files | Current State | Later Phase |
|---|---|---|---|
| Global tokens | `ui/src/index.css`, `ui/tailwind.config.js` | Uses simple light/dark variables and `#FFF200` as primary accent. Tailwind still exposes `brand.yellow`, `brand.red`, `brand.blue`, `brand.green`, and `brand.gray`. | Phase 3 |
| Browser metadata | `ui/index.html`, `ui/public/favicon.svg` | Browser title is `RideOS`; favicon is still Vite-derived. | Phase 2 |
| App shell | `ui/src/App.tsx` | Live ride uses a left metrics sidebar plus Mapbox area. Settings/theme buttons use small fixed square controls and yellow hover states. | Phases 8-9 |
| Pre-ride screen | `ui/src/components/PreRideScreen.tsx` | Visible `RIDEOS` branding, yellow divider lines, high-contrast yellow CTAs, and compact route-library layout. | Phase 5 |
| Route cards | `ui/src/components/RouteCard.tsx`, `ui/src/components/RouteCardExpanded.tsx` | Compact technical cards, yellow elevation fills, yellow selected border, condensed bold typography. | Phase 6 |
| Ride options | `ui/src/components/RideOptions.tsx` | Existing options are always visible; yellow selected states; no advanced disclosure grouping yet. | Phase 7 |
| Live map | `ui/src/components/MiniMap.tsx` | Mapbox Standard is already used with monochrome theme and camera modes. Route line is yellow, rider marker is red, ghost marker is dark gray. | Phase 10 |
| Elevation timeline | `ui/src/components/ElevationProfile.tsx`, `ui/src/components/RouteTrimSlider.tsx` | Yellow fill, black baseline, red rider marker, compact chart treatment. | Phase 10 |
| Metrics | `ui/src/components/MetricDisplay.tsx`, `ui/src/components/GearStrip.tsx`, `ui/src/components/GradeBar.tsx` | Large data typography uses Fira Code and label accent token; current feel is technical/racing-oriented. | Phases 4, 8 |
| Connection/device UI | `ui/src/components/ConnectionBanner.tsx`, `ui/src/components/SettingsPanel.tsx` | Connection and device status use yellow/red/green hard-coded states and technical panel styling. | Phases 8, 11 |
| Protocol/tests | `ui/src/types/route.ts`, `ui/src/types/telemetry.ts`, `ui/src/__tests__/protocol.test.ts` | Start ride message includes current fields; no OUDENA UI-only tests yet. | Phase 12 |

#### Current Branding And Accent Hotspots

The later implementation should account for these current hotspots:

- `ui/index.html` has the visible browser title `RideOS`.
- `ui/src/components/PreRideScreen.tsx` renders `RIDEOS` in the main pre-ride header.
- `ui/src/App.tsx` logs route errors with `[RideOS]`.
- `ui/public/favicon.svg` and `ui/src/assets/vite.svg` are Vite-style assets, not OUDENA assets.
- `#FFF200` appears across app shell hover states, route cards, route detail, ride options, elevation, map route line, route trim slider, settings, and connection state.
- `#E10600` appears in route errors, elevation rider marker, delete/error states, settings/device status, and connection alert UI.
- Strava orange `#FC4C02` is used in Strava-specific flows and should remain scoped there.

#### Later Implementation Guardrails

- Replace the yellow accent through tokens before replacing it component-by-component.
- Keep Strava orange for Strava-only UI.
- Avoid changing `StartRideMessage`, `TelemetryState`, or inbound route/telemetry messages during UI work.
- Do not remove existing route import, Strava sync, trim, ghost, ERG, warm-up, cooldown, lap, pause, gear, or camera-mode behavior while restyling.
- Treat Mapbox camera and terrain logic as already useful; later phases should primarily adjust styling, layout, and markers.
- Keep UI copy mostly German, but shift tone from technical/racing to calm and precise.

## Phase 2: Brand And Asset Foundation

### Goal

Make OUDENA the visible product identity while preserving RideOS as an internal engine/project name where appropriate.

### Tasks

- Replace visible app branding from `RIDEOS` to `OUDENA` in the pre-ride screen.
- Update browser metadata in `ui/index.html` from RideOS/Vite-style defaults to OUDENA wording.
- Replace `ui/public/favicon.svg` with an OUDENA route-mark favicon derived from the primary logo.
- Add a reusable UI-only logo component or asset wrapper, for example `OudenaLogo`.
- Use the original logo mark/wordmark for the main pre-ride header.
- Keep internal technical logging, backend packages, and engine naming unchanged.

### Copy Direction

Use calm German UI copy where the app is already German.

Preferred examples:

- `Deine nächste Fahrt`
- `Route starten`
- `Trainer verbinden`
- `Route importieren`
- `Dein Tempo bleibt ruhig stabil.`
- `Trainerverbindung unterbrochen.`

Avoid:

- `CRUSH`
- `DOMINATE`
- `LEVEL UP`
- `VOLL GAS`
- overly technical BLE/FTMS error copy in user-facing UI

### Acceptance Criteria

- Visible user-facing product name is OUDENA.
- Favicon and header visually match the route/ascent/circular-continuity logo system.
- No backend or package names are changed solely for branding.

### Phase 2 Implementation Notes

Status: complete.

- `ui/index.html`: title → "OUDENA", lang → "de", meta description added.
- `ui/public/favicon.svg`: replaced with 32×32 dark-badge OUDENA route mark (glacier #74AFCB arc + ascending line on #111417 rounded rect).
- `ui/src/shared/ui/OudenaLogo.tsx`: new component; accepts `variant` ("mark" | "wordmark") and `height`; mark is a 96×96 viewBox SVG, wordmark is 720×180; text uses `currentColor` for dark-mode compatibility.
- `ui/src/features/pre-ride/PreRideScreen.tsx`: RIDEOS yellow-badge header replaced with `<OudenaLogo height={44} />`; tagline changed from "INDOOR CYCLING ENGINE" to "Deine nächste Fahrt".
- Internal engine naming, backend packages, and WebSocket messages unchanged.
- TypeScript: clean. Tests: 23/23 passing.

## Phase 3: Design Tokens And Global Styling

### Goal

Move the app from the current high-contrast racing look to the calm OUDENA design system.

### Global Token Changes

Add or update CSS variables in `ui/src/index.css`.

Light mode:

```css
--bg: #F4F6F5;
--bg-secondary: #EBEFEE;
--surface: #FFFFFF;
--surface-soft: rgba(255,255,255,0.74);
--text: #1D242D;
--text-muted: #5F6874;
--text-subtle: #8D97A3;
--accent: #74AFCB;
--accent-muted: #68707A;
--success: #6BAA75;
--warning: #C59A52;
--critical: #C76D6D;
--border: rgba(29,36,45,0.10);
--shadow-soft: 0 6px 20px rgba(29,36,45,0.06);
--shadow-elevated: 0 14px 42px rgba(29,36,45,0.08);
--ease-oudena: cubic-bezier(0.22, 1, 0.36, 1);
```

Dark mode:

```css
--bg: #111417;
--bg-secondary: #1B2127;
--surface: #1B2127;
--surface-soft: rgba(27,33,39,0.76);
--text: #F3F5F7;
--text-muted: #B7C0CA;
--text-subtle: #798694;
--border: rgba(243,245,247,0.10);
```

### Tailwind Token Changes

Update `ui/tailwind.config.js` so Tailwind color names map to the CSS variables:

- `theme.bg`
- `theme.bgSecondary`
- `theme.surface`
- `theme.surfaceSoft`
- `theme.border`
- `theme.text`
- `theme.muted`
- `theme.subtle`
- `brand.glacier`
- `brand.titanium`
- `brand.success`
- `brand.warning`
- `brand.critical`

### Typography

- Use Inter/system UI as the main font.
- Reduce reliance on condensed racing typography.
- Use tabular numerals for metrics.
- Use calm medium weights instead of heavy bold display text.
- Avoid viewport-scaled text inside compact controls.

### Motion

- Use `cubic-bezier(0.22, 1, 0.36, 1)`.
- Keep tap/hover transitions around 120-150ms.
- Keep panel expansion around 250-350ms.
- Respect `prefers-reduced-motion`.
- Avoid bounce, overshoot, flashing, and aggressive scaling.

### Accessibility

- Set focus-visible outline to OUDENA glacier blue.
- Preserve reduced-motion override.
- Ensure button and interactive touch targets are at least 44px.
- Ensure color is not the only status indicator.

### Acceptance Criteria

- The global UI no longer depends on `#FFF200` as the main accent.
- Existing dark mode still works.
- Focus states are visible and calm.
- The visual system can be applied consistently without repeated hard-coded colors.

### Phase 3 Implementation Notes

Status: complete.

- `ui/src/index.css`: All OUDENA light-mode and dark-mode tokens added. `--label-accent`, `--chart-empty`, `--map-bg` kept as legacy vars for components not yet restyled (phases 5–10). Focus ring changed from `#FFF200` to `var(--accent)` (glacier `#74AFCB`). Google Fonts import updated to include Inter italic weights.
- `ui/tailwind.config.js`: `theme.*` extended with `bgSecondary`, `surfaceSoft`, `subtle`, `accent`, `accentMuted`, `success`, `warning`, `critical`. `brand.*` extended with `glacier`, `titanium`, `success`, `warning`, `critical`, `strava`. Legacy `brand.yellow`, `brand.red`, etc. retained for existing components. Added `boxShadow.soft/elevated`, `transitionTimingFunction.oudena`, `transitionDuration.tap/panel`.
- Build: clean. Tests: 23/23 passing.

## Phase 4: Shared UI Primitives

### Goal

Create small reusable primitives that make the redesign coherent without introducing a new app architecture.

### Suggested Additions

- `OudenaLogo`
  - Renders mark-only or full wordmark.
  - Uses the primary SVG geometry/colors.
  - Supports light/dark usage.
- `MetricTile`
  - Wraps current metric display behavior with calm surfaces and tabular numerals.
  - Supports primary and secondary emphasis.
- `HudPanel`
  - Reusable translucent/frosted panel surface.
  - Used for ride overlays and compact controls.
- `IconButton`
  - 44px minimum target.
  - Uses accessible labels.
  - Uses existing icon strategy or `lucide-react` where appropriate.

### Constraints

- Do not build a large design-system package in this phase.
- Do not replace all existing components at once.
- Add primitives only where they remove repeated styling or improve consistency.

### Acceptance Criteria

- Common OUDENA surface, button, logo, and metric treatments are reusable.
- Components remain local to the current React app.

### Phase 4 Implementation Notes

Status: complete.

- `ui/src/shared/ui/HudPanel.tsx`: translucent frosted surface (`bg-[var(--surface-soft)] backdrop-blur-md`), subtle border, `rounded-xl`, accepts `elevated` prop to switch between `shadow-soft` and `shadow-elevated`.
- `ui/src/shared/ui/MetricTile.tsx`: replaces racing Barlow Condensed unit labels with Inter medium; supports `primary` (display-size, clamp 64–120px) and `secondary` (28px body) emphasis; optional `label` and `note` slots using `var(--text-subtle)` / `var(--accent)`.
- `ui/src/shared/ui/IconButton.tsx`: enforces 44px min touch target; requires `aria-label`; sets `aria-pressed` only when `active` prop is explicitly passed; `ghost` and `surface` variants; hover and active states use glacier accent token.
- `OudenaLogo` already delivered in Phase 2.
- Build: clean. Tests: 23/23 passing.

## Phase 5: Pre-Ride Experience

### Goal

Turn the pre-ride screen into a calm personal riding hub with one dominant next action.

### Current Issues To Address

- Current branding is RideOS and visually high-contrast.
- The yellow divider/CTA language reads more racing/tooling than premium/calm.
- Import, Strava, route library, and start actions compete visually.

### Planned Changes

- Replace the current header with OUDENA logo, restrained product line, and calm connection/status controls.
- Use a soft background and spacious layout.
- Make the selected or recommended route visually dominant.
- Keep GPX import and Strava connection as secondary actions.
- Show route library as memory-oriented route cards, not a dense list.
- Use calm empty states:
  - `Noch keine Routen`
  - `Importiere eine GPX-Datei oder verbinde Strava.`
- Use one dominant CTA per state:
  - no route selected: `Route auswählen`
  - route selected: `Fahrt starten`
- Keep `Ohne Strecke starten` available but visually secondary.

### Selected Route Detail

The selected route detail should include:

- route name
- distance
- elevation gain/loss
- best or estimated time
- ghost availability
- large elevation preview
- start CTA
- advanced settings collapsed by default

### Acceptance Criteria

- The pre-ride screen feels like a calm route-selection hub.
- OUDENA is the visible brand.
- Advanced controls do not dominate first impression.
- Existing route selection and start behavior still works.

### Phase 5 Implementation Notes

Status: complete.

- `ui/src/features/pre-ride/PreRideScreen.tsx`:
  - Yellow divider `bg-[#FFF200]` removed; header now uses `border-b border-[var(--border)]`.
  - All `font-condensed font-bold tracking-widest uppercase` removed from labels, copy, and buttons; replaced with Inter `text-xs font-medium`.
  - `#FFF200` and `#E10600` hotspots removed; GPX drag/loading uses `var(--accent)` (glacier); errors use `var(--critical)`.
  - Strava section consolidated into the header for both route-selected and no-route states (previously split across header and sidebar).
  - "OHNE STRECKE STARTEN" yellow primary CTA → "Ohne Strecke fahren" quiet text link (`text-xs text-[var(--text-subtle)]`), visually secondary.
  - GPX dropzone: `border-2` sharp corners → `border border-dashed rounded-xl`; hover/active state uses glacier instead of yellow.
  - Empty state: `NOCH KEINE STRECKEN / GPX-DATEI HINZUFÜGEN` → "Noch keine Routen" + "Importiere eine GPX-Datei oder verbinde Strava."
  - "ANDERE STRECKEN" / "MEINE STRECKEN" labels → "Weitere Strecken" / "Meine Strecken" in Inter normal.
  - Left sidebar narrowed from 300px to 260px; `justify-center` removed so import zone sits naturally at top.
  - All behavior (WebSocket messages, route selection, file loading, Strava flow) unchanged.
- Build: clean (776ms, 45 modules). Tests: 23/23 passing.

## Phase 6: Route Cards And Route Detail

### Goal

Make route cards feel like recognizable ride memories instead of compact technical rows.

### Route Card Changes

- Use softer card surfaces with restrained shadow and border.
- Increase the visual prominence of route/elevation preview.
- Replace yellow elevation fills with glacier-blue line or soft area treatment.
- Keep metadata concise:
  - distance
  - elevation gain
  - best or estimated time
  - Strava/ghost availability
- Use quiet hover elevation, not aggressive scaling.
- Keep rename/delete available but low emphasis.

### Route Detail Changes

- Use a larger route/elevation section.
- Put `Fahrt starten` as the dominant CTA.
- Collapse advanced options by default.
- Keep route trimming discoverable but secondary.
- Maintain current `RideConfig` values and outbound start message behavior.

### Acceptance Criteria

- Route cards are easier to scan and less dense.
- Selected route detail clearly converts intent into starting a ride.
- Delete/rename actions remain keyboard and screen-reader accessible.

### Phase 6 Implementation Notes

Status: complete.

- `ui/src/features/pre-ride/RouteCard.tsx`:
  - `MiniProfile`: yellow fill `#FFF200` + black stroke replaced with glacier area fill (`#74AFCB` at 15% opacity) + `#74AFCB` stroke line as two separate SVG paths.
  - Card container: `border-[#FFF200]` selected/hover → `border-[var(--accent)] shadow-soft`; added `rounded-xl`.
  - Route name: `font-condensed font-bold text-[12px]` → `text-xs font-medium`.
  - Metadata spans: `font-condensed font-bold tracking-widest` + uppercase KM/M removed → `text-[10px] text-[var(--text-muted)]` in lowercase.
  - Best time: `#22C55E "BEST"` → `var(--success) "Bestzeit"`. Estimated: `"EST"` → `"ca."`.
  - Edit input: `border-[#FFF200] font-condensed font-bold` → `border-[var(--accent)] text-xs font-medium`.
  - Delete button hover: `#E10600` → `var(--critical)`.
  - Action buttons enlarged from `w-5 h-5` to `w-6 h-6`.
- `ui/src/features/pre-ride/RouteCardExpanded.tsx`:
  - Container: `border-[#FFF200]` → `border-[var(--accent)] rounded-xl shadow-elevated`.
  - Route name: `font-condensed font-bold text-[14px]` → `text-sm font-medium`.
  - Metadata: same cleanup as RouteCard.
  - Section label "STRECKENPROFIL": uppercase condensed bold → `text-[10px] font-medium text-[var(--text-muted)] "Streckenprofil"`.
  - Elevation SVG: `fill="#FFF200" stroke="#000"` → glacier gradient area + stroke (same pattern as MiniProfile).
  - "KEIN PROFIL" label: uppercase condensed → `text-[10px] text-[var(--text-subtle)] "Kein Profil verfügbar"`.
  - Trim toggle active state: `border-[#FFF200] text-[#FFF200]` → `border-[var(--accent)] text-[var(--accent)]`; button text un-uppercased.
  - Start button: `bg-[#FFF200] text-black font-condensed font-bold tracking-widest uppercase "STARTEN →"` → `bg-[var(--accent)] text-white font-medium text-sm rounded-lg "Fahrt starten →"`.
  - All behavior (trim, ride config, start message) unchanged.
- Build: clean (771ms, 45 modules). Tests: 23/23 passing.

## Phase 7: Ride Options And Progressive Disclosure

### Goal

Keep beginner flow simple while preserving advanced ride setup.

### Planned Changes

- Keep basic visible options minimal:
  - ghost
  - laps
  - warm-up/cool-down
- Move advanced options into a collapsed panel:
  - reverse route
  - route trimming
  - ERG mode
  - trainer difficulty if added later
  - pacing target if added later
- Use toggles/steppers with 44px touch targets.
- Keep disabled-state explanations calm and concise.

### Protocol Constraint

No WebSocket message shape changes:

- `reverse`
- `cutout_start_m`
- `cutout_end_m`
- `laps`
- `ghost`
- `warmup_s`
- `cooldown_s`
- `erg_mode`

must continue to be sent exactly as today.

### Acceptance Criteria

- Beginner users see fewer choices at first.
- Advanced users can still configure existing ride options.
- `protocol.test.ts` continues to pass.

## Phase 8: Live Ride Screen

### Goal

Move from a dashboard-like layout to a route-first ride cockpit.

### Planned Layout

Desktop:

```text
┌──────────────────────────────────────────┐
│ Top-left primary metrics   Top-right ghost│
│                                          │
│          Route visualization             │
│                                          │
│ Bottom elevation timeline                │
│ Bottom/right quiet controls              │
└──────────────────────────────────────────┘
```

Mobile:

```text
┌──────────────────────┐
│ Route visualization  │
│ Primary metrics      │
│ Elevation timeline   │
│ Ride controls        │
└──────────────────────┘
```

### Primary Metrics

Show max four primary metrics:

- power
- cadence
- speed
- ghost delta or heart rate if available later

Keep gear, grade, ERG target, lap, and phase information available but visually secondary.

### HUD Treatment

- Use translucent frosted panels.
- Preserve route visibility.
- Avoid large opaque sidebars during active ride.
- Use glacier/titanium accents.
- Avoid yellow/red racing UI except Strava orange where relevant.

### Connection And Error UX

Use calm messages:

- `Trainer verbunden`
- `Trainerverbindung unterbrochen`
- `Verbindung wird wiederhergestellt`

Avoid protocol-heavy user-facing text.

### Acceptance Criteria

- Map/route visualization is the dominant visual element.
- Metrics are readable at a glance.
- Controls remain accessible and do not obscure the route.
- Existing pause, gear shifting, view mode, ERG, ghost, and phase behavior remains functional.

## Phase 9: Ride States

### Goal

Add calm visual adaptation using existing telemetry, without changing backend data.

### Derived States

Normal:

- default ride view
- balanced metrics
- normal elevation timeline

Paused:

- route dims subtly
- pause/resume control becomes more prominent
- ride state remains visible

Reconnecting:

- preserve the ride view
- show calm connection overlay
- avoid blocking modal interruption

Completed:

- reduce HUD emphasis
- allow transition to summary later

Climb Focus:

- trigger when `effective_grade_pct >= 4` for roughly 10 seconds
- expand elevation timeline
- make grade/ghost slightly more prominent
- reduce nonessential metric emphasis

### Implementation Notes

- Derive climb focus client-side from existing telemetry.
- No new `TelemetryState` fields are required.
- Avoid complicated state machine changes in this phase.

### Acceptance Criteria

- Ride visual state adapts without backend changes.
- Climb focus does not flicker on short grade spikes.
- Reduced-motion users do not get cinematic camera drift or large transitions.

## Phase 10: Map, Terrain, Ghost, And Elevation Timeline

### Goal

Align route visualization with the OUDENA visual language.

### Mapbox / MiniMap Changes

- Keep Mapbox Standard and existing map implementation.
- Continue using monochrome theme.
- Prefer dawn/dusk atmosphere where practical.
- Change route line from yellow to glacier blue.
- Change rider marker from aggressive red to a calm high-contrast marker.
- Change ghost marker to muted translucent blue/titanium.
- Preserve camera modes:
  - chase
  - follow
  - birdseye
- Keep camera motion smooth and restrained.

### Elevation Timeline Changes

- Replace yellow profile fill with glacier route/elevation treatment.
- Add rider marker using accent color.
- Show ghost marker if available from existing telemetry.
- Support normal and climb-expanded heights.
- Keep distance labels readable.
- Avoid dense segment overlays in the first pass.

### Acceptance Criteria

- The route feels cinematic and calm.
- Ghost is visible but not aggressive.
- Elevation timeline feels like an emotional route timeline, not a chart wall.

## Phase 11: Responsive And Accessibility QA

### Goal

Make the redesign work intentionally across desktop, tablet, and mobile.

### Desktop

- Route visualization dominates.
- HUD remains persistent.
- Secondary controls stay peripheral.

### Tablet

- Touch-friendly cockpit.
- Controls are reachable and not cramped.

### Mobile

- Companion-first layout.
- Show only the most important metrics.
- Avoid compressing desktop sidebars.
- Preserve start/stop controls and route profile.

### Accessibility Requirements

- Minimum touch target: 44px.
- WCAG AA contrast minimum.
- Keyboard focus visible.
- Screen reader labels for icon buttons.
- Color-independent statuses.
- Reduced motion support.
- No text overlap at common viewport sizes.

### Acceptance Criteria

- Mobile does not feel like a squeezed desktop app.
- All core ride controls are reachable and accessible.
- Visual hierarchy remains calm and readable.

## Phase 12: Tests And Verification

### Automated Tests

Run from `ui/`:

```bash
npm test
npm run build
npm run lint
```

### Tests To Add Or Update

- OUDENA branding renders on the pre-ride screen.
- Advanced ride options are collapsed by default.
- Start ride payload stays unchanged.
- Accessible labels exist for key icon controls.
- Route card actions remain available.

### Manual QA Scenarios

Verify:

- light mode
- dark mode
- reduced motion
- empty route library
- route library with multiple routes
- selected route detail
- Strava disconnected
- Strava connected
- Strava syncing
- GPX import state
- route start
- live ride
- paused ride
- reconnecting state
- ghost visible
- ERG mode
- warmup/cooldown
- climb focus
- mobile viewport
- tablet viewport
- desktop viewport
- wide desktop viewport

### Acceptance Criteria

- Existing protocol tests still pass.
- Build succeeds.
- Lint succeeds or only reports pre-existing issues that are documented.
- No layout overlap or unusable controls in tested viewports.

## Phase 13: Later Product Architecture Alignment

### Goal

Keep the UI redesign compatible with the long-term local-first OUDENA architecture.

### Later Phases From `SW_DATA_ARCHITECTURE.md`

- Capacitor packaging.
- Local ride engine as a modular app package.
- Local SQLite route and ride storage.
- Local-first Strava route imports.
- Supabase auth.
- Supabase official route catalog.
- Optional metadata sync.
- Optional ride summary sync.
- App-store-ready icon and splash screen.
- Native BLE validation on iOS and Android.
- Account deletion and privacy flows.

### First UI Pass Constraint

Do not implement these architecture changes while doing the first OUDENA UI rebrand. The UI should be designed so these features can be added later without another full visual redesign.

## Recommended Implementation Order

1. Add OUDENA plan and align on scope.
2. Add logo assets and favicon.
3. Replace global tokens and Tailwind mappings.
4. Rebrand pre-ride header and app metadata.
5. Restyle shared buttons, focus states, panels, and metrics.
6. Restyle route cards.
7. Restyle selected route detail.
8. Collapse advanced ride options.
9. Rework live ride layout into route-first HUD.
10. Update map/elevation colors and ghost styling.
11. Add derived ride-state visuals.
12. Add tests.
13. Run full UI verification.
14. Do visual QA across responsive breakpoints.

## Implementation Risks

- Replacing the yellow accent everywhere at once may reduce contrast in some existing UI states.
- Moving from sidebar metrics to overlay HUD can cause map/control overlap if not carefully responsive.
- Frosted blur can be expensive on mobile if animated.
- Mapbox layer color changes must preserve route and marker visibility in both light and dark themes.
- Advanced-option collapse must not hide required ride-start configuration from experienced users.

## Risk Mitigations

- Use tokens first, then component-by-component restyling.
- Keep old behavior while changing presentation.
- Test light and dark mode after each major visual phase.
- Avoid animated blur and layout-thrashing effects.
- Keep route visualization and ride controls visible at every breakpoint.
- Keep all WebSocket payloads unchanged.

## Definition Of Done

The OUDENA UI/UX implementation is complete when:

- User-facing UI is branded as OUDENA.
- The app uses OUDENA design tokens globally.
- The current yellow/red racing look is replaced by glacier/titanium calm styling.
- Pre-ride, route cards, route detail, live ride HUD, map, and elevation timeline follow the guideline direction.
- Advanced options are progressively disclosed.
- Existing trainer, route, telemetry, ghost, ERG, and pause behavior still works.
- Tests, build, and lint have been run and results documented.
- Manual responsive and accessibility QA has been completed.
