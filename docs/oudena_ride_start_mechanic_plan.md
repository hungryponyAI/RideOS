# Ride Start Mechanic Simplification Plan

## Summary

Change ride starting so the default action is immediate start with default ride settings. Detailed route options stay available through a small secondary `Optionen` button. In the route library, clicking a route selects it into a larger quick-focus card; clicking another route swaps the focus card and shrinks the previous route back into the grid.

## Key Changes

- Add a shared default config helper for immediate starts:
  - `ghost` from existing app/profile preference
  - normal direction, full route, `laps: 1`
  - no warmup, cooldown, ERG
  - `physicsMode: true`
- Update `HomeScreen`:
  - Hero `Jetzt fahren` starts the route immediately.
  - Compact route cards start immediately on main tap.
  - Add small `Optionen` controls on hero/compact cards that open Routes with that route selected in full options mode.
- Update `PreRideScreen`:
  - Default selected route surface becomes a new quick-focus card with route preview, metadata, large start button, and small `Optionen` button.
  - Clicking another route selects it, makes it the focus card, and returns the previous selected route to the grid.
  - Full `RouteCardExpanded` is reused inline only when the user clicks `Optionen`.
  - Starting is allowed even when no trainer is connected; trainer status remains informational.
- Update summary "ride again":
  - Starts the same route immediately with default settings and the existing countdown ritual.

## Interface Changes

- Extend route opening intent in `AppShell`, for example:
  - `routePreSelect: { routeId: string; mode: "focus" | "options" } | null`
  - `handleOpenRoutes(routeId?, mode = "focus")`
- Extend `PreRideScreen` props:
  - `initialRouteId?: string | null`
  - `initialMode?: "focus" | "options"`
  - keep `onStartRide(routeId, routeName, config)`
- Extend `HomeScreen` props:
  - add `onStartRide(routeId, routeName, config)`
  - keep `onOpenRoutes(routeId?, mode?)`

## Test Plan

- Home tests:
  - hero start calls immediate ride start, not route opening
  - compact card main tap starts immediately
  - compact/hero options button opens Routes with selected route in options mode
  - last route id is stored on immediate start
- PreRide tests:
  - clicking a route shows quick-focus card
  - clicking another route swaps focus route
  - quick-focus start uses default config
  - options button renders the full expanded options panel
  - full options start passes modified config
- Summary test:
  - ride again starts immediately with default config
- Run `npm test` and `npm run build`.

## Assumptions

- No trainer confirmation is added.
- No per-route or last-used option memory is added yet.
- The full options UI remains the existing inline expanded panel, not a modal or new screen.
