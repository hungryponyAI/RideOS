import { useCallback, useEffect, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { TelemetryState } from "../../../shared/types/telemetry";
import type { TelemetryMessage } from "../../../shared/types/route";

export function useRideTelemetry(expectedRouteId?: string | null, expectedRideSessionId?: string | null): TelemetryState | null {
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);

  useEffect(() => {
    setTelemetry(null);
  }, [expectedRouteId, expectedRideSessionId]);

  useWSSubscription<TelemetryMessage>("telemetry", useCallback((msg) => {
    if (expectedRideSessionId && msg.ride_session_id !== expectedRideSessionId) return;
    if (expectedRouteId && msg.route_id !== expectedRouteId) return;
    setTelemetry(msg);
  }, [expectedRouteId, expectedRideSessionId]));

  return telemetry;
}
