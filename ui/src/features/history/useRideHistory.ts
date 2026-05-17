import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useWSSubscription } from "../../shared/ws/useWSSubscription";
import { useOptionalProfileContext } from "../profiles/useProfileContext";

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

const CACHE_KEY = "rideos_ride_history";
const PROFILE_CACHE_PREFIX = "oudena_history";

function cacheKey(profileId?: string | null): string {
  return profileId ? `${PROFILE_CACHE_PREFIX}:${profileId}` : CACHE_KEY;
}

function readCache(key: string): RideEntry[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RideEntry[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, rides: RideEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rides));
  } catch {
    // Ignore local cache write failures; live ride data remains authoritative.
  }
}

export function useRideHistory() {
  const { sendMessage, status } = useWS();
  const profileContext = useOptionalProfileContext();
  const key = cacheKey(profileContext?.activeProfile?.id ?? null);
  const cached = useMemo(() => readCache(key), [key]);
  const [rides, setRides] = useState<RideEntry[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
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
    writeCache(key, msg.rides);
  }, [key]);

  useWSSubscription<RideListMsg>("ride_list", handleRideList);

  const deleteRide = useCallback((rideId: string) => {
    setRides(current => {
      const next = current.filter(ride => ride.id !== rideId);
      writeCache(key, next);
      return next;
    });
    sendMessage({ type: "delete_ride", ride_id: rideId });
  }, [key, sendMessage]);

  const deleteAllRides = useCallback(() => {
    setRides([]);
    writeCache(key, []);
    sendMessage({ type: "delete_all_rides" });
  }, [key, sendMessage]);

  return { rides, loading, deleteRide, deleteAllRides };
}
