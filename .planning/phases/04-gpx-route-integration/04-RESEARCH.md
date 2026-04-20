# Phase 4: GPX Route Integration - Research

**Researched:** 2026-04-20
**Domain:** GPX parsing, haversine positioning, grade smoothing, asyncio task integration, React Leaflet / Recharts UI update
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROUTE-01 | Load GPX; extract elevation profile + coordinates | gpxpy 1.6.2 parse API; RouteData dataclass holds flattened point arrays |
| ROUTE-02 | Track position by integrating speed × time (haversine) | gpxpy.geo.haversine_distance; RouteTracker task advances cum_distance each BLE tick |
| ROUTE-03 | Grade at position → FTMS control loop base grade | Smooth per-segment grade array; RouteTracker writes RideState.real_grade_percent each tick |
</phase_requirements>

---

## Summary

Phase 4 wires a GPX file into the existing 4 Hz control loop. The engine side requires three new artifacts: a `RouteData` dataclass (parsed + pre-computed), a synchronous GPX loader, and a `RouteTracker` asyncio task that integrates speed × time and writes `RideState.real_grade_percent`. Nothing in the locked BLE/WS/FTMS APIs changes.

The UI side promotes ElevationProfile and MiniMap from their Phase 3 empty-states to live components. Both components already exist and accept their parent's layout — they only need route data and a position prop piped from the WebSocket broadcast. The broadcast snapshot gains four new keys: `route_coords`, `route_elevation_m`, `route_distance_m`, `position_m`.

The only new Python dependency is `gpxpy==1.6.2`. The front-end already has `react-leaflet 5` and `recharts 3`; no new npm packages are needed.

**Primary recommendation:** Parse GPX synchronously at startup into a flat `RouteData` (arrays of cumulative distance and grade), advance position with haversine in a dedicated asyncio Task, smooth grade with a 5-point rolling average before writing to `RideState`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gpxpy | 1.6.2 | Parse GPX XML; exposes tracks/segments/points with lat/lon/ele | De-facto Python GPX parser; haversine_distance built in; zero transitive deps |
| Python stdlib `math` | — | haversine fallback, grade clamp | No extra dep needed; gpxpy.geo exposes haversine_distance directly |

### Supporting (front-end — already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-leaflet | 5.0.0 | `Polyline`, `CircleMarker`, `useMap` for route + position | Already in package.json; Polyline + CircleMarker for live position |
| recharts | 3.8.1 | `AreaChart` with `linearGradient defs` for red/blue elevation fill | Already in package.json; ReferenceLine for current position |
| leaflet | 1.9.4 | Underlying map; `useMap().fitBounds()` on route load | Already in package.json |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gpxpy | `xml.etree.ElementTree` hand-roll | gpxpy handles GPX 1.0/1.1 quirks, extension elements; hand-roll is fragile |
| gpxpy.geo.haversine_distance | `haversine` PyPI package | Extra dep; gpxpy already exposes same formula |
| Recharts gradient for elev colours | Separate red/blue Area layers | Two layers with matching data is messier; single gradient + defs simpler |

**Installation (engine):**
```bash
cd engine && uv add gpxpy
```

**Version verification:** `uv pip show gpxpy` → confirmed 1.6.2 available (2023-11-29).

---

## Architecture Patterns

### Recommended Project Structure

```
engine/engine/
├── route/
│   ├── __init__.py
│   ├── loader.py        # load_gpx(path) -> RouteData (sync)
│   ├── model.py         # RouteData dataclass
│   └── tracker.py       # RouteTracker asyncio task
└── control/
    └── state.py         # RideState gains optional route_tracker ref (read-only)
ui/src/
├── types/
│   └── telemetry.ts     # TelemetryState gains route_* + position_m fields
└── components/
    ├── ElevationProfile.tsx   # promoted: live data + position marker
    └── MiniMap.tsx            # promoted: Polyline + CircleMarker
```

### Pattern 1: Flat Pre-computed RouteData

**What:** Parse GPX once at startup into parallel arrays indexed by segment index. Avoids repeated haversine computation on every tick.

**When to use:** Any time a route is loaded; CPU cost is ~1 ms for 10 000-point files.

```python
# Source: gpxpy PyPI docs + gpxpy/geo.py (haversine_distance)
import gpxpy
import gpxpy.geo
from dataclasses import dataclass
from typing import Sequence

@dataclass(frozen=True)
class RouteData:
    lats: Sequence[float]          # degrees
    lons: Sequence[float]          # degrees
    elevations_m: Sequence[float]  # metres; NaN-filled if absent
    cum_dist_m: Sequence[float]    # cumulative 2D distance from start
    grades_pct: Sequence[float]    # smoothed (elevation delta / horiz dist) * 100
    total_dist_m: float

def load_gpx(path: str) -> RouteData:
    with open(path) as fh:
        gpx = gpxpy.parse(fh)
    points = [
        pt
        for track in gpx.tracks
        for seg in track.segments
        for pt in seg.points
    ]
    # Build cumulative distance using gpxpy.geo.haversine_distance
    lats, lons, eles = [], [], []
    cum = [0.0]
    for i, pt in enumerate(points):
        lats.append(pt.latitude)
        lons.append(pt.longitude)
        eles.append(pt.elevation or 0.0)
        if i > 0:
            d = gpxpy.geo.haversine_distance(
                lats[i - 1], lons[i - 1], lats[i], lons[i]
            )
            cum.append(cum[-1] + d)
    # Raw grade per segment then smooth
    raw_grades = _compute_grades(eles, cum)
    smooth_grades = _rolling_mean(raw_grades, window=5)
    return RouteData(
        lats=lats, lons=lons, elevations_m=eles,
        cum_dist_m=cum, grades_pct=smooth_grades,
        total_dist_m=cum[-1],
    )
```

### Pattern 2: RouteTracker asyncio Task

**What:** Sibling `asyncio.Task` (alongside reconnect_loop, ws_broadcast) that fires at 4 Hz, reads `state.last_speed_kmh`, advances `_position_m` by `speed * dt`, and writes `state.real_grade_percent`.

**When to use:** Any time a route is active; replaces `DEFAULT_GRADE` constant.

```python
# engine/engine/route/tracker.py
import asyncio
import time

async def route_tracker_loop(
    route: "RouteData",
    state: "RideState",
    stop_event: asyncio.Event,
    *,
    tick_s: float = 0.25,
) -> None:
    position_m = 0.0
    last_t = time.monotonic()
    while not stop_event.is_set():
        now = time.monotonic()
        dt = now - last_t
        last_t = now
        speed_ms = (state.last_speed_kmh or 0.0) / 3.6
        position_m = min(position_m + speed_ms * dt, route.total_dist_m)
        # Binary search for segment index
        idx = _find_segment(route.cum_dist_m, position_m)
        state.real_grade_percent = route.grades_pct[idx]
        await asyncio.sleep(tick_s)
```

**Key:** `_find_segment` uses `bisect.bisect_right` (O(log n)) — not a linear scan.

### Pattern 3: Grade Smoothing

**What:** 5-point rolling mean over raw per-segment grades eliminates GPS elevation noise.

**Why 5:** Each GPS point ~2–10 m apart at cycling speed; 5-point window = 10–50 m averaging, which matches real road grade perception. No external dep needed.

```python
def _rolling_mean(values: list[float], window: int = 5) -> list[float]:
    result = []
    for i in range(len(values)):
        lo = max(0, i - window // 2)
        hi = min(len(values), lo + window)
        result.append(sum(values[lo:hi]) / (hi - lo))
    return result
```

### Pattern 4: WS Broadcast Extension

**What:** Add route snapshot keys to the existing broadcast dict in `_on_reading`. Route data is large — send full `route_coords` and `route_elevation_m` only once on load, then `position_m` each tick.

**Practical approach for MVP:** include a `route_loaded` bool + `position_m` in every tick broadcast; send full coords in a separate `route_data` message type when GPX loads. Avoids sending 10 000-point arrays at 4 Hz.

```python
# One-time route_data message via broadcast_queue after GPX load
broadcast_queue.put_nowait({
    "type": "route_data",
    "lats": list(route.lats),
    "lons": list(route.lons),
    "elevations_m": list(route.elevations_m),
    "cum_dist_m": list(route.cum_dist_m),
    "total_dist_m": route.total_dist_m,
})

# Per-tick addition to existing snapshot dict in _on_reading
snapshot["position_m"] = tracker.position_m  # exposed as property
snapshot["real_grade_pct"] = state.real_grade_percent  # already present
```

### Pattern 5: React Leaflet Polyline + Position Marker

**What:** MiniMap receives `routeCoords` prop (`[lat, lon][]`) and `positionM` scalar. On first non-null `routeCoords`, calls `map.fitBounds(L.latLngBounds(routeCoords))` via a child component using `useMap()`.

```tsx
// Source: react-leaflet 5 docs — react-leaflet.js.org/docs/api-components/
import { Polyline, CircleMarker, useMap } from "react-leaflet";

function RouteLayer({ coords, positionM, cumDist }: RouteLayerProps) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords as [number, number][]);
    }
  }, [coords.length]); // run once on load
  const idx = bisectRight(cumDist, positionM);
  const pos = coords[Math.min(idx, coords.length - 1)];
  return (
    <>
      <Polyline positions={coords} pathOptions={{ color: "#4B5563", weight: 2 }} />
      {pos && <CircleMarker center={pos} radius={6} pathOptions={{ color: "#F59E0B", fillOpacity: 1 }} />}
    </>
  );
}
```

### Anti-Patterns to Avoid

- **Sending full route arrays every tick:** 10 000 × 3 floats at 4 Hz floods the WS and causes browser rerender thrash. Send once on load.
- **Linear scan for position index:** `bisect.bisect_right` is O(log n). Do not iterate `cum_dist_m` on every tracker tick.
- **Computing haversine inside the tracker loop:** Pre-compute all distances in `load_gpx`; tracker only does arithmetic.
- **Mutating `RideState` from two tasks:** Only `RouteTracker` writes `real_grade_percent` once a route is active (replaces `DEFAULT_GRADE`). No concurrent writer.
- **GPX files without elevation data:** Some export tools omit `<ele>` tags. Fallback to `0.0` silently; grade stays 0. Log a warning.
- **Re-fitBounds on every render:** `useEffect` must depend on `coords.length` (not the array reference) to fire only once.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GPX XML parsing | ElementTree + custom element traversal | `gpxpy.parse(fh)` | GPX 1.0/1.1 differences, extension elements, missing optional tags |
| Haversine distance | Own trig implementation | `gpxpy.geo.haversine_distance(lat1, lon1, lat2, lon2)` | Already in gpxpy; tested; returns metres |
| Cumulative distance sum | Loop + sum | Pre-computed in `load_gpx`; `bisect.bisect_right` for lookup | O(1) tick-time instead of O(n) |
| Map tile serving | Local tile server | CartoDB dark_all (already wired in MiniMap) | Zero config, no token |

**Key insight:** gpxpy provides everything needed for the Python side (parse + haversine); React Leaflet + Recharts cover the UI side. The only custom logic is the grade smoothing and tracker loop, which are trivial.

---

## Common Pitfalls

### Pitfall 1: GPX files with missing or inconsistent elevation

**What goes wrong:** `point.elevation` is `None` for many GPX files exported from route planners. Raw grade computation raises `TypeError` or silently produces NaN.

**Why it happens:** Elevation is optional in GPX spec. Many route planners export waypoints without elevation.

**How to avoid:** Always `point.elevation or 0.0` in loader. Log a warning if >10% of points have `None` elevation. Grade will be 0 for those segments.

**Warning signs:** Trainer stays at flat grade despite obvious hills in profile display.

### Pitfall 2: GPS elevation noise → grade spikes

**What goes wrong:** Raw per-segment grade oscillates ±20% on consecutive points even on flat ground because consumer GPS elevation accuracy is ±5 m.

**Why it happens:** Grade = Δelev / Δdist. A 5 m elevation error over a 10 m horizontal segment = 50% grade.

**How to avoid:** Apply 5-point rolling mean in `load_gpx`. The smooth grades array is pre-computed once; no per-tick filtering needed. KICKR Core max supported simulated grade is ±20%.

**Warning signs:** Trainer resistance oscillates wildly every few seconds.

### Pitfall 3: Sending full route coordinates on every tick broadcast

**What goes wrong:** Broadcasting `[lat, lon]` for 10 000 points × 4 Hz fills the WS queue, the `broadcast_queue` maxsize=10 drop-oldest guard fires constantly, and React re-renders every 250 ms from a large new object.

**Why it happens:** Naively adding route fields to the existing tick snapshot dict.

**How to avoid:** Separate message types: `{"type": "route_data", ...}` sent once on load; `{"type": "telemetry", ..., "position_m": ..., "route_loaded": true}` each tick. `useTelemetry` stores route data in a separate `useRef` / `useState` that doesn't trigger downstream renders unless it changes.

**Warning signs:** Browser console shows 4 Hz `onmessage` with 200 KB payloads.

### Pitfall 4: Position tracking restarts after BLE reconnect

**What goes wrong:** If `reconnect_loop` triggers, `state.last_speed_kmh` briefly becomes `None`. The tracker must treat `None` as 0.0, not crash.

**How to avoid:** `speed_ms = (state.last_speed_kmh or 0.0) / 3.6` — already the pattern in `_on_reading`. Position freezes during BLE gap, resumes when reconnected.

### Pitfall 5: Route ends mid-ride

**What goes wrong:** Rider reaches `total_dist_m`; `position_m = min(position_m + ..., total_dist_m)` clamps correctly, but grade index lookup returns last segment — trainer stays at final grade indefinitely.

**How to avoid:** When `position_m >= total_dist_m - epsilon`, set `state.real_grade_percent = 0.0` (cool-down). Log "route complete".

### Pitfall 6: react-leaflet v5 MapContainer invalidateSize

**What goes wrong:** If the MiniMap parent div has a CSS transition on mount, the Leaflet map renders into a zero-size container and shows grey tiles.

**Why it happens:** Leaflet calculates container size once on mount. Phase 3 MiniMap already uses `w-[160px] h-[160px]` fixed size — this is fine as long as the container has a fixed dimension before mount.

**How to avoid:** Existing fixed-dimension container already avoids this. Do not wrap MapContainer in a CSS-animated container.

---

## Code Examples

### Load and validate a GPX file

```python
# engine/engine/route/loader.py
import gpxpy
import gpxpy.geo
import bisect
import logging
import math

_log = logging.getLogger("rideos.route")

def load_gpx(path: str) -> "RouteData":
    """Parse GPX → RouteData with pre-computed cumulative distances + smoothed grades."""
    with open(path) as fh:
        gpx = gpxpy.parse(fh)
    points = [
        pt
        for track in gpx.tracks
        for seg in track.segments
        for pt in seg.points
    ]
    if not points:
        raise ValueError(f"GPX file {path!r} contains no track points")
    lats = [pt.latitude for pt in points]
    lons = [pt.longitude for pt in points]
    eles_raw = [pt.elevation for pt in points]
    missing = sum(1 for e in eles_raw if e is None)
    if missing:
        _log.warning("GPX: %d/%d points have no elevation; treating as 0.0 m", missing, len(points))
    eles = [e if e is not None else 0.0 for e in eles_raw]
    # Cumulative distance (2D haversine)
    cum = [0.0]
    for i in range(1, len(points)):
        d = gpxpy.geo.haversine_distance(lats[i-1], lons[i-1], lats[i], lons[i])
        cum.append(cum[-1] + d)
    # Raw per-segment grade
    raw_grades = []
    for i in range(len(points)):
        if i == 0 or (cum[i] - cum[i-1]) < 0.1:
            raw_grades.append(0.0)
        else:
            raw_grades.append((eles[i] - eles[i-1]) / (cum[i] - cum[i-1]) * 100.0)
    smooth_grades = _rolling_mean(raw_grades, window=5)
    # Clamp to KICKR Core range
    smooth_grades = [max(-20.0, min(20.0, g)) for g in smooth_grades]
    return RouteData(
        lats=tuple(lats), lons=tuple(lons), elevations_m=tuple(eles),
        cum_dist_m=tuple(cum), grades_pct=tuple(smooth_grades),
        total_dist_m=cum[-1],
    )

def _rolling_mean(values: list, window: int = 5) -> list:
    out = []
    half = window // 2
    n = len(values)
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i - half + window)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out
```

### RouteTracker asyncio task

```python
# engine/engine/route/tracker.py
import asyncio
import bisect
import time
import logging
from engine.route.model import RouteData
from engine.control.state import RideState

_log = logging.getLogger("rideos.route")

ROUTE_COMPLETE_GRADE = 0.0

class RouteTracker:
    def __init__(self, route: RouteData) -> None:
        self._route = route
        self._position_m: float = 0.0

    @property
    def position_m(self) -> float:
        return self._position_m

    async def run(self, state: RideState, stop_event: asyncio.Event, *, tick_s: float = 0.25) -> None:
        last_t = time.monotonic()
        while not stop_event.is_set():
            now = time.monotonic()
            dt = now - last_t
            last_t = now
            speed_ms = (state.last_speed_kmh or 0.0) / 3.6
            self._position_m = min(self._position_m + speed_ms * dt, self._route.total_dist_m)
            if self._position_m >= self._route.total_dist_m - 0.5:
                state.real_grade_percent = ROUTE_COMPLETE_GRADE
                _log.info("Route complete at %.0f m", self._route.total_dist_m)
                break
            idx = bisect.bisect_right(self._route.cum_dist_m, self._position_m) - 1
            idx = max(0, min(idx, len(self._route.grades_pct) - 1))
            state.real_grade_percent = self._route.grades_pct[idx]
            await asyncio.sleep(tick_s)
```

### main.py wiring (additive)

```python
# engine/engine/main.py — additions only (no locked API changes)
import os
from engine.route.loader import load_gpx
from engine.route.tracker import RouteTracker

# After gear_engine / state setup:
GPX_PATH = os.environ.get("RIDEOS_GPX")  # None = no route, trainer stays at DEFAULT_GRADE
tracker = None
if GPX_PATH:
    route = load_gpx(GPX_PATH)
    tracker = RouteTracker(route)
    # Broadcast route_data once before telemetry ticks start
    broadcast_queue.put_nowait({"type": "route_data", ...})

# In task creation block:
if tracker:
    tracker_task = asyncio.create_task(
        tracker.run(state, stop_event), name="route_tracker"
    )
```

### ElevationProfile with live position (React)

```tsx
// Source: recharts AreaChart with defs linearGradient + ReferenceLine
import { AreaChart, Area, ReferenceLine, ResponsiveContainer, defs, linearGradient, stop } from "recharts";

// data = [{dist: number, elev: number}] pre-mapped from route_data message
// positionM = current position from telemetry tick

export const ElevationProfile = memo(function ElevationProfile({ data, positionM }) {
  if (!data || data.length === 0) {
    return <EmptyState />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <Area type="linear" dataKey="elev" stroke="#6B7280" fill="url(#elevGrad)"
              dot={false} isAnimationActive={false} />
        <ReferenceLine x={positionM} stroke="#F59E0B" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom XML parse for GPX | gpxpy 1.6.2 | — | Single dep, handles GPX 1.0 + 1.1 |
| Leaflet imperative JS | react-leaflet 5 declarative | v5 (2024) | `useMap()` hook replaces `withLeaflet` HOC |
| recharts `withLeaflet` | `useMap()` hook | react-leaflet v4+ | Removed `withLeaflet`; `useMap()` is the pattern |

**Deprecated/outdated:**
- `withLeaflet` HOC: removed in react-leaflet 4+. Use `useMap()` inside a child component of `MapContainer`.
- Sending route arrays per tick: never correct; one-shot `route_data` message is the pattern.

---

## Open Questions

1. **GPX file selection mechanism**
   - What we know: Phase 4 success criteria say "GPX loads" but no UI for file picking is specified; ROUTE-01–03 only address the data path
   - What's unclear: Does the user want a file-picker in the React UI, a CLI argument, or an environment variable?
   - Recommendation: Use `RIDEOS_GPX` environment variable for MVP (zero UI complexity, consistent with engine-first approach). CLI `--gpx` flag as alternative. Defer file-picker to v2.

2. **Route data message vs. telemetry message split**
   - What we know: `broadcast_queue` is `maxsize=10` with drop-oldest; large route arrays cannot safely go in the queue at 4 Hz
   - What's unclear: Whether the WS handler should support a second message route or just use a startup burst
   - Recommendation: Add `type` field discrimination (`route_data` vs. `telemetry`) already used by `gear_shift` for inbound. Extend the same pattern outbound.

3. **Elevation accuracy — no DEM correction**
   - What we know: Consumer GPS elevation is ±5–10 m; route planning tools (Strava, Komoot) provide better elevation via DEM
   - What's unclear: Will the user's GPX files come from a GPS device (noisy) or a route planner (clean)?
   - Recommendation: 5-point rolling mean is sufficient for route planner exports. If device-recorded GPX is used, add a note in PLAN that a wider window (11 points) can be configured.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 + pytest-asyncio 1.3.0 |
| Config file | `engine/pyproject.toml` — `asyncio_mode = "auto"` |
| Quick run command | `cd engine && uv run pytest tests/route/ -x -q` |
| Full suite command | `cd engine && uv run pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUTE-01 | `load_gpx` parses track points, elevation, cumulative distance | unit | `uv run pytest tests/route/test_loader.py -x` | ❌ Wave 0 |
| ROUTE-01 | `load_gpx` handles missing elevation gracefully (None → 0.0) | unit | `uv run pytest tests/route/test_loader.py::test_missing_elevation -x` | ❌ Wave 0 |
| ROUTE-01 | Grade smoothing clamps output to ±20% | unit | `uv run pytest tests/route/test_loader.py::test_grade_clamp -x` | ❌ Wave 0 |
| ROUTE-02 | `RouteTracker` advances position correctly given fixed speed + dt | unit | `uv run pytest tests/route/test_tracker.py -x` | ❌ Wave 0 |
| ROUTE-02 | Position clamps at `total_dist_m` | unit | `uv run pytest tests/route/test_tracker.py::test_position_clamp -x` | ❌ Wave 0 |
| ROUTE-02 | `None` speed treated as 0.0 (no crash) | unit | `uv run pytest tests/route/test_tracker.py::test_none_speed -x` | ❌ Wave 0 |
| ROUTE-03 | Grade at position matches expected segment after bisect lookup | unit | `uv run pytest tests/route/test_tracker.py::test_grade_lookup -x` | ❌ Wave 0 |
| ROUTE-03 | `state.real_grade_percent` updated on each tick | unit | `uv run pytest tests/route/test_tracker.py::test_state_mutation -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd engine && uv run pytest tests/route/ -x -q`
- **Per wave merge:** `cd engine && uv run pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `engine/tests/route/__init__.py` — package marker
- [ ] `engine/tests/route/test_loader.py` — covers ROUTE-01
- [ ] `engine/tests/route/test_tracker.py` — covers ROUTE-02, ROUTE-03
- [ ] `engine/engine/route/__init__.py` — module package marker
- [ ] Framework install: `cd engine && uv add gpxpy` — gpxpy not yet in pyproject.toml

---

## Sources

### Primary (HIGH confidence)

- gpxpy PyPI page (https://pypi.org/project/gpxpy/) — version 1.6.2 confirmed; parse API
- gpxpy/geo.py GitHub (https://github.com/tkrajina/gpxpy/blob/master/gpxpy/geo.py) — `haversine_distance`, `distance_2d`, `distance_3d` signatures confirmed
- react-leaflet docs (https://react-leaflet.js.org/docs/api-components/) — `Polyline`, `CircleMarker`, `useMap` API confirmed
- Existing codebase: `engine/engine/control/state.py`, `controller.py`, `ws/server.py`, `main.py` — integration points confirmed by direct read

### Secondary (MEDIUM confidence)

- gpxparser npm (https://www.npmjs.com/package/gpxparser) v3.0.8 — considered then excluded; Python-side parsing preferred to keep data logic in engine
- brenzy/gpx-smoother (https://github.com/brenzy/gpx-smoother) — confirms rolling-mean smoothing is standard practice for trainer rides
- betterdatascience.com cycling gradient article — confirms `(Δelev / Δdist) * 100` formula

### Tertiary (LOW confidence)

- General WebSearch results on grade smoothing window sizes — cross-validated with known GPS accuracy specs; 5-point window selected based on reasoning, not a cited standard

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — gpxpy version confirmed via `uv pip show`; react-leaflet/recharts already in package.json
- Architecture: HIGH — direct codebase read; integration points (RideState, broadcast_queue, asyncio task pattern) all confirmed
- Pitfalls: MEDIUM-HIGH — pitfalls 1–4 from direct code analysis; pitfall 5–6 from known Leaflet/React-Leaflet behaviour

**Research date:** 2026-04-20
**Valid until:** 2026-07-20 (gpxpy is stable; react-leaflet v5 is current)
