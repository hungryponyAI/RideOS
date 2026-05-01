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

export interface ClickStatusMessage {
  type: "click_status";
  connected: boolean;
}

export interface KickrStatusMessage {
  type: "kickr_status";
  connected: boolean;
}

// --- Route library types ---

export interface RouteLibraryEntry {
  id: string;
  name: string;
  filename: string;
  added_at: string;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  elevation_thumbnail: number[];
  best_time_s: number | null;
  ride_count: number;
}

export interface RouteLibraryMessage {
  type: "route_library";
  routes: RouteLibraryEntry[];
}

export interface LoadSavedRouteMessage {
  type: "load_saved_route";
  route_id: string;
}

export interface DeleteRouteMessage {
  type: "delete_route";
  route_id: string;
}

export interface RenameRouteMessage {
  type: "rename_route";
  route_id: string;
  name: string;
}

export type IncomingMessage =
  | TelemetryMessage
  | RouteDataMessage
  | RouteErrorMessage
  | ClickStatusMessage
  | KickrStatusMessage
  | RouteLibraryMessage;

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

export interface AthleteSettingsMessage {
  type: "athlete_settings";
  weight_kg: number;
  height_cm: number;
  ftp_w: number;
}

export type OutgoingMessage =
  | GearShiftMessage
  | LoadRouteMessage
  | AthleteSettingsMessage
  | LoadSavedRouteMessage
  | DeleteRouteMessage
  | RenameRouteMessage;

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
