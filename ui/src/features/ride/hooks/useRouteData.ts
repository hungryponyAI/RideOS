import { useCallback, useRef, useState } from "react";
import { useWSSubscription } from "../../../shared/ws/useWSSubscription";
import type { RouteDataMessage, RouteErrorMessage, StoredRoute } from "../../../shared/types/route";

export function useRouteData() {
  // Stored in ref to avoid re-renders at 4 Hz during rides.
  const routeRef = useRef<StoredRoute | null>(null);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useWSSubscription<RouteDataMessage>("route_data", useCallback((msg) => {
    const coords: Array<[number, number]> = msg.lats.map(
      (lat, i) => [lat, msg.lons[i]] as [number, number],
    );
    routeRef.current = {
      coords,
      elevationChart: msg.cum_dist_m.map((d, i) => ({ dist: d, elev: msg.elevations_m[i] })),
      cumDist: msg.cum_dist_m,
      totalDistM: msg.total_dist_m,
      gradesPct: msg.grades_pct,
    };
    setRouteLoaded(true);
    setRouteError(null);
  }, []));

  useWSSubscription<RouteErrorMessage>("route_error", useCallback((msg) => {
    routeRef.current = null;
    setRouteLoaded(false);
    setRouteError(msg.message);
  }, []));

  const clearRouteError = useCallback(() => setRouteError(null), []);

  return { routeRef, routeLoaded, routeError, clearRouteError };
}
