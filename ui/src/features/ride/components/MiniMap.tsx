import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
if (!mapboxgl.accessToken) {
  throw new Error("VITE_MAPBOX_TOKEN is not set");
}
mapboxgl.prewarm();

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
const POS_TWEEN_MS = 80, VIEW_TWEEN_MS = 600;
const LINEAR = (t: number) => t;

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
  const lastViewModeRef = useRef<MapViewMode>(viewMode);
  const lastEgoRef = useRef<{ ego: [number, number]; bearing: number } | null>(null);
  const initialCameraSetRef = useRef(false);
  const cameraRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !coords?.length) return;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const routeStart = coords[0];
    const initialPitch = viewMode === "birdseye" ? BIRDSEYE_PITCH : viewMode === "follow" ? FOLLOW_PITCH : CHASE_PITCH;
    const initialZoom = viewMode === "birdseye" ? BIRDSEYE_ZOOM : viewMode === "follow" ? FOLLOW_ZOOM : CHASE_ZOOM;
    const initialBearing = viewMode === "birdseye" ? 0 : routeStartBearing(coords, cumDist);
    const map = new mapboxgl.Map({
      container,
      style: STYLE,
      config: { basemap: BASEMAP_CONFIG },
      center: [routeStart[1], routeStart[0]],
      bearing: initialBearing,
      zoom: initialZoom,
      pitch: initialPitch,
      attributionControl: false,
    });

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
      } catch { /* non-Standard style */ }
      if (!map.getSource(DEM_SOURCE_ID)) {
        map.addSource(DEM_SOURCE_ID, { type: "raster-dem", url: DEM_URL, tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
      map.resize();
      map.once("idle", revealConfiguredMap);
      revealTimer = setTimeout(revealConfiguredMap, 1200);
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
      map.remove();
      mapRef.current = null;
    };
  }, [coords, cumDist]);

  useEffect(() => {
    initialCameraSetRef.current = false;
    lastEgoRef.current = null;
    setRevealed(false);
    if (cameraRevealTimerRef.current) {
      clearTimeout(cameraRevealTimerRef.current);
      cameraRevealTimerRef.current = null;
    }
  }, [coords, cumDist]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !coords) return;
    const geojson = {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: coords.map(([lat, lng]) => [lng, lat]) },
      properties: {},
    };
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (src) { src.setData(geojson); }
    else {
      map.addSource("route", { type: "geojson", data: geojson });
      map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#74AFCB", "line-width": 3 } });
    }
    if (map.getLayer("route")) map.moveLayer("route");
  }, [coords, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    let ego: [number, number] | null = null, bearing = 0, liveUpdate = false;
    if (coords?.length && (lockToRouteStart || !initialCameraSetRef.current)) {
      ego = coords[0];
      bearing = viewMode === "birdseye" ? 0 : routeStartBearing(coords, cumDist);
      lastEgoRef.current = { ego, bearing };
      liveUpdate = true;
    } else if (coords && cumDist && positionM != null) {
      const fresh = interpolatePosition(coords, cumDist, positionM);
      if (fresh) {
        ego = fresh;
        if (viewMode === "chase" || viewMode === "follow") {
          const ahead = interpolatePosition(coords, cumDist, positionM + BEARING_LOOKAHEAD_M);
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
    lastViewModeRef.current = viewMode;
    if (!ego) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const center: [number, number] = [ego[1], ego[0]];
    const posDur = prefersReducedMotion ? 0 : POS_TWEEN_MS;
    const viewDur = prefersReducedMotion ? 0 : VIEW_TWEEN_MS;
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
    } else {
      map.easeTo({ center, bearing, pitch, zoom, offset, duration: viewChanged ? viewDur : posDur, easing: viewChanged ? undefined : LINEAR, essential: true });
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
  }, [coords, cumDist, positionM, styleReady, viewMode, lockToRouteStart, isDescending, isClimbing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const hasGhost = ghostLat != null && ghostLng != null && Number.isFinite(ghostLat) && Number.isFinite(ghostLng);
    const ghostSrc = map.getSource("ghost") as mapboxgl.GeoJSONSource | undefined;
    if (!hasGhost) { if (ghostSrc) ghostSrc.setData({ type: "FeatureCollection", features: [] }); return; }
    const ghostGeo = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [ghostLng, ghostLat] }, properties: {} };
    if (ghostSrc) { ghostSrc.setData(ghostGeo); }
    else {
      map.addSource("ghost", { type: "geojson", data: ghostGeo });
      map.addLayer({ id: "ghost", type: "circle", source: "ghost", paint: { "circle-radius": 6, "circle-color": "#74AFCB", "circle-stroke-color": "#B7C0CA", "circle-stroke-width": 1.5, "circle-opacity": 0.45 } }, map.getLayer("ego") ? "ego" : undefined);
    }
  }, [ghostLat, ghostLng, styleReady]);

  return (
    <div className="relative w-full h-full min-h-[300px] bg-[var(--bg)]">
      <div
        ref={containerRef}
        className={`w-full h-full transition-opacity duration-200 motion-reduce:transition-none ${revealed ? "opacity-100" : "opacity-0"}`}
      />
      <div className={`absolute bottom-2 right-2 z-[1000] bg-black/50 text-white/60 px-2 py-1 text-[10px] font-medium rounded pointer-events-none transition-opacity duration-200 ${revealed ? "opacity-100" : "opacity-0"}`}>
        {viewMode === "chase" ? "Chase" : viewMode === "follow" ? "Follow" : "Übersicht"}
      </div>
    </div>
  );
}
