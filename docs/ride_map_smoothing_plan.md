# Ride Map Smoothing Plan

Goal: make ego marker, ghost marker, and camera motion glide smoothly on the ride screen instead of stepping every 250 ms.

## Problem analysis

Data cadence vs. render cadence mismatch.

- Engine broadcasts telemetry every **250 ms** (4 Hz) — `engine/transport/ws/outbound.py:129` (`asyncio.sleep(0.25)`).
- Ego (`MiniMap.tsx:290`): `easeTo` with `POS_TWEEN_MS = 80 ms` per update. Marker arrives at target in 80 ms, then sits idle ~170 ms → "stop-motion" feel.
- Ghost (`MiniMap.tsx:316`): `ghostSrc.setData(...)` on every prop change. No tween at all → hard snap every 250 ms (the visible "jumping").
- Camera (`MiniMap.tsx:290`): bearing/pitch/zoom share the same 80 ms ease → micro-jerks on every bearing recompute.
- No requestAnimationFrame loop — all motion is driven reactively by WS messages.

What we have available for smoothing:
- `coords` + `cumDist` route polyline → spatial interpolation already works for ego.
- `position_m` (ego, along-route), `ghost_lat`/`ghost_lng`, `ghost_bearing_deg`, `speed_kmh`.
- We can derive a per-frame target from the most recent sample + a forward predictor.

## Strategy

Decouple **data updates (4 Hz, reactive)** from **render updates (60 fps, rAF loop)**.
Each WS sample only updates *target state*. A `requestAnimationFrame` loop interpolates from current → target every frame, with optional velocity-based extrapolation so the marker keeps moving smoothly through the 250 ms gap.

Three actors, same pattern, different smoothing:
1. **Ego** — along-route position (`position_m`), interpolated spatially. Smooth.
2. **Ghost** — geographic position (lat/lng), interpolated **along the same route** when possible (project onto polyline), straight-line lerp as fallback.
3. **Camera** — center/bearing/pitch/zoom, follows ego with critically-damped springs (no hard cuts except view-mode change).

---

## Phase 1 — Baseline & instrumentation (small)

Add a dev-only overlay to make jitter visible before fixing it.

- Add a `?debugMotion=1` toggle (URL search-param) gated `import.meta.env.DEV`.
- Overlay in `MiniMap` showing: WS sample arrival Δt (ms), current vs. target position delta (m), rAF frame interval, animation frame skip count.
- Capture a 10 s recording (Chrome perf trace or just logged samples) as the **before** baseline.

**Deliverable:** screenshots/numbers documenting current jitter so subsequent phases can be compared. No behavior change for end users.

---

## Phase 2 — Smooth ghost marker (highest visible win)

Eliminate the hard 250 ms snap on the ghost.

- Introduce internal `ghostTargetRef = { lat, lng, bearing, receivedAt }` updated whenever `ghostLat`/`ghostLng` props change.
- Keep a `ghostCurrentRef` (rendered position). On each rAF tick, lerp toward target with α derived from the expected sample period (`α = 1 - exp(-dt / τ)`, `τ ≈ 180 ms`).
- Use `setData` only inside the rAF loop, never directly from the prop effect.
- **Predictive extrapolation** (optional, behind sample-staleness guard): if the previous two ghost samples agree on a heading & cadence, extrapolate forward at the implied speed so the ghost keeps moving between samples instead of always lagging.
- Project ghost position onto the route polyline when the cross-track distance is small (< 5 m) — keeps ghost glued to the path on curves; fall back to free lat/lng otherwise.

**Deliverable:** ghost glides between samples. No more jumps.

**Risk:** ghost may briefly "overshoot" if speed drops abruptly. Mitigation: clamp extrapolation horizon to `min(2 * sample_period, 500 ms)`.

---

## Phase 3 — Smooth ego marker (rAF-driven)

Replace `easeTo`-on-prop-change with the same rAF target model as ghost.

- Introduce `egoTargetPosM` (target along-route metres) updated when `positionM` prop changes.
- Drive `egoCurrentPosM` toward target each frame with the same critically-damped lerp.
- Re-derive `[lat, lng]` and bearing from `egoCurrentPosM` via existing `interpolatePosition`/`calcBearing` *every frame*, not every sample.
- Apply `setData` for the `ego` source inside the rAF loop.
- Forward-extrapolate using `speed_kmh / 3.6` m/s when sample is fresh (< 500 ms old). Cap extrapolation distance to one sample-period worth of motion.

**Deliverable:** ego marker visually continuous; camera no longer "tugs".

---

## Phase 4 — Smooth camera (decoupled from marker)

Camera tween is the most perceptually sensitive — small bearing oscillations are nauseating.

- Stop calling `map.easeTo` from prop effects entirely (except on view-mode switch).
- Each frame, call `map.jumpTo({ center, bearing, pitch, zoom })` with values produced by separate springs:
  - **Center:** follow `egoCurrent` with a slightly larger τ (~250 ms) than the marker itself, so the marker leads the camera by a few px → reads as "alive".
  - **Bearing:** spring with τ ≈ 400 ms; wrap shortest-path across the 0/360 boundary (`((target - current + 540) % 360) - 180`).
  - **Pitch / zoom:** spring with τ ≈ 600 ms — these are the most jarring when stepped.
- View-mode change (`chase`/`follow`/`birdseye`) still triggers an explicit `easeTo` with a 400–600 ms duration (currently 0 ms / hard cut — feels abrupt).
- Climb/descent pitch/zoom transitions go through the same springs automatically (no special path needed).

**Deliverable:** camera feels like it has weight, no micro-jitter on straight sections.

**Open question for user:** keep view-mode switch instant (per [[obs-774]] decision) or restore short transition? Recommend short transition (400 ms) — instant was added because animation was buggy, smoothing fixes that.

---

## Phase 5 — Stale-sample handling & robustness

What happens when WS gaps appear (reconnect, packet loss, paused tab returning)?

- Track `lastSampleAge` per actor (ego, ghost). If > 1 s, **freeze extrapolation** — stop predicting forward, hold last known position.
- If > 3 s, fade marker opacity to ~50 % (visual hint that data is stale) until next sample.
- On reconnect (status transitions from `reconnecting` → `connected`), reset `ghostCurrent` and `egoCurrent` to the next received sample without lerping (avoid a long slide across the map after a 30 s gap).
- Respect `prefers-reduced-motion`: in that mode, keep current behavior (instant `setData`, no rAF loop).

**Deliverable:** smoothing degrades gracefully on bad networks; accessibility preserved.

---

## Phase 6 — Tests & validation

- Unit-test the smoothing helpers (lerp, shortest-bearing-path, extrapolation clamp) in isolation — no Mapbox dependency.
- Extend `MiniMap.test.tsx` to assert: rAF loop starts on mount, stops on unmount; `setData` is *not* called more often than the rAF frame rate; reduced-motion path bypasses rAF.
- Manual UAT pass: ride 2 min on a known route, both at constant speed and during sprints/pauses; verify no visible jumps on ego or ghost, no camera micro-jitter, view-mode switch feels deliberate.
- Capture **after** recording matching Phase 1's baseline.

---

## Out of scope (deliberately)

- Raising engine telemetry rate above 4 Hz — smoothing on the client side is cheaper and more robust to network jitter.
- Replacing Mapbox `Map`/sources with a custom WebGL renderer — overkill for current needs.
- Multi-ghost rendering — single ghost only.
- Smoothing the elevation profile cursor — separate component, separate plan if needed.

## File-level touch list

- `ui/src/features/ride/components/MiniMap.tsx` — main changes (rAF loop, target refs, spring helpers).
- `ui/src/features/ride/components/MiniMap.motion.ts` *(new)* — extract pure helpers: `lerp`, `springStep`, `shortestBearingDelta`, `projectOntoRoute`. Keeps `MiniMap.tsx` readable and lets us unit-test motion logic.
- `ui/src/__tests__/MiniMap.test.tsx` — extended assertions (Phase 6).
- `ui/src/__tests__/MiniMap.motion.test.tsx` *(new)* — helper unit tests.

No engine-side changes required.
