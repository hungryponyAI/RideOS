import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
mapboxgl.accessToken = MAPBOX_TOKEN ?? "";
if (MAPBOX_TOKEN) {
  try {
    mapboxgl.prewarm();
  } catch (error) {
    console.warn("[RideOS] Mapbox prewarm failed", error);
  }
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
  lockToRouteStart?: boolean;
  isDescending?: boolean;
  isClimbing?: boolean;
}

const STYLE = "mapbox://styles/mapbox/standard";
const LIGHT_PRESET: "dawn" | "day" | "dusk" | "night" = "day";
const BASEMAP_CONFIG = {
  lightPreset: LIGHT_PRESET,
  theme: "monochrome",
  show3dObjects: true,
};
const DEM_SOURCE_ID = "mapbox-dem";
const DEM_URL = "mapbox://mapbox.mapbox-terrain-dem-v1";
const TERRAIN_EXAGGERATION = 1.5;
const BEARING_LOOKAHEAD_M = 200;
const CHASE_PITCH = 60, CHASE_ZOOM = 17, CHASE_OFFSET: [number, number] = [0, 150];
const FOLLOW_PITCH = 78, FOLLOW_ZOOM = 18.5, FOLLOW_OFFSET: [number, number] = [0, 220];
const DESCENT_CHASE_PITCH = 45, DESCENT_CHASE_ZOOM = 16.5;
const DESCENT_FOLLOW_PITCH = 60, DESCENT_FOLLOW_ZOOM = 17.5;
const CLIMB_CHASE_PITCH = 70, CLIMB_CHASE_ZOOM = 17.5;
const CLIMB_FOLLOW_PITCH = 82, CLIMB_FOLLOW_ZOOM = 19;
const BIRDSEYE_PITCH = 0, BIRDSEYE_ZOOM = 14, BIRDSEYE_OFFSET: [number, number] = [0, 0];
const POS_TWEEN_MS = 80;
const LINEAR = (t: number) => t;
const GHOST_COLOR = "#E58B4A";
const GHOST_STROKE = "#FFFFFF";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validCoord(coord: [number, number] | number[]): coord is [number, number] {
  const [lat, lng] = coord;
  return finiteNumber(lat) && finiteNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function validRoute(
  coords: Array<[number, number]> | null,
  cumDist: number[] | null,
): { coords: Array<[number, number]>; cumDist: number[] | null } | null {
  if (!coords || coords.length < 2) return null;
  if (!coords.every(validCoord)) return null;
  if (!cumDist) return { coords, cumDist: null };
  if (cumDist.length !== coords.length || !cumDist.every(finiteNumber)) return null;
  for (let i = 1; i < cumDist.length; i++) {
    if (cumDist[i] < cumDist[i - 1]) return null;
  }
  return { coords, cumDist };
}

function bisectRight(arr: number[], x: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function interpolatePosition(coords: Array<[number, number]>, cumDist: number[], targetM: number): [number, number] | null {
  if (!coords.length) return null;
  if (coords.length === 1 || cumDist.length < 2) return coords[0];
  const routeEndM = cumDist[cumDist.length - 1] ?? targetM;
  const clampedTargetM = Math.max(cumDist[0] ?? 0, Math.min(targetM, routeEndM));
  const idx = Math.min(Math.max(bisectRight(cumDist, clampedTargetM) - 1, 0), coords.length - 2);
  const d0 = cumDist[idx], d1 = cumDist[idx + 1];
  const t = d1 === d0 ? 0 : (clampedTargetM - d0) / (d1 - d0);
  const [lat0, lng0] = coords[idx], [lat1, lng1] = coords[idx + 1];
  return [lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t];
}

function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function routeStartBearing(coords: Array<[number, number]>, cumDist: number[] | null): number {
  if (coords.length < 2) return 0;
  const start = coords[0];
  const ahead = cumDist ? interpolatePosition(coords, cumDist, BEARING_LOOKAHEAD_M) : coords[1];
  return ahead ? calcBearing(start[0], start[1], ahead[0], ahead[1]) : 0;
}

export function MiniMap({ coords, cumDist, positionM, ghostLat, ghostLng, viewMode, lockToRouteStart = false, isDescending, isClimbing }: MiniMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const lastViewModeRef = useRef<MapViewMode>(viewMode);
  const lastEgoRef = useRef<{ ego: [number, number]; bearing: number } | null>(null);
  const initialCameraSetRef = useRef(false);
  const cameraRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const route = useMemo(() => validRoute(coords, cumDist), [coords, cumDist]);
  const safePositionM = finiteNumber(positionM) ? positionM : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !route || !MAPBOX_TOKEN) return;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const routeStart = route.coords[0];
    const initialPitch = viewMode === "birdseye" ? BIRDSEYE_PITCH : viewMode === "follow" ? FOLLOW_PITCH : CHASE_PITCH;
    const initialZoom = viewMode === "birdseye" ? BIRDSEYE_ZOOM : viewMode === "follow" ? FOLLOW_ZOOM : CHASE_ZOOM;
    const initialBearing = viewMode === "birdseye" ? 0 : routeStartBearing(route.coords, route.cumDist);
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container,
        style: STYLE,
        config: { basemap: BASEMAP_CONFIG },
        center: [routeStart[1], routeStart[0]],
        bearing: initialBearing,
        zoom: initialZoom,
        pitch: initialPitch,
        attributionControl: false,
      });
    } catch (error) {
      console.error("[RideOS] Mapbox initialization failed", error);
      setMapFailed(true);
      return;
    }

    const revealConfiguredMap = () => {
      if (disposed) return;
      setStyleReady(true);
      if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
    };

    const markLoaded = () => {
      try {
        map.setConfigProperty("basemap", "lightPreset", LIGHT_PRESET);
        map.setConfigProperty("basemap", "theme", "monochrome");
        map.setConfigProperty("basemap", "show3dObjects", true);
        if (!map.getSource(DEM_SOURCE_ID)) {
          map.addSource(DEM_SOURCE_ID, { type: "raster-dem", url: DEM_URL, tileSize: 512, maxzoom: 14 });
        }
        map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
        map.resize();
        map.once("idle", revealConfiguredMap);
        revealTimer = setTimeout(revealConfiguredMap, 1200);
      } catch (error) {
        console.warn("[RideOS] Map style setup failed", error);
        revealConfiguredMap();
      }
    };
    map.once("load", markLoaded);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    mapRef.current = map;
    return () => {
      disposed = true;
      if (revealTimer) clearTimeout(revealTimer);
      if (cameraRevealTimerRef.current) {
        clearTimeout(cameraRevealTimerRef.current);
        cameraRevealTimerRef.current = null;
      }
      ro.disconnect();
      setStyleReady(false);
      setRevealed(false);
      initialCameraSetRef.current = false;
      try {
        map.remove();
      } catch (error) {
        console.warn("[RideOS] Map cleanup failed", error);
      }
      mapRef.current = null;
    };
  }, [route, viewMode]);

  useEffect(() => {
    initialCameraSetRef.current = false;
    lastEgoRef.current = null;
    setRevealed(false);
    if (cameraRevealTimerRef.current) {
      clearTimeout(cameraRevealTimerRef.current);
      cameraRevealTimerRef.current = null;
    }
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !route) return;
    const geojson = {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: route.coords.map(([lat, lng]) => [lng, lat]) },
      properties: {},
    };
    try {
      const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
      if (src) { src.setData(geojson); }
      else {
        map.addSource("route", { type: "geojson", data: geojson });
        map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#74AFCB", "line-width": 3 } });
      }
      if (map.getLayer("route")) map.moveLayer("route");
    } catch (error) {
      console.warn("[RideOS] Route layer update failed", error);
    }
  }, [route, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    let ego: [number, number] | null = null, bearing = 0, liveUpdate = false;
    if (route?.coords.length && (lockToRouteStart || !initialCameraSetRef.current)) {
      ego = route.coords[0];
      bearing = viewMode === "birdseye" ? 0 : routeStartBearing(route.coords, route.cumDist);
      lastEgoRef.current = { ego, bearing };
      liveUpdate = true;
    } else if (route?.cumDist && safePositionM != null) {
      const fresh = interpolatePosition(route.coords, route.cumDist, safePositionM);
      if (fresh) {
        ego = fresh;
        if (viewMode === "chase" || viewMode === "follow") {
          const ahead = interpolatePosition(route.coords, route.cumDist, safePositionM + BEARING_LOOKAHEAD_M);
          bearing = ahead ? calcBearing(ego[0], ego[1], ahead[0], ahead[1]) : 0;
        }
        lastEgoRef.current = { ego, bearing };
        liveUpdate = true;
      }
    }
    if (!ego && lastEgoRef.current) { ego = lastEgoRef.current.ego; bearing = viewMode === "birdseye" ? 0 : lastEgoRef.current.bearing; }
    let pitch = BIRDSEYE_PITCH, zoom = BIRDSEYE_ZOOM, offset: [number, number] = BIRDSEYE_OFFSET;
    if (viewMode === "chase") {
      pitch = isDescending ? DESCENT_CHASE_PITCH : isClimbing ? CLIMB_CHASE_PITCH : CHASE_PITCH;
      zoom = isDescending ? DESCENT_CHASE_ZOOM : isClimbing ? CLIMB_CHASE_ZOOM : CHASE_ZOOM;
      offset = CHASE_OFFSET;
    } else if (viewMode === "follow") {
      pitch = isDescending ? DESCENT_FOLLOW_PITCH : isClimbing ? CLIMB_FOLLOW_PITCH : FOLLOW_PITCH;
      zoom = isDescending ? DESCENT_FOLLOW_ZOOM : isClimbing ? CLIMB_FOLLOW_ZOOM : FOLLOW_ZOOM;
      offset = FOLLOW_OFFSET;
    }
    const viewChanged = lastViewModeRef.current !== viewMode;
    if (!ego) return;
    lastViewModeRef.current = viewMode;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const center: [number, number] = [ego[1], ego[0]];
    const posDur = prefersReducedMotion ? 0 : POS_TWEEN_MS;
    try {
      if (!initialCameraSetRef.current) {
        map.stop();
        map.easeTo({ center, bearing, pitch, zoom, offset, duration: 0, essential: true });
        initialCameraSetRef.current = true;
        const revealCamera = () => {
          if (cameraRevealTimerRef.current) {
            clearTimeout(cameraRevealTimerRef.current);
            cameraRevealTimerRef.current = null;
          }
          setRevealed(true);
        };
        map.once("idle", revealCamera);
        cameraRevealTimerRef.current = setTimeout(revealCamera, 250);
      } else if (viewChanged) {
        map.stop();
        map.easeTo({ center, bearing, pitch, zoom, offset, duration: 0, essential: true });
      } else {
        map.easeTo({ center, bearing, pitch, zoom, offset, duration: posDur, easing: LINEAR, essential: true });
      }
      const egoGeo = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [ego[1], ego[0]] }, properties: {} };
      const egoSrc = map.getSource("ego") as mapboxgl.GeoJSONSource | undefined;
      if (egoSrc) { if (liveUpdate) egoSrc.setData(egoGeo); }
      else {
        map.addSource("ego", { type: "geojson", data: egoGeo });
        map.addLayer({ id: "ego", type: "circle", source: "ego", paint: { "circle-radius": 8, "circle-color": "#FFFFFF", "circle-stroke-color": "#74AFCB", "circle-stroke-width": 2.5 } });
        map.moveLayer("ego");
      }
      const layers = map.getStyle().layers;
      if (layers && layers.length && layers[layers.length - 1].id !== "ego") map.moveLayer("ego");
    } catch (error) {
      console.warn("[RideOS] Map camera update failed", error);
      setRevealed(true);
    }
  }, [route, safePositionM, styleReady, viewMode, lockToRouteStart, isDescending, isClimbing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const hasGhost = ghostLat != null && ghostLng != null && Number.isFinite(ghostLat) && Number.isFinite(ghostLng);
    try {
      const ghostSrc = map.getSource("ghost") as mapboxgl.GeoJSONSource | undefined;
      if (!hasGhost) { if (ghostSrc) ghostSrc.setData({ type: "FeatureCollection", features: [] }); return; }
      const ghostGeo = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [ghostLng, ghostLat] }, properties: {} };
      if (ghostSrc) { ghostSrc.setData(ghostGeo); }
      else {
        map.addSource("ghost", { type: "geojson", data: ghostGeo });
        map.addLayer({
          id: "ghost-halo",
          type: "circle",
          source: "ghost",
          paint: {
            "circle-radius": 18,
            "circle-color": GHOST_COLOR,
            "circle-opacity": 0.24,
            "circle-blur": 0.35,
          },
        }, map.getLayer("ego") ? "ego" : undefined);
        map.addLayer({
          id: "ghost",
          type: "circle",
          source: "ghost",
          paint: {
            "circle-radius": 7.5,
            "circle-color": GHOST_COLOR,
            "circle-stroke-color": GHOST_STROKE,
            "circle-stroke-width": 2.5,
            "circle-opacity": 0.95,
          },
        }, map.getLayer("ego") ? "ego" : undefined);
      }
    } catch (error) {
      console.warn("[RideOS] Ghost layer update failed", error);
    }
  }, [ghostLat, ghostLng, styleReady]);

  return (
    <div className="relative w-full h-full min-h-[300px] bg-[var(--bg)]">
      {(!MAPBOX_TOKEN || !route || mapFailed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)] text-[11px] font-medium text-[var(--text-muted)]">
          {!MAPBOX_TOKEN ? "Mapbox Token fehlt" : mapFailed ? "Karte nicht verfügbar" : "Warte auf Strecke"}
        </div>
      )}
      <div
        ref={containerRef}
        className={`w-full h-full transition-opacity duration-200 motion-reduce:transition-none ${revealed ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
