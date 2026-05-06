import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapViewMode = "chase" | "birdseye";

interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;
  ghostLat?: number | null;
  ghostLng?: number | null;
  ghostBearingDeg?: number | null;
  ghostTimeGapS: number | null;
  isDark: boolean;
  viewMode: MapViewMode;
}

// Inline style — no external style.json fetch. OSM raster tiles are stable,
// keyless, and acceptable for low-volume personal use.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

const BEARING_LOOKAHEAD_M = 200;

const CHASE_PITCH = 60;
const CHASE_ZOOM = 17;
const CHASE_OFFSET: [number, number] = [0, 150];

const BIRDSEYE_PITCH = 0;
const BIRDSEYE_ZOOM = 14;
const BIRDSEYE_OFFSET: [number, number] = [0, 0];

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
  ghostTimeGapS,
  viewMode,
}: MiniMapProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  // init — must null mapRef in cleanup so React 19 double-mount re-creates the map
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [10, 50],
      zoom: 13,
      pitch: viewMode === "chase" ? CHASE_PITCH : BIRDSEYE_PITCH,
      attributionControl: false,
    });

    // 'styledata' fires as soon as the style is parsed (works for inline styles
    // that don't need a network roundtrip). 'load' is too late if tiles stall.
    const markLoaded = () => {
      map.resize();
      setLoaded(true);
    };
    map.once("styledata", markLoaded);
    map.once("load", markLoaded);

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

    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
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

    // Fit to route bounds on first load (only if no live position yet)
    if (positionM == null) {
      const lons = coords.map(([, lng]) => lng);
      const lats = coords.map(([lat]) => lat);
      const bounds = new maplibregl.LngLatBounds(
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)]
      );
      map.fitBounds(bounds, { padding: 40, duration: 0 });
    }
  }, [coords, loaded, positionM]);

  // camera + ego marker — re-runs on viewMode change to animate the perspective switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !coords || !cumDist || positionM == null) return;

    const ego = interpolatePosition(coords, cumDist, positionM);
    if (!ego) return;

    let bearing = 0;
    if (viewMode === "chase") {
      const ahead = interpolatePosition(
        coords,
        cumDist,
        positionM + BEARING_LOOKAHEAD_M
      );
      bearing = ahead ? calcBearing(ego[0], ego[1], ahead[0], ahead[1]) : 0;
    }

    map.easeTo({
      center: [ego[1], ego[0]],
      bearing,
      pitch: viewMode === "chase" ? CHASE_PITCH : BIRDSEYE_PITCH,
      zoom: viewMode === "chase" ? CHASE_ZOOM : BIRDSEYE_ZOOM,
      offset: viewMode === "chase" ? CHASE_OFFSET : BIRDSEYE_OFFSET,
      duration: 300,
    });

    const egoGeo = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [ego[1], ego[0]] },
      properties: {},
    };

    const egoSrc = map.getSource("ego") as maplibregl.GeoJSONSource | undefined;
    if (egoSrc) {
      egoSrc.setData(egoGeo);
    } else {
      map.addSource("ego", { type: "geojson", data: egoGeo });
      map.addLayer({
        id: "ego",
        type: "circle",
        source: "ego",
        paint: {
          "circle-radius": 7,
          "circle-color": "#E10600",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
    }
    // Stacking: route → ghost → ego. Re-asserted on every frame so order
    // survives layers being added in arbitrary effect-firing order.
    if (map.getLayer("ego")) map.moveLayer("ego");
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

    const ghostSrc = map.getSource("ghost") as maplibregl.GeoJSONSource | undefined;

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
      map.addLayer({
        id: "ghost",
        type: "circle",
        source: "ghost",
        paint: {
          "circle-radius": 6,
          "circle-color": "#bbbbbb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.85,
        },
      });
    }
    // Keep ghost above route + ego regardless of insertion order.
    if (map.getLayer("ghost")) map.moveLayer("ghost");
  }, [ghostLat, ghostLng, loaded]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* maplibre-gl.css forces .maplibregl-map { position: relative }, which
          overrides Tailwind's .absolute. Use w-full h-full so the size works
          regardless of position. */}
      <div ref={containerRef} className="w-full h-full" />

      {ghostTimeGapS != null && (
        <div className="absolute top-2 left-2 z-[1000] bg-black/70 text-white px-2 py-1 text-xs font-bold font-condensed tracking-widest">
          {ghostTimeGapS > 0
            ? `+${Math.round(ghostTimeGapS)}s`
            : `${Math.round(ghostTimeGapS)}s`}
        </div>
      )}

      <div className="absolute bottom-2 right-2 z-[1000] bg-black/60 text-white/90 px-2 py-1 text-[10px] font-condensed tracking-widest uppercase pointer-events-none">
        {viewMode === "chase" ? "CHASE · M" : "BIRDSEYE · M"}
      </div>
    </div>
  );
}
