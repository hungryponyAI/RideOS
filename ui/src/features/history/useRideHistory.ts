import { useState, useCallback, useEffect, useRef } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useWSSubscription } from "../../shared/ws/useWSSubscription";

export interface RideEntry {
  id: string;
  route_id: string | null;
  route_name: string | null;
  started_at: string;
  finished_at: string | null;
  duration_s: number | null;
  distance_m: number | null;
  avg_power_w: number | null;
  completed: boolean;
}

interface RideListMsg {
  rides: RideEntry[];
}

export function useRideHistory() {
  const { sendMessage, status } = useWS();
  const [rides, setRides] = useState<RideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!requestedRef.current && (status === "connected" || status === "live")) {
      requestedRef.current = true;
      sendMessage({ type: "list_rides" });
    }
  }, [status, sendMessage]);

  const handleRideList = useCallback((msg: RideListMsg) => {
    setRides(msg.rides);
    setLoading(false);
  }, []);

  useWSSubscription<RideListMsg>("ride_list", handleRideList);

  return { rides, loading };
}
