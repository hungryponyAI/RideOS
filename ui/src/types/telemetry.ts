export interface TelemetryState {
  speed_kmh: number;
  power_w: number;
  cadence_rpm: number;
  gear: number;
  real_grade_pct: number;
  effective_grade_pct: number;
}

export type ConnectionStatus = "connecting" | "connected" | "live" | "disconnected" | "reconnecting";
