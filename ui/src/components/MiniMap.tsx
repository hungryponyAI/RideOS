import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
if (!mapboxgl.accessToken) {
  throw new Error("VITE_MAPBOX_TOKEN is not set");
}

export type MapViewMode = "chase" | "follow" | "birdseye";

interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;
  ghostLat?: number | null;
  ghostLng?: number | null;
  ghostBearingDeg?: number | null;
  isDark: boolean;
  viewMode: MapViewMode;
}

// Mapbox Standard renders real 3D building volumes + named landmarks (not flat
// extrusions). lightPreset controls brightness: dawn | day | dusk | night.
const STYLE = "mapbox://styles/mapbox/standard";
const LIGHT_PRESET: "dawn" | "day" | "dusk" | "night" = "day";

// Mapbox-hosted global DEM. Standard already enables terrain internally, but
// we re-assert exaggeration to make hills feel tangible during chase view.
const DEM_SOURCE_ID = "mapbox-dem";
const DEM_URL = "mapbox://mapbox.mapbox-terrain-dem-v1";
const TERRAIN_EXAGGERATION = 1.5;

const BEARING_LOOKAHEAD_M = 200;

// chase = elevated trailing camera (default)
const CHASE_PITCH = 60;
const CHASE_ZOOM = 17;
const CHASE_OFFSET: [number, number] = [0, 150];

// follow = Zwift-style behind-the-rider POV: heavy pitch, close zoom, ego sits
// near the bottom of the viewport so the road ahead dominates.
const FOLLOW_PITCH = 78;
const FOLLOW_ZOOM = 18.5;
const FOLLOW_OFFSET: [number, number] = [0, 220];

const BIRDSEYE_PITCH = 0;
const BIRDSEYE_ZOOM = 14;
const BIRDSEYE_OFFSET: [number, number] = [0, 0];

// Position updates arrive faster than the camera animation duration. Keep the
// duration shorter than the telemetry tick (~120ms typical from the engine) so
// each easeTo finishes before the next interrupts it. Linear easing prevents
// visible deceleration handoff between consecutive frames.
const POS_TWEEN_MS = 80;
const VIEW_TWEEN_MS = 600;
const LINEAR = (t: number) => t;

function bisectRight(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function interpolatePosition(
  coords: Array<[number, number]>,
  cumDist: number[],
  targetM: number
): [number, number] | null {
  if (!coords.length) return null;

  const idx = Math.min(
    Math.max(bisectRight(cumDist, targetM) - 1, 0),
    coords.length - 2
  );

  const d0 = cumDist[idx];
  const d1 = cumDist[idx + 1];
  const t = d1 === d0 ? 0 : (targetM - d0) / (d1 - d0);

  const [lat0, lng0] = coords[idx];
  const [lat1, lng1] = coords[idx + 1];

  return [lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t];
}

function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

export function MiniMap({
  coords,
  cumDist,
  positionM,
  ghostLat,
  ghostLng,
  viewMode,
}: MiniMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastViewModeRef = useRef<MapViewMode>(viewMode);
  // Last computed ego position + bearing. Lets the camera tween still run
  // when positionM goes null (e.g. paused / no telemetry) so M-key works.
  const lastEgoRef = useRef<{ ego: [number, number]; bearing: number } | null>(null);

  // init — must null mapRef in cleanup so React 19 double-mount re-creates the map
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new mapboxgl.Map({
      container,
      style: STYLE,
      center: [10, 50],
      zoom: 13,
      pitch: viewMode === "chase" ? CHASE_PITCH : BIRDSEYE_PITCH,
      attributionControl: false,
    });

    // 'load' fires after the style is fully parsed and ready for source/layer
    // mutations — the right moment to attach terrain + sky. styledata as a
    // backup for environments where 'load' stalls.
    const markLoaded = () => {
      // Brightness/atmosphere of the Standard basemap.
      try {
        map.setConfigProperty("basemap", "lightPreset", LIGHT_PRESET);
        map.setConfigProperty("basemap", "theme", "monochrome");
        map.setConfigProperty("basemap", "show3dObjects", true);
      } catch {
        // Older mapbox-gl or non-Standard styles silently ignore.
      }
      // Re-assert exaggerated terrain — Standard's default is subtle.
      if (!map.getSource(DEM_SOURCE_ID)) {
        map.addSource(DEM_SOURCE_ID, {
          type: "raster-dem",
          url: DEM_URL,
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
      map.resize();
      setLoaded(true);
    };
    map.once("load", markLoaded);
    map.once("styledata", markLoaded);

    // Keep the canvas in sync with container size for the lifetime of the map.
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(container);

    mapRef.current = map;

    return () => {
      ro.disconnect();
      setLoaded(false);
      map.remove();
      mapRef.current = null;
    };
    // viewMode intentionally omitted — handled by camera effect, no need to recreate map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // draw route line once loaded / when coords change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !coords) return;

    const geojson = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: coords.map(([lat, lng]) => [lng, lat]),
      },
      properties: {},
    };

    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geojson);
    } else {
      map.addSource("route", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#FFF200",
          "line-width": 4,
        },
      });
    }
    // dark-v11 ships a `building-extrusion` layer that would bury the route
    // line when the camera is pitched. Keep route above all built-in layers;
    // ego/ghost will moveLayer over it on every telemetry frame.
    if (map.getLayer("route")) map.moveLayer("route");

    // Fit to route bounds on first load (only if no live position yet)
    if (positionM == null) {
      const lons = coords.map(([, lng]) => lng);
      const lats = coords.map(([lat]) => lat);
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)]
      );
      map.fitBounds(bounds, { padding: 40, duration: 0 });
    }
  }, [coords, loaded, positionM]);

  // camera + ego marker — re-runs on viewMode change to animate the perspective switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    // Resolve ego: prefer live telemetry, fall back to cache, then to nothing
    // (we still tween the camera in place so a viewMode toggle is always
    // visible — even before the first telemetry frame).
    let ego: [number, number] | null = null;
    let bearing = 0;
    let liveUpdate = false;

    if (coords && cumDist && positionM != null) {
      const fresh = interpolatePosition(coords, cumDist, positionM);
      if (fresh) {
        ego = fresh;
        if (viewMode === "chase" || viewMode === "follow") {
          const ahead = interpolatePosition(
            coords,
            cumDist,
            positionM + BEARING_LOOKAHEAD_M
          );
          bearing = ahead ? calcBearing(ego[0], ego[1], ahead[0], ahead[1]) : 0;
        }
        lastEgoRef.current = { ego, bearing };
        liveUpdate = true;
      }
    }
    if (!ego && lastEgoRef.current) {
      ego = lastEgoRef.current.ego;
      bearing = viewMode === "birdseye" ? 0 : lastEgoRef.current.bearing;
    }

    let pitch = BIRDSEYE_PITCH;
    let zoom = BIRDSEYE_ZOOM;
    let offset: [number, number] = BIRDSEYE_OFFSET;
    if (viewMode === "chase") {
      pitch = CHASE_PITCH;
      zoom = CHASE_ZOOM;
      offset = CHASE_OFFSET;
    } else if (viewMode === "follow") {
      pitch = FOLLOW_PITCH;
      zoom = FOLLOW_ZOOM;
      offset = FOLLOW_OFFSET;
    }

    // Slow tween only on perspective swap; fast linear tween on every
    // telemetry-driven position update so consecutive frames don't fight.
    const viewChanged = lastViewModeRef.current !== viewMode;
    lastViewModeRef.current = viewMode;

    // If ego is unknown (no telemetry yet) keep the current map center so the
    // perspective change is still visible.
    const center: [number, number] = ego
      ? [ego[1], ego[0]]
      : (map.getCenter().toArray() as [number, number]);
    const targetBearing = ego ? bearing : map.getBearing();
    map.easeTo({
      center,
      bearing: targetBearing,
      pitch,
      zoom,
      offset,
      duration: viewChanged ? VIEW_TWEEN_MS : POS_TWEEN_MS,
      easing: viewChanged ? undefined : LINEAR,
      essential: true,
    });

    if (!ego) return;

    const egoGeo = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [ego[1], ego[0]] },
      properties: {},
    };

    const egoSrc = map.getSource("ego") as mapboxgl.GeoJSONSource | undefined;
    if (egoSrc) {
      // Only push new data on live telemetry; on a paused viewMode-only run the
      // marker is already at the cached position, no need to re-setData.
      if (liveUpdate) egoSrc.setData(egoGeo);
    } else {
      map.addSource("ego", { type: "geojson", data: egoGeo });
      // Brighter base red compensates for the canvas brightness(0.7) filter.
      map.addLayer({
        id: "ego",
        type: "circle",
        source: "ego",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FF1A1A",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.moveLayer("ego");
    }
    // Only re-stack when something else has been appended above ego — calling
    // moveLayer every telemetry frame forces a renderer flush and is the main
    // contributor to the on-the-move flicker.
    const layers = map.getStyle().layers;
    if (layers && layers.length && layers[layers.length - 1].id !== "ego") {
      map.moveLayer("ego");
    }
  }, [coords, cumDist, positionM, loaded, viewMode]);

  // ghost marker — driven by backend lat/lng (not derived from positionM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const hasGhost =
      ghostLat != null &&
      ghostLng != null &&
      Number.isFinite(ghostLat) &&
      Number.isFinite(ghostLng);

    const ghostSrc = map.getSource("ghost") as mapboxgl.GeoJSONSource | undefined;

    if (!hasGhost) {
      // Hide marker by clearing data; layer stays so we don't have to re-add on next ghost
      if (ghostSrc) {
        ghostSrc.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      return;
    }

    const ghostGeo = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [ghostLng, ghostLat] },
      properties: {},
    };

    if (ghostSrc) {
      ghostSrc.setData(ghostGeo);
    } else {
      map.addSource("ghost", { type: "geojson", data: ghostGeo });
      // Insert ghost BELOW ego if ego exists, so ego stays the most prominent
      // marker without per-frame moveLayer churn.
      const beforeId = map.getLayer("ego") ? "ego" : undefined;
      map.addLayer(
        {
          id: "ghost",
          type: "circle",
          source: "ghost",
          paint: {
            "circle-radius": 7,
            "circle-color": "#3a3a3a",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.95,
          },
        },
        beforeId
      );
    }
  }, [ghostLat, ghostLng, loaded]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* mapbox-gl.css forces .mapboxgl-map { position: relative }, which
          overrides Tailwind's .absolute. Use w-full h-full so the size works
          regardless of position. */}
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute bottom-2 right-2 z-[1000] bg-black/60 text-white/90 px-2 py-1 text-[10px] font-condensed tracking-widest uppercase pointer-events-none">
        {viewMode === "chase"
          ? "CHASE · M"
          : viewMode === "follow"
          ? "FOLLOW · M"
          : "BIRDSEYE · M"}
      </div>
    </div>
  );
}
