export interface TelemetryState {
  speed_kmh: number;
  power_w: number;
  cadence_rpm: number;
  gear: number;
  real_grade_pct: number;
  effective_grade_pct: number;
  // Phase 4 additions (optional — present only when engine emits a telemetry message
  // with a live RouteTracker). Absent on legacy clients / pre-route-loaded state.
  position_m?: number | null;
  route_loaded?: boolean;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "live"
  | "disconnected"
  | "reconnecting";
