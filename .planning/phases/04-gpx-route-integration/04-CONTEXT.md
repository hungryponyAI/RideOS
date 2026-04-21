# Phase 4: GPX Route Integration - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Load a GPX file, track rider position by integrating speed × time (haversine), and drive the FTMS control loop grade from the route's elevation profile. UI side: promote ElevationProfile and MiniMap from Phase 3 empty-states to live components fed by route data.

Does NOT include: session recording, live route editing, multi-route management, or LLM route analysis (v2).

</domain>

<decisions>
## Implementation Decisions

### GPX File Selection
- File picker in the **React UI pre-ride screen** (shown before BLE connection starts)
- Pre-ride screen is **optional** — user can either load a GPX or skip to a free ride at 0% grade
- Options on pre-ride screen: "Load GPX" (native browser file input) + "Start without route"
- Transport mechanism (Claude's call): send the resolved file **path string** over the existing WebSocket connection (`{"type": "load_route", "path": "/abs/path/to/file.gpx"}`); engine opens the file directly. This works because engine and browser run on the same macOS machine — no file bytes need to cross the wire.
- On valid load: engine sends one-shot `{"type": "route_data", ...}` message back to UI before telemetry ticks begin.

### Route Lifecycle
- **Route ends:** grade resets to **0% (flat)** — trainer goes flat, rider can keep pedaling freely
- **No GPX loaded (free ride):** grade is **0%** — replace `DEFAULT_GRADE = 2.0` constant with `0.0`; no route = flat road
- **Startup:** pre-ride screen always shown first; user decides whether to load a route or start flat

### Grade Smoothing
- GPX source: route planning tools (Strava, Komoot, RideWithGPS) — clean DEM-based elevation
- Smoothing: **5-point rolling mean** on raw per-segment grades before storing in `RouteData`
- Max grade clamp: **±20%** (KICKR Core hardware limit; safe per FTMS spec)
- No configurable window needed — route planner exports are clean enough for fixed 5-point window

### WebSocket Route Data Strategy (Claude's Discretion)
- Route coordinate arrays are too large for the bounded `broadcast_queue(maxsize=10)` at 4 Hz
- Engine sends one-shot `{"type": "route_data", "coords": [...], "elevation_m": [...], "distance_m": [...]}` on route load, before telemetry ticks start
- Per-tick telemetry gains `position_m` field for live position updates
- Message type discrimination: `"route_data"` vs. `"telemetry"` (extends existing `"gear_shift"` inbound pattern)

### Claude's Discretion
- Pre-ride screen visual design (layout, button placement) — follows cockpit dark theme; check UI-SPEC
- Error handling for malformed GPX files (show error state on pre-ride screen, don't crash)
- How to handle GPX files with no elevation data (fall back to 0% grade throughout)
- Exact haversine implementation (use gpxpy.geo.haversine_distance per research)
- Position bisect lookup implementation (use `bisect.bisect_right` per research pattern)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` §ROUTE-01, ROUTE-02, ROUTE-03 — acceptance criteria for GPX loading, position tracking, grade output

### Technical research
- `.planning/phases/04-gpx-route-integration/04-RESEARCH.md` — gpxpy API, RouteData dataclass pattern, RouteTracker asyncio task, main.py wiring, ElevationProfile + MiniMap promotion patterns, all pitfalls

### UI design contract
- `.planning/phases/04-gpx-route-integration/04-UI-SPEC.md` — pre-ride screen layout, ElevationProfile + MiniMap live state specs, visual design decisions

### Existing integration points (read before touching)
- `engine/engine/control/state.py` — `RideState` dataclass; Phase 4 writes `real_grade_percent` and reads `last_speed_kmh`
- `engine/engine/main.py` — task wiring pattern; `DEFAULT_GRADE` constant to replace; `_on_reading` closure to extend with `position_m`
- `engine/engine/ws/server.py` — `broadcast_loop` + inbound message dispatch; extend for `load_route` inbound and `route_data` outbound

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/engine/ws/server.py`: `_handler` already dispatches inbound WS messages by `msg.get("type")` — extend the `if/elif` block for `"load_route"`
- `engine/engine/main.py`: `_on_reading` closure already builds and posts a `snapshot` dict — extend with `position_m` from `RouteTracker`
- `ui/src/components/ElevationProfile.tsx`: exists as empty-state scaffold; needs `data` + `positionM` props added
- `ui/src/components/MiniMap.tsx`: exists as empty-state scaffold; needs `coords` + `positionM` props added
- React-leaflet 5, recharts 3.8.1, leaflet 1.9.4 — all already installed; no new npm deps needed

### Established Patterns
- Asyncio sibling tasks: `reconnect_loop`, `telemetry_consumer`, `gear_logger`, `ws_broadcast` — `RouteTracker.run()` follows same pattern, created with `asyncio.create_task()`
- BLE callback safety: `_on_reading` is a plain `def`; position update from RouteTracker runs in its own task (not in the callback)
- `React.memo` on all leaf cockpit components — required for 60 Hz stability; apply to ElevationProfile + MiniMap
- `isAnimationActive={false}` on Recharts components — already established in Phase 3

### Integration Points
- `engine/engine/control/state.py`: `RideState` gains no new fields — RouteTracker references it by reference, reads `last_speed_kmh`, writes `real_grade_percent`
- `engine/engine/main.py`: add `RouteTracker` task; replace `DEFAULT_GRADE = 2.0` → `0.0`; extend `_on_reading` snapshot with `position_m`
- `ui/src/`: `TelemetryState` type gains `route_coords`, `route_elevation_m`, `route_distance_m`, `position_m` fields; pre-ride screen is new component before cockpit mounts

</code_context>

<specifics>
## Specific Ideas

- Pre-ride screen: "Load GPX" (native `<input type="file" accept=".gpx">`) + "Start without route" button
- Route data transmitted as path string, not file bytes — engine reads file from disk (same machine)
- On route end: grade → 0%, no loop, no special message needed (RouteTracker task exits)

</specifics>

<deferred>
## Deferred Ideas

- File picker from browser file manager with preview (route map thumbnail) — future UX enhancement
- Mid-ride route switching — would require RouteTracker task cancellation and restart
- GPX device recordings with noisy elevation — configurable smooth window (11 points) — v2 if needed
- RIDEOS_GPX env var as alternative to UI picker — could add as override/fallback later

</deferred>

---

*Phase: 04-gpx-route-integration*
*Context gathered: 2026-04-21*
