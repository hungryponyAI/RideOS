import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WSContext } from "./WSContext";
import type { ConnectionStatus } from "../types/telemetry";
import type { MapViewMode } from "../../features/ride/components/MiniMap";
import {
  incrementRideDiagCounter,
  recordRideDiag,
  setRideDiagGauge,
} from "../diagnostics/rideDiagnostics";

export const SIM_ROUTE_ID = "sim-route";
export const SIM_SESSION_ID = "sim-session";

interface SimConfig {
  durationMin: number;
  telemetryHz: number;
  routePoints: number;
  speed: number;
}

interface SimRoute {
  lats: number[];
  lons: number[];
  elevations_m: number[];
  cum_dist_m: number[];
  grades_pct: number[];
  total_dist_m: number;
}

const BASE_SPEED_MPS = 7.5;

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function numericParam(name: string, fallback: number, min: number, max: number): number {
  const value = Number(param(name));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function isRideSimEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("rideSim");
  } catch {
    return false;
  }
}

export function getSimViewMode(): MapViewMode {
  const view = param("simView");
  return view === "follow" || view === "birdseye" || view === "chase" ? view : "chase";
}

function readSimConfig(): SimConfig {
  return {
    durationMin: numericParam("simDurationMin", 45, 1, 240),
    telemetryHz: numericParam("simTelemetryHz", 4, 1, 30),
    routePoints: Math.round(numericParam("simRoutePoints", 3000, 50, 30_000)),
    speed: numericParam("simSpeed", 1, 0.1, 20),
  };
}

function generateRoute(config: SimConfig): SimRoute {
  const totalDistM = BASE_SPEED_MPS * config.durationMin * 60;
  const points = config.routePoints;
  const lats: number[] = [];
  const lons: number[] = [];
  const elevations_m: number[] = [];
  const cum_dist_m: number[] = [];
  const grades_pct: number[] = [];
  const lat0 = 47.269;
  const lon0 = 11.393;

  for (let i = 0; i < points; i++) {
    const t = points <= 1 ? 0 : i / (points - 1);
    const dist = totalDistM * t;
    const eastM = dist * 0.74;
    const northM = Math.sin(t * Math.PI * 5) * 900 + dist * 0.18;
    const lat = lat0 + northM / 111_000;
    const lon = lon0 + eastM / (111_000 * Math.cos((lat0 * Math.PI) / 180));
    const elev =
      580 +
      Math.sin(t * Math.PI * 8) * 70 +
      Math.sin(t * Math.PI * 23) * 12 +
      t * 160;
    lats.push(lat);
    lons.push(lon);
    elevations_m.push(elev);
    cum_dist_m.push(dist);
    if (i === 0) {
      grades_pct.push(0);
    } else {
      const deltaElev = elev - elevations_m[i - 1];
      const deltaDist = Math.max(1, dist - cum_dist_m[i - 1]);
      grades_pct.push(Math.max(-12, Math.min(14, (deltaElev / deltaDist) * 100)));
    }
  }

  return { lats, lons, elevations_m, cum_dist_m, grades_pct, total_dist_m: totalDistM };
}

export function SimulatedWSProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readSimConfig(), []);
  const route = useMemo(() => generateRoute(config), [config]);
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const lastMsgRef = useRef<Map<string, unknown>>(new Map());
  const pausedRef = useRef(false);
  const endedRef = useRef(false);
  const elapsedRef = useRef(0);
  const lastClockMsRef = useRef<number | null>(null);
  const gearRef = useRef(6);
  const [status] = useState<ConnectionStatus>("live");

  const advanceClock = useCallback(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = lastClockMsRef.current;
    lastClockMsRef.current = now;
    if (last == null || pausedRef.current || endedRef.current) return;
    const dtS = Math.max(0, (now - last) / 1000);
    elapsedRef.current += dtS * config.speed;
  }, [config.speed]);

  const dispatch = useCallback((msg: Record<string, unknown>) => {
    if (typeof msg.type !== "string") return;
    incrementRideDiagCounter("sim_messages");
    incrementRideDiagCounter(`sim_${msg.type}`);
    lastMsgRef.current.set(msg.type, msg);
    const listeners = listenersRef.current.get(msg.type);
    listeners?.forEach((cb) => {
      try {
        cb(msg);
      } catch (error) {
        console.error("[RideOS] Simulated WS subscriber failed", error);
      }
    });
  }, []);

  const subscribe = useCallback((type: string, cb: (payload: unknown) => void) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(cb);
    const last = lastMsgRef.current.get(type);
    if (last !== undefined) cb(last);
    setRideDiagGauge("ws_listener_types", listenersRef.current.size);
    setRideDiagGauge(
      "ws_listener_count",
      Array.from(listenersRef.current.values()).reduce((sum, set) => sum + set.size, 0),
    );
    return () => {
      listenersRef.current.get(type)?.delete(cb);
      setRideDiagGauge(
        "ws_listener_count",
        Array.from(listenersRef.current.values()).reduce((sum, set) => sum + set.size, 0),
      );
    };
  }, []);

  const sendMessage = useCallback((msg: object): boolean => {
    const typed = msg as { type?: string; paused?: boolean; direction?: "up" | "down" };
    if (typed.type === "set_paused") {
      advanceClock();
      pausedRef.current = Boolean(typed.paused);
      recordRideDiag("lifecycle", "sim pause changed", { paused: pausedRef.current });
      return true;
    }
    if (typed.type === "gear_shift") {
      gearRef.current += typed.direction === "up" ? 1 : -1;
      gearRef.current = Math.max(1, Math.min(12, gearRef.current));
      return true;
    }
    if (typed.type === "end_ride") {
      advanceClock();
      endedRef.current = true;
      dispatch({
        type: "telemetry",
        route_id: SIM_ROUTE_ID,
        ride_session_id: SIM_SESSION_ID,
        speed_kmh: 0,
        power_w: 0,
        cadence_rpm: 0,
        gear: gearRef.current,
        real_grade_pct: 0,
        effective_grade_pct: 0,
        position_m: Math.min(route.total_dist_m, elapsedRef.current * BASE_SPEED_MPS),
        route_loaded: true,
        ride_phase: "done",
        elapsed_s: Math.round(elapsedRef.current),
        dist_remaining_m: 0,
        ended_reason: "user_ended",
      });
      return true;
    }
    return true;
  }, [advanceClock, dispatch, route.total_dist_m]);

  useEffect(() => {
    recordRideDiag("lifecycle", "ride simulator enabled", {
      durationMin: config.durationMin,
      telemetryHz: config.telemetryHz,
      routePoints: config.routePoints,
      speed: config.speed,
    });
    setRideDiagGauge("route_points", route.lats.length);
    setRideDiagGauge("sim_duration_min", config.durationMin);
    dispatch({ type: "kickr_status", connected: true });
    dispatch({ type: "click_status", connected: true });
    dispatch({
      type: "route_data",
      route_id: SIM_ROUTE_ID,
      ride_session_id: SIM_SESSION_ID,
      ...route,
    });

    lastClockMsRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tickMs = 1000 / config.telemetryHz;
    const timer = setInterval(() => {
      if (endedRef.current) return;
      advanceClock();
      const positionM = Math.min(route.total_dist_m, elapsedRef.current * BASE_SPEED_MPS);
      const progress = route.total_dist_m > 0 ? positionM / route.total_dist_m : 0;
      const idx = Math.min(route.grades_pct.length - 1, Math.max(0, Math.round(progress * (route.grades_pct.length - 1))));
      const grade = route.grades_pct[idx] ?? 0;
      const ghostDistM = Math.min(route.total_dist_m, Math.max(0, positionM + 45));
      const ghostIdx = Math.min(route.lats.length - 1, Math.max(0, Math.round((ghostDistM / route.total_dist_m) * (route.lats.length - 1))));
      const completed = elapsedRef.current >= config.durationMin * 60;
      if (completed) endedRef.current = true;
      setRideDiagGauge("ride_elapsed_s", Math.round(elapsedRef.current));
      dispatch({
        type: "telemetry",
        route_id: SIM_ROUTE_ID,
        ride_session_id: SIM_SESSION_ID,
        speed_kmh: pausedRef.current || completed ? 0 : BASE_SPEED_MPS * 3.6,
        power_w: pausedRef.current || completed ? 0 : Math.round(170 + grade * 9 + Math.sin(elapsedRef.current / 11) * 35),
        cadence_rpm: pausedRef.current || completed ? 0 : Math.round(86 + Math.sin(elapsedRef.current / 8) * 6),
        gear: gearRef.current,
        real_grade_pct: grade,
        effective_grade_pct: grade,
        position_m: positionM,
        route_loaded: true,
        ghost_lat: route.lats[ghostIdx],
        ghost_lng: route.lons[ghostIdx],
        ghost_bearing_deg: 38,
        ghost_time_gap_s: Math.round((ghostDistM - positionM) / BASE_SPEED_MPS),
        ghost_dist_m: ghostDistM,
        ride_phase: completed ? "done" : "route",
        lap_index: 0,
        lap_count: 1,
        target_power_w: null,
        target_cadence_rpm: null,
        erg_mode: false,
        phase_remaining_s: null,
        elapsed_s: Math.round(elapsedRef.current),
        dist_remaining_m: Math.max(0, route.total_dist_m - positionM),
        erg_change_countdown_s: null,
        ended_reason: completed ? "completed" : null,
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [advanceClock, config, dispatch, route]);

  return (
    <WSContext.Provider value={{ status, sendMessage, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}
