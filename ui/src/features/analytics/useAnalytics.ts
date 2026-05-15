import { useState, useCallback, useEffect, useRef } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useWSSubscription } from "../../shared/ws/useWSSubscription";

export interface PowerTrendPoint {
  started_at: string;
  avg_power_w: number;
}

export interface AnalyticsOverview {
  total_rides: number;
  total_distance_m: number;
  total_duration_s: number;
  avg_power_w: number | null;
  rides_last_7_days: number;
  rides_last_30_days: number;
  power_trend: PowerTrendPoint[];
}

export function useAnalyticsOverview() {
  const { sendMessage, status } = useWS();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!requestedRef.current && (status === "connected" || status === "live")) {
      requestedRef.current = true;
      sendMessage({ type: "get_analytics_overview" });
    }
  }, [status, sendMessage]);

  const handleOverview = useCallback((msg: AnalyticsOverview) => {
    setOverview(msg);
    setLoading(false);
  }, []);

  useWSSubscription<AnalyticsOverview>("analytics_overview", handleOverview);

  return { overview, loading };
}
