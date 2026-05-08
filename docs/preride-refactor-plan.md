# Pre-Ride Refactor — Plan

Scope: refactor `PreRideScreen` so selecting a route **expands** that card into a
detail/setup view, then expose six new ride-configuration options. Touches both
the React UI and the Python engine (route loading + control loop + ghost).

Status: planning only — no code changes yet. All work is inside `ui/` and
`engine/` and respects the cockpit-not-dashboard UI principle.

---

## 1. UX flow (target)

```
[Route grid]                       [Route grid + one expanded card]
   ┌───┬───┬───┐                       ┌───────────────────────────────┐
   │ A │ B │ C │     click B  →        │       BIG B  (expanded)        │
   ├───┼───┼───┤                       │  large elevation + map preview │
   │ D │ E │ F │                       │  options panel  ▸  STARTEN     │
   └───┴───┴───┘                       └───────────────────────────────┘
                                       ┌───┬───┬───┐
                                       │ A │ C │ D │  ← others shrink/dim
                                       └───┴───┴───┘
```

- Selection happens **inline in the grid**: the selected card grows to span the
  full grid width (or both columns on `xl`), pushing the others down. The
  current "left column shows ghost picker" pattern is removed.
- Expanded card shows: name + Strava badge, large elevation profile (re-using
  `ElevationProfile` styles), distance/elev gain/loss/best-or-est-time, and an
  **options panel** below.
- The **start button** moves into the expanded card (top-right corner).
- "Auswahl aufheben" becomes a small × on the expanded card.
- The left column (upload + Strava connect) stays as-is when no route is
  selected; when a route is selected it can either stay visible (for upload of
  another route) or be hidden — recommendation: **hide it** to avoid splitting
  attention. The Strava sync state stays accessible via a small badge in the
  header.

---

## 2. Ride options (the six requested)

Each option has a UI control, an engine-side effect, and a wire-format
addition. All six are configured **before** `STARTEN` is pressed and shipped
together as a single `start_ride` message (or as fields appended to
`load_saved_route`). The current `set_ghost` two-step dance (load route, then
configure ghost) becomes one atomic `start_ride` payload.

### 2.1 Ghost rider — yes / no (auto mode)

**Replaces** the current 3+ option `GhostPicker`.

- UI: a single toggle — `GHOST RIDER  [ ON | OFF ]`.
- When ON, the engine picks the ghost mode automatically:
  1. If route has `strava_id` and the streams file exists → `mode=strava`.
  2. Else → `mode=estimated` using `moving_time_s` or the FTP-based pace
     estimate already computed in `RouteCard.estimateTimeS`.
- When OFF, no ghost.
- The toggle is **disabled** (forced OFF) when reverse mode or erg mode is on
  (see below).
- Wire change: `set_ghost.mode` gains `"auto"`. The engine resolves auto →
  strava|estimated|none using the rule above.

### 2.2 Reverse route — yes / no

- UI: toggle `RICHTUNG  [ →  |  ← ]`. Default `→`.
- When reverse is ON:
  - Ghost toggle is **disabled and forced OFF** (the ghost time-streams are for
    the original direction; reversing them is misleading).
  - Cutout, laps, warm-up, cool-down, erg mode all still apply — but to the
    reversed route.
- Engine implementation: in `_do_load_route`, after parsing GPX, if `reverse`
  is set we build a new `RouteData` with:
  - `lats`, `lons`, `elevations_m` reversed.
  - `cum_dist_m` recomputed from the reversed sequence (or
    `total_dist_m - x` then reversed).
  - `grades_pct` recomputed segment-wise (sign flips and indices shift —
    cleanest to recompute via `_parse_gpx`-style loop on the reversed points
    rather than negate-and-reverse, to keep the smoothing identical).
- The `RouteTracker` itself doesn't need to know — it just runs against the
  rebuilt RouteData.

### 2.3 Cutout (route trimming)

- UI: a **video-editor-style trim handle** overlaid on the expanded elevation
  profile.
  - Two draggable handles on the left and right edges; the area between them
    stays bright, the area outside is dimmed.
  - Numeric readouts under each handle: `0.0 km` … `12.4 km`.
  - Snap to nearest 100 m.
  - Defaults: full route (handles at 0 and `total_dist_m`).
- Implementation:
  - New component `RouteTrimSlider` taking `elevationChart: ElevationChartDatum[]`
    and `onChange(startM, endM)`. Renders the same SVG path as
    `ElevationProfile` but in a static larger size with two draggable rails.
  - State on `PreRideScreen`: `trimStartM`, `trimEndM`.
- Engine: send `cutout_start_m` / `cutout_end_m` in the start payload. In
  `_do_load_route`, after reverse is applied, slice the arrays to that range
  and rebase `cum_dist_m` to `0`.
- Ghost on cutout: ghost is allowed. Strava streams need to be **clipped to the
  same distance window** — for `from_strava_streams`, find the `time` value at
  `cutout_start_m` and `cutout_end_m` along the ghost's own cum-dist, then
  rebase the ghost's `times_s` to start at 0 and trim. New helper
  `GhostTracker.from_strava_streams_clipped(streams, start_m, end_m)`.

### 2.4 Repeat / laps

- UI: stepper `LAPS  [ -  1  + ]` (1–20).
- Engine: when laps > 1, `RouteTracker` wraps around at `total_dist_m` instead
  of completing. New constructor arg `laps: int = 1`. New state field
  `_lap_index: int`. On reaching `total_dist_m - epsilon`, reset `_position_m
  = 0` and increment `_lap_index`. Complete only when `_lap_index >= laps`.
- Telemetry: add `lap_index` and `lap_count` to the per-tick telemetry payload
  so the ride screen can render `LAP 2 / 5`.
- Ghost: ghost loops the same way — its `_elapsed_s` modulo
  `times_s[-1]` for index lookup. Time-gap calculation must use lap-aware
  distance: `total_distance_covered = lap_index * total_dist_m + position_m`.

### 2.5 Warm-up / cool-down

- UI: two independent toggles
  - `WARM-UP  [ OFF | 2 min @ 90 W ]`
  - `COOL-DOWN  [ OFF | 2 min @ 90 W ]`
  - (Hard-code 120 s, 90 W, 80 rpm for now per user spec; expose duration as a
    follow-up.)
- Engine: introduce a **phase machine** in front of the existing route control
  loop. Phases:
  1. `warmup` (if enabled): 120 s wall-clock with controller in **erg mode at
     90 W** (FTMS Set Target Power, op `0x05`). `RouteTracker` not started yet
     — `position_m = 0`, grade pinned to 0.
  2. `route` (or `route × laps`): existing `RouteTracker` + grade simulation.
  3. `cooldown` (if enabled): 120 s erg @ 90 W after route complete. Currently
     `RouteTracker.run` already exits and sets grade = 0; add a follow-up
     timer that switches to erg-90W-mode for 120 s, then signals ride end.
- This requires extending `FtmsController` with `set_target_power(watts: int)`
  using `OpCode.SET_TARGET_POWER` (need to add to `engine/ftms/control_point.py`
  if not already there) and a small mode flag in `RideState`:
  `ride_phase: Literal["warmup", "route", "cooldown", "done"]` and
  `target_power_w: Optional[int]` so `run_control_loop` can branch:
  - if `target_power_w is not None`: send Set Target Power (gated by epsilon
    + keepalive like the grade path).
  - else: existing simulation-grade path.

### 2.6 Erg mode

- UI: toggle `ERG MODE  [ OFF | ON ]`.
- When ON:
  - Ghost toggle is disabled and forced OFF.
  - Gear shifting is no-op (the gear engine is bypassed; `target_power_w` is
    driven directly from the route profile).
  - Cadence target is shown but **not commandable** via FTMS (KICKR Core has no
    cadence-control characteristic). UI shows the **suggested** cadence; the
    rider matches it manually.
- Power profile derivation:
  - Per route segment, compute target watts as a function of grade and FTP:
    `target_w = ftp * f(grade_pct)` where `f` is a clamped piecewise:
    - `grade ≤ -2%`  → `0.50 * ftp`  (recovery)
    - `-2..0%`       → `0.65 * ftp`
    - `0..3%`        → `0.85 * ftp`  (tempo)
    - `3..6%`        → `1.00 * ftp`  (threshold)
    - `6..9%`        → `1.10 * ftp`  (VO2)
    - `> 9%`         → `1.20 * ftp`  (cap)
  - Cadence target: simple grade-keyed table (90 / 85 / 80 / 75 / 70 rpm) shown
    in UI only.
  - Smooth target_w with the same 5-point rolling mean we already use for
    grades to avoid hammering FTMS Set Target Power on noisy grade data.
- Engine: `RouteTracker` keeps advancing position; instead of writing
  `state.real_grade_percent`, it writes `state.target_power_w` from the
  per-segment power table. `run_control_loop` sends Set Target Power.
- Wire: `start_ride.erg_mode: bool`. Telemetry adds `target_power_w` so the UI
  can render the prescribed wattage alongside the actual.

---

## 3. Data flow / wire protocol changes

New outbound message replacing the current two-step (`load_saved_route` +
`set_ghost`):

```ts
interface StartRideMessage {
  type: "start_ride";
  route_id: string;
  reverse: boolean;
  cutout_start_m: number | null;   // null = from start
  cutout_end_m: number | null;     // null = to end
  laps: number;                    // ≥ 1
  ghost: boolean;                  // engine resolves auto strava|estimated
  warmup_s: number;                // 0 = off; 120 = on
  cooldown_s: number;              // 0 = off; 120 = on
  erg_mode: boolean;
}
```

Telemetry additions:

```ts
interface TelemetryMessage {
  // ...existing fields
  ride_phase: "warmup" | "route" | "cooldown" | "done";
  lap_index: number;        // 0-based
  lap_count: number;        // requested
  target_power_w: number | null;  // only set in erg/warmup/cooldown
}
```

`SetGhostMessage` and the `GhostPicker` UI are deleted. The engine-side
`_apply_ghost` becomes part of the `_do_load_route` path driven by the
start_ride payload — no more `pending_ghost`/race-condition handling.

---

## 4. UI implementation breakdown

Files touched:

| File | Change |
|---|---|
| `ui/src/components/PreRideScreen.tsx` | Remove `GhostPicker`, the left-column conditional, and the `set_ghost` two-step. Drive expansion via `selectedRoute` and render the new `<ExpandedRouteCard>` overlay. |
| `ui/src/components/RouteCard.tsx` | Add `expanded` prop; render compact (current) vs expanded layouts. Or: split into `RouteCardCompact` + new `RouteCardExpanded` to keep the compact card small. |
| `ui/src/components/RouteCardExpanded.tsx` *(new)* | Big elevation profile with cutout slider, options panel, START button, close ×. |
| `ui/src/components/RouteTrimSlider.tsx` *(new)* | Reusable two-handle range slider over an SVG elevation profile. |
| `ui/src/components/RideOptions.tsx` *(new)* | The six toggles/steppers. Pure controlled component — props in, `onChange` out. |
| `ui/src/types/route.ts` | New `StartRideMessage`. New telemetry fields. Remove `SetGhostMessage`. |
| `ui/src/App.tsx` | Wire telemetry `ride_phase`, `lap_index`, `target_power_w` into the ride screen (lap counter, target watts vs actual, phase banner). |
| `ui/src/hooks/useTelemetry.ts` | Decode the new fields. |

Visual rules (cockpit principle):
- Toggles use the existing yellow-on-black accent. No third color.
- Disabled toggles dim to `--text-muted` and pointer-events:none.
- Cutout handles use the same `#FFF200` accent; the dimmed-out region uses the
  surface color at 60% opacity.
- Lap counter in ride screen sits next to the gear number — never larger than
  the speed reading.

---

## 5. Engine implementation breakdown

Files touched:

| File | Change |
|---|---|
| `engine/engine/route/loader.py` | Add `reverse_route(route: RouteData) -> RouteData` and `slice_route(route, start_m, end_m) -> RouteData`. Both return new RouteData with rebased `cum_dist_m` and grades recomputed (not naive negate). |
| `engine/engine/route/tracker.py` | Add `laps: int` ctor arg. On end, increment lap counter and reset position; only fire `on_complete` when `lap_index >= laps`. Pass `lap_index` to telemetry by writing it into RideState. |
| `engine/engine/route/ghost.py` | Add `from_strava_streams_clipped(...)` and lap-aware `snapshot()` (use `total_distance_covered` for time-gap math). |
| `engine/engine/control/state.py` | Add `ride_phase`, `lap_index`, `lap_count`, `target_power_w`, `target_cadence_rpm` (display-only). |
| `engine/engine/control/controller.py` | Add `set_target_power(w: int)`. In `run_control_loop`, branch: erg path vs grade path. |
| `engine/engine/ftms/control_point.py` | Add `OpCode.SET_TARGET_POWER = 0x05` + `encode_set_target_power(watts: int)` if missing. |
| `engine/engine/control/phases.py` *(new)* | Phase machine: warmup → route → cooldown. Owns the timer for warm-up/cool-down and toggles `state.target_power_w` / `state.ride_phase`. Spawned from `_do_load_route` instead of (or alongside) the bare `RouteTracker`. |
| `engine/engine/ws/server.py` | Replace the `set_ghost` + `load_saved_route` handlers with a single `start_ride` handler that builds the modified RouteData (reverse + cutout), spawns the phase machine, and configures the ghost. Delete the `pending_ghost` race handling entirely. |
| `engine/engine/route/erg.py` *(new)* | Pure function `compute_target_power_table(route, ftp_w) -> tuple[float, ...]` mirroring `grades_pct` shape, plus the cadence table. Unit-testable. |

---

## 6. Phasing (suggested commit order)

Each phase is independently shippable and behind a default-off flag where
necessary, so the ride screen never breaks.

1. **UI shell only.** Inline-expand a selected `RouteCard` into the new
   expanded layout. Keep the existing `set_ghost`/`load_saved_route` flow —
   render the old `GhostPicker` inside the new layout for now. No engine
   changes. (Visual checkpoint.)
2. **Wire protocol switch.** Introduce `start_ride` on both sides; delete
   `set_ghost`. Engine `_do_load_route` accepts the new fields but ignores
   reverse/cutout/laps/warmup/cooldown/erg.
3. **Reverse + cutout.** `reverse_route` and `slice_route` in loader; cutout
   slider in UI. Ghost-from-strava clipping.
4. **Laps.** Tracker wraparound, ghost lap-aware snapshot, telemetry lap
   counter, ride-screen lap badge.
5. **Warm-up / cool-down + erg mode.** Add `set_target_power`, the phase
   machine, `compute_target_power_table`, and the ride-screen target-power
   readout. (These two ship together because they share the FTMS Set Target
   Power plumbing.)
6. **Polish.** Disabled-state interactions (ghost-off-when-reverse-or-erg),
   default values persisted to localStorage so the rider's typical setup
   sticks across reloads.

---

## 7. Open questions for the user

1. **Warm-up/cool-down at the start vs end** — is it always start-of-warmup +
   end-of-cooldown, or do you want each independently selectable at either
   end? (Plan above assumes start/end respectively, matching common usage.)
2. **Lap upper bound** — 20 laps reasonable or higher?
3. **Erg mode power curve** — the piecewise %FTP table in §2.6 is a sensible
   default, but if you have a preferred mapping (e.g. always 75 % flat, +5 %
   per 1 % grade) we should use that instead.
4. **Cutout snap granularity** — 100 m default, or per-kilometre stops?
5. **Persistence** — should the last-used option set be remembered per route
   (so re-selecting "Alpe d'Huez" pre-fills laps=2), or globally?

---

## 8. Out of scope (explicit non-goals)

- No changes to the Zwift Click handshake or BLE scanning.
- No changes to the GPX upload path or library schema (RouteLibraryEntry stays
  as it is — the new options are session-state, not stored per route, except
  maybe later as the §7-5 follow-up).
- No multi-rider / online laps, no video overlay, no street-view changes —
  these stay in the deferred bucket per the project notes.
