import { useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { TelemetryState } from "../../../shared/types/telemetry";
import type { TelemetryMessage } from "../../../shared/types/route";

export function useRideTelemetry(): TelemetryState | null {
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);
  useWSSubscription<TelemetryMessage>("telemetry", (msg) => setTelemetry(msg));
  return telemetry;
}
