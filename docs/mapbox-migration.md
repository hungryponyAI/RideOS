# Mapbox migration plan

Move the cockpit mini-map off MapLibre + OpenStreetMap raster tiles and onto
Mapbox GL JS with a Mapbox-hosted style. Reasons: better default cartography
(road labels, contours, bike paths in `outdoor-v12`), reliable CDN, no rate
limits at our usage volume, no external `tile.openstreetmap.org` dependency.

The switch is local to `ui/src/components/MiniMap.tsx` plus a small
dependency / env-var change. The renderer-side API is nearly identical
(Mapbox GL → MapLibre fork), so all our existing code (`addSource`,
`addLayer`, `easeTo`, `LngLatBounds`, `GeoJSONSource`, `moveLayer`, the
camera + ghost effects, the M-key toggle) carries over unchanged.

---

## Goal

After this work:

- `ui/package.json` no longer depends on `maplibre-gl`.
- No request goes to `tile.openstreetmap.org` or `demotiles.maplibre.org`.
- The mini-map renders Mapbox vector tiles styled `outdoor-v12` (or whichever
  style we pick), with the existing route line, ego marker, ghost marker,
  time-gap badge, and chase / birdseye view modes intact.
- A `VITE_MAPBOX_TOKEN` is read from `ui/.env.local`, never committed.

## Non-goals

- No change to the engine, WebSocket protocol, ghost backend, or route
  loading.
- No change to the cockpit layout or any non-map component.
- No support for offline tiles in this iteration.

---

## Task list

### 1. Account + token  *(out-of-band, ~5 min)*

- [ ] Create a Mapbox account at <https://account.mapbox.com>.
- [ ] In the Tokens page, generate a new public token scoped to **read**
      only (default scopes are fine for client-side use).
- [ ] Optionally restrict the token to `localhost` URL pattern for dev,
      add the prod origin later.

### 2. Dependencies

- [ ] In `ui/`, run `npm uninstall maplibre-gl @types/leaflet leaflet
      react-leaflet` *(only if leaflet is unused elsewhere — quick grep
      first)*.
- [ ] In `ui/`, run `npm install mapbox-gl`. The package ships its own
      types, no `@types/mapbox-gl` needed.

### 3. Environment variables

- [ ] Create `ui/.env.local` with one line:
      `VITE_MAPBOX_TOKEN=pk.eyJ1Ij...`
- [ ] Verify `.env.local` is already covered by the repo's `.gitignore`.
      If not, add it.
- [ ] Add `ui/.env.example` with `VITE_MAPBOX_TOKEN=` (no value) so future
      collaborators know the var exists.

### 4. `MiniMap.tsx` rewrite

All edits are in `ui/src/components/MiniMap.tsx`. Mechanical, no logic
changes.

- [ ] Change imports:

      ```diff
      - import * as maplibregl from "maplibre-gl";
      - import "maplibre-gl/dist/maplibre-gl.css";
      + import mapboxgl from "mapbox-gl";
      + import "mapbox-gl/dist/mapbox-gl.css";
      ```

- [ ] Set the access token at module scope:

      ```ts
      mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
      ```

      Add a fail-fast guard in dev:

      ```ts
      if (!mapboxgl.accessToken) {
        throw new Error("VITE_MAPBOX_TOKEN is not set");
      }
      ```

- [ ] Replace the inline `STYLE` object with a Mapbox style URL:

      ```ts
      const STYLE = "mapbox://styles/mapbox/outdoor-v12";
      // Alternatives: streets-v12, dark-v11, satellite-streets-v12
      ```

      Drop `const STYLE: maplibregl.StyleSpecification = …`.

- [ ] Replace every `maplibregl.X` with `mapboxgl.X`:

      | MapLibre | Mapbox |
      |---|---|
      | `maplibregl.Map` | `mapboxgl.Map` |
      | `maplibregl.GeoJSONSource` | `mapboxgl.GeoJSONSource` |
      | `maplibregl.LngLatBounds` | `mapboxgl.LngLatBounds` |

- [ ] Update the CSS-collision comment from `.maplibregl-map` to
      `.mapboxgl-map`. Mapbox applies the same `position: relative` rule,
      so the `w-full h-full` workaround stays.

- [ ] Type-check: `cd ui && npx tsc -b --noEmit` — must be clean.

### 5. Smoke test

- [ ] `npm run dev`, hard-reload the browser.
- [ ] DevTools → Network: the only map-related requests should be against
      `api.mapbox.com` and `events.mapbox.com`. Zero requests to
      `tile.openstreetmap.org` or `demotiles.maplibre.org`.
- [ ] Click Start with a saved route + a Strava ghost. Verify in order:
  - [ ] Tiles render (vector, smooth pitch).
  - [ ] Yellow route polyline.
  - [ ] Red ego dot moves with telemetry.
  - [ ] Gray ghost dot moves; time-gap badge updates.
  - [ ] Press `M` — camera switches between chase and birdseye.
- [ ] Pick a different route + ghost mode and Start again — second-run
      ghost still works (regression check on the `_apply_ghost` race fix).

### 6. Cleanup

- [ ] If leaflet was uninstalled in step 2, remove any stale leaflet types
      or imports the IDE flags.
- [ ] Delete `node_modules/.vite` once after the swap to drop the cached
      maplibre prebundle: `rm -rf ui/node_modules/.vite`.
- [ ] Commit:
      `feat(map): migrate cockpit mini-map from MapLibre+OSM to Mapbox`

---

## Style choice

`outdoor-v12` is the strongest default for a cycling app — emphasises
contours, paths, terrain, hill shading. Other reasonable picks:

- `streets-v12` — busier, road-centric.
- `dark-v11` — matches the cockpit dark theme; less terrain detail.
- `satellite-streets-v12` — most realistic; heavier on bandwidth.

The style URL is a single string and easy to swap later, so don't
over-think it. Pick `outdoor-v12` first, A/B against `dark-v11` once it's
running.

## Risks & rollback

- **Token leak** — public Mapbox tokens are *meant* to ship to the client,
  but treat them like any secret. URL-restrict the token after going
  past local dev.
- **Free-tier limit** — 50 000 monthly map loads. A solo indoor cyclist
  won't approach this; sanity-check the Mapbox dashboard after a week.
- **API drift** — Mapbox GL JS v3 has a few breaking changes vs v2 (most
  notably around `Map` lifecycle and globe projection defaults). Pin to
  `mapbox-gl@^3` and read the changelog if anything misbehaves.
- **Rollback** — `git revert` the commit; `npm install` restores
  `maplibre-gl`. Total rollback time < 5 min. Inline OSM style is still
  available in git history if needed for offline / no-token scenarios.

## Out of scope (follow-ups)

- Self-host vector tiles via PMTiles for true offline use.
- Switch to MapTiler if Mapbox pricing becomes a concern (drop-in style URL
  swap; same SDK).
- Add a 3D terrain layer (`map.setTerrain(...)`) for the chase view —
  Mapbox supports this natively.
