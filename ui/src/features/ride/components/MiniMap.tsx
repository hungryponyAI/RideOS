import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  EXTRAPOLATION_HORIZON_MS,
  RECONNECT_SNAP_MS,
  STALE_FADE_MS,
  STALE_FREEZE_MS,
  TAU_CAMERA_BEARING_MS,
  TAU_CAMERA_CENTER_MS,
  TAU_CAMERA_PITCH_ZOOM_MS,
  TAU_GHOST_MS,
  TAU_POSITION_MS,
  clampExtrapolationM,
  lerp,
  lerpAngleDeg,
  projectOntoRoute,
  springAlpha,
} from "./MiniMap.motion";

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
  speedKmh?: number | null;
  ghostLat?: number | null;
  ghostLng?: number | null;
  ghostBearingDeg?: number | null;
  ghostDistM?: number | null;
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
const VIEWMODE_EASE_MS = 450;
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

interface CameraTarget {
  pitch: number;
  zoom: number;
  offset: [number, number];
  bearing: number;
  center: [number, number];
}

interface EgoTarget {
  posM: number;
  receivedAt: number;
  speedMPerS: number;
}

interface GhostTarget {
  lat: number;
  lng: number;
  bearing: number;
  receivedAt: number;
  posM: number | null;
  speedMPerS: number;
}

const SPEED_EMA_ALPHA = 0.35;

interface DebugMetrics {
  wsDeltaMs: number;
  egoErrM: number;
  ghostErrM: number;
  frameMs: number;
  frames: number;
}

function isDebugMotionEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).has("debugMotion");
  } catch {
    return false;
  }
}

export function MiniMap({
  coords,
  cumDist,
  positionM,
  speedKmh,
  ghostLat,
  ghostLng,
  ghostBearingDeg,
  ghostDistM,
  viewMode,
  lockToRouteStart = false,
  isDescending,
  isClimbing,
}: MiniMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const debugEnabledRef = useRef<boolean>(isDebugMotionEnabled());
  const reducedMotionRef = useRef<boolean>(false);

  const egoTargetRef = useRef<EgoTarget | null>(null);
  const egoCurrentRef = useRef<{ posM: number; lat: number; lng: number; bearing: number } | null>(null);

  const ghostTargetRef = useRef<GhostTarget | null>(null);
  const ghostCurrentRef = useRef<{ posM: number | null; lat: number; lng: number; bearing: number } | null>(null);
  const prevGhostSampleRef = useRef<{ posM: number | null; lat: number; lng: number; receivedAt: number } | null>(null);
  const ghostSpeedEmaRef = useRef<number>(0);

  const cameraTargetRef = useRef<CameraTarget | null>(null);
  const cameraCurrentRef = useRef<CameraTarget | null>(null);

  const lastViewModeRef = useRef<MapViewMode>(viewMode);
  const initialCameraSetRef = useRef(false);
  const cameraRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsSampleClockRef = useRef<number>(0);
  const lastEgoSampleAtRef = useRef<number>(0);
  const lastGhostSampleAtRef = useRef<number>(0);
  const [debugMetrics, setDebugMetrics] = useState<DebugMetrics | null>(null);
  const debugTickRef = useRef<number>(0);

  const route = useMemo(() => validRoute(coords, cumDist), [coords, cumDist]);
  const safePositionM = finiteNumber(positionM) ? positionM : null;
  const speedMPerS = finiteNumber(speedKmh) ? Math.max(0, speedKmh) / 3.6 : 0;

  // Determine reduced-motion preference once on mount.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    try {
      reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reducedMotionRef.current = false;
    }
  }, []);

  // Mount Mapbox instance once per route.
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
      if (rafRef.current != null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ro.disconnect();
      setStyleReady(false);
      setRevealed(false);
      initialCameraSetRef.current = false;
      egoTargetRef.current = null;
      egoCurrentRef.current = null;
      ghostTargetRef.current = null;
      ghostCurrentRef.current = null;
      prevGhostSampleRef.current = null;
      cameraTargetRef.current = null;
      cameraCurrentRef.current = null;
      try {
        map.remove();
      } catch (error) {
        console.warn("[RideOS] Map cleanup failed", error);
      }
      mapRef.current = null;
    };
  }, [route, viewMode]);

  // Reset transient state when the route changes.
  useEffect(() => {
    initialCameraSetRef.current = false;
    setRevealed(false);
    egoCurrentRef.current = null;
    egoTargetRef.current = null;
    ghostCurrentRef.current = null;
    ghostTargetRef.current = null;
    prevGhostSampleRef.current = null;
    ghostSpeedEmaRef.current = 0;
    cameraCurrentRef.current = null;
    cameraTargetRef.current = null;
    if (cameraRevealTimerRef.current) {
      clearTimeout(cameraRevealTimerRef.current);
      cameraRevealTimerRef.current = null;
    }
  }, [route]);

  // Route polyline as GeoJSON.
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

  // Update ego target whenever positionM / speed changes.
  useEffect(() => {
    if (!route) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const prevSampleAt = lastEgoSampleAtRef.current;
    lastEgoSampleAtRef.current = now;
    if (prevSampleAt > 0) wsSampleClockRef.current = now - prevSampleAt;

    if (lockToRouteStart || !initialCameraSetRef.current) {
      egoTargetRef.current = { posM: 0, receivedAt: now, speedMPerS: 0 };
      if (!egoCurrentRef.current) {
        const [lat, lng] = route.coords[0];
        const bearing = viewMode === "birdseye" ? 0 : routeStartBearing(route.coords, route.cumDist);
        egoCurrentRef.current = { posM: 0, lat, lng, bearing };
      }
      return;
    }
    if (!route.cumDist || safePositionM == null) return;
    const gapSinceLast = prevSampleAt > 0 ? now - prevSampleAt : 0;
    egoTargetRef.current = { posM: safePositionM, receivedAt: now, speedMPerS };
    if (egoCurrentRef.current == null) {
      const interp = interpolatePosition(route.coords, route.cumDist, safePositionM);
      const bearing = viewMode === "birdseye" ? 0 : (() => {
        const ahead = interpolatePosition(route.coords, route.cumDist, safePositionM + BEARING_LOOKAHEAD_M);
        return interp && ahead ? calcBearing(interp[0], interp[1], ahead[0], ahead[1]) : 0;
      })();
      if (interp) egoCurrentRef.current = { posM: safePositionM, lat: interp[0], lng: interp[1], bearing };
    } else if (gapSinceLast > RECONNECT_SNAP_MS && route.cumDist) {
      const interp = interpolatePosition(route.coords, route.cumDist, safePositionM);
      if (interp) {
        egoCurrentRef.current.posM = safePositionM;
        egoCurrentRef.current.lat = interp[0];
        egoCurrentRef.current.lng = interp[1];
      }
    }
  }, [route, safePositionM, lockToRouteStart, viewMode, speedMPerS]);

  // Update ghost target whenever ghost coords or along-route distance change.
  useEffect(() => {
    if (!route) return;
    const hasGhost = finiteNumber(ghostLat) && finiteNumber(ghostLng);
    if (!hasGhost) {
      ghostTargetRef.current = null;
      ghostCurrentRef.current = null;
      prevGhostSampleRef.current = null;
      ghostSpeedEmaRef.current = 0;
      return;
    }
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const prevSampleAt = lastGhostSampleAtRef.current;
    lastGhostSampleAtRef.current = now;

    let posM: number | null = null;
    let lat = ghostLat!;
    let lng = ghostLng!;
    if (finiteNumber(ghostDistM) && route.cumDist) {
      posM = ghostDistM;
      const onRoute = interpolatePosition(route.coords, route.cumDist, ghostDistM);
      if (onRoute) { lat = onRoute[0]; lng = onRoute[1]; }
    } else if (route.cumDist) {
      const projected = projectOntoRoute(ghostLat!, ghostLng!, route.coords, route.cumDist);
      if (projected) {
        posM = projected.distM;
        lat = projected.lat;
        lng = projected.lng;
      }
    }

    const prev = prevGhostSampleRef.current;
    let instantSpeedMPerS = 0;
    if (prev) {
      const dtS = (now - prev.receivedAt) / 1000;
      if (dtS > 0 && dtS < 2) {
        if (posM != null && prev.posM != null) {
          const deltaM = posM - prev.posM;
          if (deltaM >= 0) instantSpeedMPerS = deltaM / dtS;
        } else {
          const r = 6_371_000;
          const dLat = ((lat - prev.lat) * Math.PI) / 180;
          const dLng = ((lng - prev.lng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((prev.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          instantSpeedMPerS = (2 * r * Math.asin(Math.min(1, Math.sqrt(a)))) / dtS;
        }
      }
    }
    const prevEma = ghostSpeedEmaRef.current;
    const smoothedSpeed = prevEma > 0
      ? prevEma + SPEED_EMA_ALPHA * (instantSpeedMPerS - prevEma)
      : instantSpeedMPerS;
    ghostSpeedEmaRef.current = smoothedSpeed;
    prevGhostSampleRef.current = { posM, lat, lng, receivedAt: now };

    const bearing = finiteNumber(ghostBearingDeg)
      ? ghostBearingDeg!
      : (ghostCurrentRef.current?.bearing ?? 0);
    const gapSinceLast = prevSampleAt > 0 ? now - prevSampleAt : 0;
    ghostTargetRef.current = { lat, lng, bearing, receivedAt: now, posM, speedMPerS: smoothedSpeed };
    if (!ghostCurrentRef.current || gapSinceLast > RECONNECT_SNAP_MS) {
      ghostCurrentRef.current = { posM, lat, lng, bearing };
    }
  }, [route, ghostLat, ghostLng, ghostBearingDeg, ghostDistM]);

  // View-mode change: a single short ease so the perspective swap feels deliberate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !initialCameraSetRef.current) {
      lastViewModeRef.current = viewMode;
      return;
    }
    if (lastViewModeRef.current === viewMode) return;
    lastViewModeRef.current = viewMode;
    const target = cameraTargetRef.current;
    if (!target) return;
    try {
      map.easeTo({
        center: target.center,
        bearing: target.bearing,
        pitch: target.pitch,
        zoom: target.zoom,
        offset: target.offset,
        duration: reducedMotionRef.current ? 0 : VIEWMODE_EASE_MS,
        essential: true,
      });
      if (cameraCurrentRef.current) {
        cameraCurrentRef.current = { ...target };
      }
    } catch (error) {
      console.warn("[RideOS] View-mode ease failed", error);
    }
  }, [viewMode, styleReady]);

  // The rAF render loop — single source of truth for marker + camera motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !route) return;

    const ensureEgoLayer = (lat: number, lng: number) => {
      const egoGeo = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [lng, lat] }, properties: {} };
      const egoSrc = map.getSource("ego") as mapboxgl.GeoJSONSource | undefined;
      if (egoSrc) { egoSrc.setData(egoGeo); return; }
      try {
        map.addSource("ego", { type: "geojson", data: egoGeo });
        map.addLayer({
          id: "ego",
          type: "circle",
          source: "ego",
          paint: {
            "circle-radius": 8,
            "circle-color": "#FFFFFF",
            "circle-stroke-color": "#74AFCB",
            "circle-stroke-width": 2.5,
          },
        });
      } catch (error) {
        console.warn("[RideOS] Ego layer create failed", error);
      }
    };

    const ensureGhostLayer = (lat: number, lng: number, opacity: number) => {
      const ghostGeo = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [lng, lat] }, properties: {} };
      const ghostSrc = map.getSource("ghost") as mapboxgl.GeoJSONSource | undefined;
      if (ghostSrc) {
        ghostSrc.setData(ghostGeo);
        try {
          if (map.getLayer("ghost")) map.setPaintProperty("ghost", "circle-opacity", 0.95 * opacity);
          if (map.getLayer("ghost-halo")) map.setPaintProperty("ghost-halo", "circle-opacity", 0.24 * opacity);
        } catch { /* paint property not yet available */ }
        return;
      }
      try {
        map.addSource("ghost", { type: "geojson", data: ghostGeo });
        const beforeId = map.getLayer("ego") ? "ego" : undefined;
        map.addLayer({
          id: "ghost-halo",
          type: "circle",
          source: "ghost",
          paint: {
            "circle-radius": 18,
            "circle-color": GHOST_COLOR,
            "circle-opacity": 0.24 * opacity,
            "circle-blur": 0.35,
          },
        }, beforeId);
        map.addLayer({
          id: "ghost",
          type: "circle",
          source: "ghost",
          paint: {
            "circle-radius": 7.5,
            "circle-color": GHOST_COLOR,
            "circle-stroke-color": GHOST_STROKE,
            "circle-stroke-width": 2.5,
            "circle-opacity": 0.95 * opacity,
          },
        }, beforeId);
      } catch (error) {
        console.warn("[RideOS] Ghost layer create failed", error);
      }
    };

    const clearGhost = () => {
      const ghostSrc = map.getSource("ghost") as mapboxgl.GeoJSONSource | undefined;
      if (ghostSrc) ghostSrc.setData({ type: "FeatureCollection", features: [] });
    };

    const computeCameraTarget = (egoLat: number, egoLng: number, bearing: number): CameraTarget => {
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
      const cameraBearing = viewMode === "birdseye" ? 0 : bearing;
      return { center: [egoLng, egoLat], bearing: cameraBearing, pitch, zoom, offset };
    };

    const applyInitialCamera = () => {
      if (initialCameraSetRef.current) return;
      const cur = egoCurrentRef.current;
      if (!cur) return;
      const target = computeCameraTarget(cur.lat, cur.lng, cur.bearing);
      cameraTargetRef.current = target;
      cameraCurrentRef.current = { ...target };
      try {
        map.stop();
        map.easeTo({
          center: target.center,
          bearing: target.bearing,
          pitch: target.pitch,
          zoom: target.zoom,
          offset: target.offset,
          duration: 0,
          essential: true,
        });
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
      } catch (error) {
        console.warn("[RideOS] Initial camera apply failed", error);
        setRevealed(true);
      }
    };

    const step = (now: number) => {
      const last = lastFrameRef.current;
      const dt = last > 0 ? Math.max(1, Math.min(100, now - last)) : 16;
      lastFrameRef.current = now;

      if (egoTargetRef.current && !egoCurrentRef.current) {
        const target = egoTargetRef.current;
        const r = route;
        if (r && r.cumDist) {
          const interp = interpolatePosition(r.coords, r.cumDist, target.posM);
          if (interp) {
            const ahead = interpolatePosition(r.coords, r.cumDist, target.posM + BEARING_LOOKAHEAD_M);
            const bearing = ahead ? calcBearing(interp[0], interp[1], ahead[0], ahead[1]) : 0;
            egoCurrentRef.current = { posM: target.posM, lat: interp[0], lng: interp[1], bearing };
          }
        }
      }

      if (egoTargetRef.current && egoCurrentRef.current && route && route.cumDist) {
        const target = egoTargetRef.current;
        const current = egoCurrentRef.current;
        const sampleAge = now - target.receivedAt;
        let goalM = target.posM;
        if (sampleAge < STALE_FREEZE_MS && target.speedMPerS > 0) {
          goalM = target.posM + clampExtrapolationM(target.speedMPerS, sampleAge, EXTRAPOLATION_HORIZON_MS);
        }
        const alpha = reducedMotionRef.current ? 1 : springAlpha(dt, TAU_POSITION_MS);
        const nextPosM = lerp(current.posM, goalM, alpha);
        const interp = interpolatePosition(route.coords, route.cumDist, nextPosM);
        if (interp) {
          const ahead = interpolatePosition(route.coords, route.cumDist, nextPosM + BEARING_LOOKAHEAD_M);
          const targetBearing = ahead ? calcBearing(interp[0], interp[1], ahead[0], ahead[1]) : current.bearing;
          current.posM = nextPosM;
          current.lat = interp[0];
          current.lng = interp[1];
          current.bearing = lerpAngleDeg(current.bearing, targetBearing, alpha);
        }
      }

      if (ghostTargetRef.current) {
        const target = ghostTargetRef.current;
        if (!ghostCurrentRef.current) {
          ghostCurrentRef.current = { posM: target.posM, lat: target.lat, lng: target.lng, bearing: target.bearing };
        }
        const current = ghostCurrentRef.current;
        const sampleAge = now - target.receivedAt;
        const alpha = reducedMotionRef.current ? 1 : springAlpha(dt, TAU_GHOST_MS);

        if (target.posM != null && route && route.cumDist) {
          const stepM = target.speedMPerS > 0 && sampleAge < STALE_FREEZE_MS
            ? clampExtrapolationM(target.speedMPerS, sampleAge, EXTRAPOLATION_HORIZON_MS)
            : 0;
          const goalPosM = target.posM + stepM;
          const curPosM = current.posM ?? goalPosM;
          const nextPosM = lerp(curPosM, goalPosM, alpha);
          const onRoute = interpolatePosition(route.coords, route.cumDist, nextPosM);
          if (onRoute) {
            current.posM = nextPosM;
            current.lat = onRoute[0];
            current.lng = onRoute[1];
          }
        } else {
          current.posM = null;
          current.lat = lerp(current.lat, target.lat, alpha);
          current.lng = lerp(current.lng, target.lng, alpha);
        }
        current.bearing = lerpAngleDeg(current.bearing, target.bearing, alpha);
      }

      const egoCur = egoCurrentRef.current;
      if (egoCur) {
        const desired = computeCameraTarget(egoCur.lat, egoCur.lng, egoCur.bearing);
        cameraTargetRef.current = desired;

        if (!initialCameraSetRef.current) {
          applyInitialCamera();
        } else if (cameraCurrentRef.current) {
          const cam = cameraCurrentRef.current;
          const centerAlpha = reducedMotionRef.current ? 1 : springAlpha(dt, TAU_CAMERA_CENTER_MS);
          const bearingAlpha = reducedMotionRef.current ? 1 : springAlpha(dt, TAU_CAMERA_BEARING_MS);
          const pzAlpha = reducedMotionRef.current ? 1 : springAlpha(dt, TAU_CAMERA_PITCH_ZOOM_MS);
          cam.center = [lerp(cam.center[0], desired.center[0], centerAlpha), lerp(cam.center[1], desired.center[1], centerAlpha)];
          cam.bearing = lerpAngleDeg(cam.bearing, desired.bearing, bearingAlpha);
          cam.pitch = lerp(cam.pitch, desired.pitch, pzAlpha);
          cam.zoom = lerp(cam.zoom, desired.zoom, pzAlpha);
          cam.offset = [lerp(cam.offset[0], desired.offset[0], pzAlpha), lerp(cam.offset[1], desired.offset[1], pzAlpha)];
          try {
            map.jumpTo({ center: cam.center, bearing: cam.bearing, pitch: cam.pitch, zoom: cam.zoom });
          } catch (error) {
            console.warn("[RideOS] Camera jumpTo failed", error);
          }
        }

        ensureEgoLayer(egoCur.lat, egoCur.lng);
      }

      if (ghostCurrentRef.current && ghostTargetRef.current) {
        const sampleAge = now - ghostTargetRef.current.receivedAt;
        const fadeStart = STALE_FADE_MS;
        const fadeEnd = STALE_FADE_MS + 1000;
        const opacity = sampleAge < fadeStart
          ? 1
          : sampleAge > fadeEnd
            ? 0.5
            : 1 - 0.5 * ((sampleAge - fadeStart) / (fadeEnd - fadeStart));
        ensureGhostLayer(ghostCurrentRef.current.lat, ghostCurrentRef.current.lng, opacity);
      } else if (!ghostTargetRef.current) {
        clearGhost();
      }

      if (debugEnabledRef.current) {
        debugTickRef.current++;
        if (debugTickRef.current % 6 === 0) {
          const target = egoTargetRef.current;
          const current = egoCurrentRef.current;
          const ghostTarget = ghostTargetRef.current;
          const ghostCurrent = ghostCurrentRef.current;
          setDebugMetrics({
            wsDeltaMs: Math.round(wsSampleClockRef.current),
            egoErrM: target && current ? Math.round(Math.abs(target.posM - current.posM)) : 0,
            ghostErrM: ghostTarget && ghostCurrent
              ? Math.round(Math.hypot((ghostTarget.lat - ghostCurrent.lat) * 111_000, (ghostTarget.lng - ghostCurrent.lng) * 80_000))
              : 0,
            frameMs: Math.round(dt),
            frames: debugTickRef.current,
          });
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [route, styleReady, viewMode, isDescending, isClimbing]);

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
      {debugEnabledRef.current && debugMetrics && (
        <div
          data-testid="motion-debug-overlay"
          className="absolute bottom-2 left-2 z-50 rounded-md bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white pointer-events-none"
          aria-hidden="true"
        >
          <div>ws Δ {debugMetrics.wsDeltaMs}ms</div>
          <div>ego err {debugMetrics.egoErrM}m · ghost err {debugMetrics.ghostErrM}m</div>
          <div>frame {debugMetrics.frameMs}ms · #{debugMetrics.frames}</div>
        </div>
      )}
    </div>
  );
}
