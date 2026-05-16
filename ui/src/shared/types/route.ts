import type { TelemetryState } from "./telemetry";

// ---------------------------------------------------------------------------
// Inbound (engine → UI)
// ---------------------------------------------------------------------------

export interface TelemetryMessage extends TelemetryState {
  type: "telemetry";
  route_id?: string | null;
  ride_session_id?: string | null;
  position_m: number | null;
  route_loaded: boolean;
}

export interface RouteDataMessage {
  type: "route_data";
  route_id?: string | null;
  ride_session_id?: string | null;
  lats: number[];
  lons: number[];
  elevations_m: number[];
  cum_dist_m: number[];
  grades_pct: number[];
  total_dist_m: number;
}

export interface RouteErrorMessage {
  type: "route_error";
  ride_session_id?: string | null;
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
  strava_id: string | null;
  sport_type: string | null;
  activity_date: string | null;
  moving_time_s: number | null;
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

export interface StravaStatusMessage {
  type: "strava_status";
  connected: boolean;
  athlete_name: string | null;
  syncing: boolean;
}

export interface StravaAuthUrlMessage {
  type: "strava_auth_url";
  url: string;
}

export interface StravaErrorMessage {
  type: "strava_error";
  message: string;
}

export interface RoutePreviewMessage {
  type: "route_preview";
  route_id: string;
  lats: number[];
  lons: number[];
}

export type IncomingMessage =
  | TelemetryMessage
  | RouteDataMessage
  | RouteErrorMessage
  | ClickStatusMessage
  | KickrStatusMessage
  | RouteLibraryMessage
  | RoutePreviewMessage
  | StravaStatusMessage
  | StravaAuthUrlMessage
  | StravaErrorMessage;

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

export interface StartRideMessage {
  type: "start_ride";
  route_id: string;
  ride_session_id?: string;
  reverse: boolean;
  cutout_start_m: number | null;
  cutout_end_m: number | null;
  laps: number;
  ghost: boolean;
  warmup_s: number;
  cooldown_s: number;
  erg_mode: boolean;
  physics_mode: boolean;
  paused?: boolean;
}

export interface PreviewRouteOutMessage {
  type: "preview_route";
  route_id: string;
}

export type OutgoingMessage =
  | GearShiftMessage
  | LoadRouteMessage
  | AthleteSettingsMessage
  | LoadSavedRouteMessage
  | DeleteRouteMessage
  | RenameRouteMessage
  | StartRideMessage
  | PreviewRouteOutMessage;

export interface ElevationChartDatum {
  dist: number;
  elev: number;
}

export interface StoredRoute {
  routeId: string | null;
  rideSessionId: string | null;
  coords: Array<[number, number]>;
  elevationChart: ElevationChartDatum[];
  cumDist: number[];
  totalDistM: number;
  gradesPct: number[];
}
