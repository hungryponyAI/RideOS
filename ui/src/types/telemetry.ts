export interface TelemetryState {
  speed_kmh: number;
  power_w: number;
  cadence_rpm: number;
  gear: number;
  real_grade_pct: number;
  effective_grade_pct: number;
  // Phase 4: position along the route (null when no route loaded)
  position_m?: number | null;
  route_loaded?: boolean;
  // Ghost ride fields (null when no ghost active)
  ghost_lat?: number | null;
  ghost_lng?: number | null;
  ghost_bearing_deg?: number | null;
  ghost_time_gap_s?: number | null;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "live"
  | "disconnected"
  | "reconnecting";
