# OUDENA Startup, Profile Selection, And Motion Plan

## Purpose

This plan defines a Netflix-inspired OUDENA startup experience:

1. The app opens with a cinematic intro.
2. The user chooses a riding profile.
3. The selected profile enters the existing OUDENA home screen.
4. Screen and item transitions become consistent across the app.

The goal is to make app launch feel personal, calm, and premium while preparing the product for future backend/cloud profile sync.

## Confirmed Product Decisions

- The intro appears on every app launch.
- The intro text is `Willkommen bei OUDENA`.
- After the intro, the user always lands on a Netflix-style profile selection screen.
- The app does not remember and auto-enter the last selected profile.
- Profiles should be designed for future backend/cloud support.
- Profiles should eventually scope:
  - athlete settings
  - onboarding status
  - routes
  - ride history
  - favorites
  - Strava connection/state
- Profile icons should be OUDENA route-inspired icons.
- Maximum profile count is 3.
- Creating a new profile should start onboarding automatically.
- Profile switching should later be available from profile/settings.
- Motion should support both cinematic and subtle modes.
- Cinematic motion is the default.
- Reduced-motion user preferences must override cinematic behavior.

## Current App Baseline

The current app already has:

- A React/Vite app shell in `ui/src/app/App.tsx`.
- Explicit app views:
  - `home`
  - `routes`
  - `preparing`
  - `ride`
  - `summary`
  - `analytics`
  - `devices`
  - `settings`
- OUDENA design tokens in `ui/src/index.css`, including:
  - `--accent`
  - `--ease-oudena`
  - reduced-motion handling
- Local onboarding state in `ui/src/features/onboarding/useOnboarding.ts`.
- Global athlete settings in `ui/src/features/settings/hooks/useAthleteSettings.ts`.

The app does not yet have:

- A startup intro gate.
- A profile selection screen.
- Profile-scoped local storage.
- A shared motion mode abstraction.
- Consistent transitions between all app screens and expanding items.

## Target User Flow

### Every Launch

1. User opens the app.
2. Fullscreen intro appears.
3. OUDENA logo is shown first.
4. Text appears: `Willkommen bei OUDENA`.
5. Intro fades/cinematically transitions to profile selection.
6. User selects a profile.
7. App enters the existing OUDENA home screen.

### New Profile

1. User clicks the plus profile tile.
2. Create-profile modal opens.
3. User enters a profile name.
4. User chooses a route-inspired icon.
5. Profile is created.
6. New profile is selected.
7. Onboarding starts automatically for that profile.

### Returning Profile

1. User selects an existing profile.
2. If profile onboarding is complete, app opens Home.
3. If profile onboarding is not complete, onboarding opens for that profile.

## Proposed Entry State

Add an entry gate before the existing app shell.

```ts
type EntryStage = "intro" | "profiles" | "app";
```

Suggested render hierarchy:

```tsx
<WSProvider>
  <ThemeProvider>
    <ErrorBoundary>
      <ProfileProvider>
        <MotionProvider defaultMode="cinematic">
          <AppEntryGate />
        </MotionProvider>
      </ProfileProvider>
    </ErrorBoundary>
  </ThemeProvider>
</WSProvider>
```

`AppEntryGate` decides whether to render:

- `StartupIntro`
- `ProfileSelectionScreen`
- current `AppShell`

## Proposed Files

```txt
ui/src/features/profiles/
  ProfileSelectionScreen.tsx
  ProfileCreateModal.tsx
  RouteProfileIcon.tsx
  ProfileProvider.tsx
  useProfiles.ts
  types.ts

ui/src/features/startup/
  StartupIntro.tsx
  AppEntryGate.tsx

ui/src/shared/motion/
  MotionProvider.tsx
  useMotionMode.ts
  ScreenTransition.tsx
  ExpandableTransition.tsx
```

## Profile Data Model

Use a cloud-ready local model from the beginning.

```ts
export interface OudenaProfile {
  id: string;
  displayName: string;
  iconSeed: string;
  iconVariant: "route";
  createdAt: string;
  updatedAt: string;
  cloudId: string | null;
  syncStatus: "local" | "pending" | "synced";
}
```

### Local Storage Keys

Use profile-aware keys so the future backend migration is straightforward.

```txt
oudena_profiles
oudena_active_profile_id
oudena_profile_settings:{profileId}
oudena_onboarding_done:{profileId}
oudena_routes:{profileId}
oudena_favorites:{profileId}
oudena_history:{profileId}
oudena_strava_state:{profileId}
```

### Migration Notes

Initial implementation may keep existing global route/history behavior if needed, but the new profile API should expose profile-scoped methods from the start.

Existing global keys to migrate or bridge later:

- `rideos-athlete`
- current onboarding key
- current route library cache
- current favorites cache
- current history cache

## Profile Selection UX

### Layout

- Fullscreen dark or neutral OUDENA background.
- Centered heading: `Wer fährt?`
- Profile grid with up to 3 profile tiles.
- Plus tile appears only when fewer than 3 profiles exist.
- Profile tiles should be large enough for touch.
- Layout should work on desktop, tablet, and mobile.

### Profile Tile

Each tile contains:

- Route-inspired icon.
- Profile name.
- Focus/hover state.
- Optional subtle cinematic entrance animation.

### Plus Tile

The plus tile:

- Opens the create-profile modal.
- Disappears once 3 profiles exist.
- Uses calm copy such as `Profil hinzufügen`.

### Empty State

If no profiles exist:

- Show the plus tile prominently.
- The first profile creation path should feel like setup, not an error state.

## Route-Inspired Profile Icons

Icons should feel connected to OUDENA's route-first identity.

Recommended approach:

- Generate deterministic SVG icons from `iconSeed`.
- Use simple abstract route shapes:
  - ascent line
  - switchback line
  - loop route
  - ridge profile
- Use OUDENA tokens:
  - glacier blue accent
  - charcoal background
  - muted graphite border
- Avoid cartoon avatars, gamified badges, or loud colors.

## Create Profile UX

Fields:

- Profile name
- Route icon choice

Validation:

- Name is required.
- Trim whitespace.
- Reject duplicate names only if the match is exact or case-insensitive.
- Maximum 3 profiles.

After creation:

- Select the new profile.
- Enter the app.
- Start onboarding automatically.

## Motion Modes

Add a motion mode abstraction.

```ts
export type MotionMode = "cinematic" | "subtle";
```

Default:

```ts
const DEFAULT_MOTION_MODE: MotionMode = "cinematic";
```

### Cinematic Mode

Use for the default premium experience.

Recommended behavior:

- Intro logo fades in and subtly scales.
- Intro text appears after the logo.
- Profile screen crossfades in.
- Profile tiles stagger in slightly.
- App shell fades in after profile selection.
- Screen transitions use opacity and small translate/scale.
- Expanding items use smooth height/opacity transitions.

Recommended timings:

- Tap: 120ms
- Hover: 150ms
- Expand: 250ms
- Modal: 350ms
- Startup cinematic: 600-900ms

Recommended easing:

```css
cubic-bezier(0.22, 1, 0.36, 1)
```

### Subtle Mode

Use for users who prefer less movement but have not enabled system reduced motion.

Recommended behavior:

- Short fades only.
- No scale.
- No stagger.
- No large translate.
- Expansions still animate softly.

### Reduced Motion

If `prefers-reduced-motion: reduce` is active:

- Disable cinematic scale and movement.
- Use immediate state changes or very short opacity changes.
- Do not stagger profile tiles.
- Do not animate large screen movement.

## Shared Transition Components

### ScreenTransition

Use around app screens.

Responsibilities:

- Animate between `AppView` changes.
- Support `cinematic` and `subtle`.
- Respect reduced motion.
- Avoid breaking active ride rendering.

### ExpandableTransition

Use for expanding/changing items.

Initial targets:

- Route card expansion.
- Advanced ride options.
- Analytics detail sections.
- Settings/profile panels.
- Summary detail sections.

Guidelines:

- Prefer opacity and transform where possible.
- Use height/max-height only where content expansion requires it.
- Avoid animated blur on mobile.
- Avoid layout shifts that move primary controls unexpectedly.

## Integration With Existing App

### App Shell

Current `AppShell` should remain responsible for internal navigation after a profile is selected.

Needed changes:

- Move current `AppShell` behind `AppEntryGate`.
- Pass `activeProfile` through context or props.
- Make onboarding profile-scoped.
- Keep active ride behavior isolated from profile switching.

### Onboarding

Current onboarding key should become profile-scoped.

Suggested API:

```ts
useOnboarding(profileId: string)
```

New profile behavior:

- New profile starts with onboarding incomplete.
- Selecting a new profile opens onboarding automatically after entering the app.

### Athlete Settings

Current global athlete settings should become profile-scoped.

Suggested API:

```ts
useAthleteSettings(profileId: string)
```

Migration behavior:

- If a profile has no settings yet, use defaults.
- Optional: when the first profile is created, copy existing global `rideos-athlete` settings into that profile.

### Routes, Favorites, History, Strava

Target behavior is profile-scoped, but this can be phased.

Recommended implementation order:

1. Scope onboarding and athlete settings first.
2. Scope favorites next.
3. Scope route library and history after confirming backend expectations.
4. Scope Strava after deciding whether Strava is app-level or profile-level in the backend.

## Implementation Phases

### Phase 1: Profile Foundation

Tasks:

- Add profile types.
- Add `useProfiles`.
- Add profile local storage.
- Enforce max 3 profiles.
- Add active profile state.
- Add tests for create/select/delete constraints.

Acceptance criteria:

- Profiles can be created locally.
- Profiles can be selected.
- Maximum 3 profiles are allowed.
- Active profile is available to the app.

### Phase 2: Startup Intro

Tasks:

- Add `StartupIntro`.
- Render OUDENA logo.
- Reveal `Willkommen bei OUDENA`.
- Transition to profile selection.
- Respect reduced motion.

Acceptance criteria:

- Intro appears on every launch.
- Text appears after logo.
- Intro proceeds to profile selection automatically.

### Phase 3: Profile Selection Screen

Tasks:

- Add Netflix-style profile grid.
- Add route-inspired icons.
- Add plus tile.
- Add create-profile modal.
- Select profile on click.

Acceptance criteria:

- Existing profiles render as selectable icons.
- Plus tile appears below 3 profiles.
- Plus tile disappears at 3 profiles.
- Selecting a profile enters the app.

### Phase 4: Profile-Scoped Onboarding And Settings

Tasks:

- Update onboarding storage to include profile id.
- Update athlete settings storage to include profile id.
- Start onboarding automatically for newly created profiles.
- Keep existing settings UI behavior intact.

Acceptance criteria:

- Each profile has its own onboarding state.
- Each profile has its own athlete settings.
- New profile starts onboarding automatically.

### Phase 5: Motion Provider And Screen Transitions

Tasks:

- Add `MotionProvider`.
- Add `motionMode` with default `cinematic`.
- Add switchable `subtle` mode.
- Add `ScreenTransition`.
- Wrap non-ride app views.

Acceptance criteria:

- Motion can switch between `cinematic` and `subtle`.
- Cinematic is default.
- Reduced motion disables cinematic movement.
- App navigation transitions smoothly.

### Phase 6: Item Expansion And Change Transitions

Tasks:

- Apply shared transitions to expanding/changing UI.
- Start with route card expansion and advanced ride options.
- Extend to settings/profile and analytics sections.

Acceptance criteria:

- Expanding items feel smooth and stable.
- No controls overlap or clip during transitions.
- Reduced motion is respected.

### Phase 7: Later Profile Settings

Tasks:

- Add profile area in Settings.
- Allow switching profile from Settings.
- Allow editing profile name/icon.
- Consider profile deletion/export once data scoping is stable.

Acceptance criteria:

- User can switch profiles later without relaunching.
- User can edit profile identity.
- Active ride state prevents unsafe profile switching.

## Testing Plan

Add tests for:

- Intro renders on every app launch.
- Intro advances to profile selection.
- Profile picker renders existing profiles.
- Plus tile appears below 3 profiles.
- Plus tile disappears at 3 profiles.
- Create profile validates required name.
- Create profile selects the new profile.
- New profile starts onboarding.
- Existing profile with completed onboarding opens Home.
- Motion mode defaults to cinematic.
- Motion mode can switch to subtle.
- Reduced motion disables cinematic classes/behavior.
- Current ride flow still works after profile selection.

## Risks And Guardrails

- Do not allow profile switching during an active ride.
- Do not block route/ride functionality while profile-scoping is incomplete.
- Do not create backend assumptions before backend schema exists.
- Do not duplicate the app shell; keep profile startup as a gate before it.
- Do not use loud, gamified, or cartoonish profile visuals.
- Keep startup motion premium and restrained even in cinematic mode.
- Keep all startup/profile UI keyboard accessible.
- Keep all profile controls touch-friendly.

## Open Follow-Up Decisions

- Whether Strava should be strictly profile-scoped or account/app-scoped in the future backend.
- Whether deleting a profile should delete all profile-scoped local data immediately or archive it first.
- Whether the first created profile should copy existing global athlete settings.
- Whether motion mode should be user-configurable in Settings in the first implementation or kept as a developer-level property first.
