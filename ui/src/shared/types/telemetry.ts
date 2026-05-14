export interface TelemetryState {
  speed_kmh: number;
  power_w: number;
  cadence_rpm: number;
  gear: number;
  real_grade_pct: number;
  effective_grade_pct: number;
  position_m?: number | null;
  route_loaded?: boolean;
  ghost_lat?: number | null;
  ghost_lng?: number | null;
  ghost_bearing_deg?: number | null;
  ghost_time_gap_s?: number | null;
  ride_phase?: "warmup" | "route" | "cooldown" | "done";
  lap_index?: number;
  lap_count?: number;
  target_power_w?: number | null;
  target_cadence_rpm?: number | null;
  erg_mode?: boolean;
  erg_change_countdown_s?: number | null;
  phase_remaining_s?: number | null;
  elapsed_s?: number | null;
  dist_remaining_m?: number | null;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "live"
  | "disconnected"
  | "reconnecting";
