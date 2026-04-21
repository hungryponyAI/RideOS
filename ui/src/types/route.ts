import type { TelemetryState } from "./telemetry";

// ---------------------------------------------------------------------------
// Inbound (engine → UI) — discriminated by `type` field
// ---------------------------------------------------------------------------

export interface TelemetryMessage extends TelemetryState {
  type: "telemetry";
  position_m: number | null;
  route_loaded: boolean;
}

export interface RouteDataMessage {
  type: "route_data";
  lats: number[];
  lons: number[];
  elevations_m: number[];
  cum_dist_m: number[];
  grades_pct: number[];
  total_dist_m: number;
}

export interface RouteErrorMessage {
  type: "route_error";
  message: string;
}

export type IncomingMessage =
  | TelemetryMessage
  | RouteDataMessage
  | RouteErrorMessage;

// ---------------------------------------------------------------------------
// Outbound (UI → engine)
// ---------------------------------------------------------------------------

export interface GearShiftMessage {
  type: "gear_shift";
  direction: "up" | "down";
}

export interface LoadRouteMessage {
  type: "load_route";
  path: string;
}

export type OutgoingMessage = GearShiftMessage | LoadRouteMessage;

// ---------------------------------------------------------------------------
// Convenience type for UI consumers: pre-mapped elevation-chart data
// (derived once from RouteDataMessage; stored in useRef)
// ---------------------------------------------------------------------------

export interface ElevationChartDatum {
  dist: number;   // cum_dist_m[i]
  elev: number;   // elevations_m[i]
}

export interface StoredRoute {
  coords: Array<[number, number]>;      // [[lat, lon], ...]
  elevationChart: ElevationChartDatum[];
  cumDist: number[];
  totalDistM: number;
}
