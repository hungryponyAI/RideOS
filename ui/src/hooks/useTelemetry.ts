import { useEffect, useRef, useState, useCallback } from "react";
import type { TelemetryState, ConnectionStatus } from "../types/telemetry";
import type {
  IncomingMessage,
  OutgoingMessage,
  StoredRoute,
  RouteLibraryEntry,
} from "../types/route";

const WS_URL = "ws://localhost:8765";

export interface StravaStatus {
  connected: boolean;
  athleteName: string | null;
  syncing: boolean;
}

export function useTelemetry() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // Route data lives in a ref (NOT state) — full arrays would trigger re-renders at 4 Hz.
  // See 04-CONTEXT.md "WebSocket Route Data Strategy" + UI-SPEC §"Phase 4 Specific Constraints".
  const routeRef = useRef<StoredRoute | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [routeLoaded, setRouteLoaded] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [clickConnected, setClickConnected] = useState<boolean>(false);
  const [kickrConnected, setKickrConnected] = useState<boolean>(false);
  const [routeLibrary, setRouteLibrary] = useState<RouteLibraryEntry[]>([]);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [stravaAuthUrl, setStravaAuthUrl] = useState<string | null>(null);
  const [stravaError, setStravaError] = useState<string | null>(null);

  const clearRouteError = useCallback(() => setRouteError(null), []);
  const clearStravaAuthUrl = useCallback(() => setStravaAuthUrl(null), []);
  const clearStravaError = useCallback(() => setStravaError(null), []);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("connected");
      retryCountRef.current = 0;
      ws.send(JSON.stringify({ type: "list_routes" }));
    };
    ws.onmessage = (e) => {
      setStatus("live");
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(e.data) as IncomingMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return;
      }
      switch (msg.type) {
        case "telemetry": {
          setTelemetry(msg);
          if (msg.route_loaded) setRouteLoaded(true);
          break;
        }
        case "route_data": {
          const coords: Array<[number, number]> = msg.lats.map(
            (lat, i) => [lat, msg.lons[i]] as [number, number],
          );
          const elevationChart = msg.cum_dist_m.map((d, i) => ({
            dist: d,
            elev: msg.elevations_m[i],
          }));
          routeRef.current = {
            coords,
            elevationChart,
            cumDist: msg.cum_dist_m,
            totalDistM: msg.total_dist_m,
          };
          setRouteLoaded(true);
          setRouteError(null);
          break;
        }
        case "route_error": {
          setRouteError(msg.message);
          routeRef.current = null;
          setRouteLoaded(false);
          break;
        }
        case "click_status": {
          setClickConnected(msg.connected);
          break;
        }
        case "kickr_status": {
          setKickrConnected(msg.connected);
          break;
        }
        case "route_library": {
          setRouteLibrary(msg.routes);
          break;
        }
        case "strava_status": {
          setStravaStatus({
            connected: msg.connected,
            athleteName: msg.athlete_name,
            syncing: msg.syncing,
          });
          break;
        }
        case "strava_auth_url": {
          setStravaAuthUrl(msg.url);
          break;
        }
        case "strava_error": {
          setStravaError(msg.message);
          break;
        }
        default:
          // Unknown message type — ignore silently to stay forward-compatible.
          break;
      }
    };
    ws.onclose = () => {
      setStatus("disconnected");
      const delay = Math.min(30000, 2000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      retryRef.current = setTimeout(connect, delay);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback((msg: OutgoingMessage | object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return {
    telemetry,
    status,
    sendMessage,
    routeRef,
    routeLoaded,
    routeError,
    clearRouteError,
    clickConnected,
    kickrConnected,
    routeLibrary,
    stravaStatus,
    stravaAuthUrl,
    clearStravaAuthUrl,
    stravaError,
    clearStravaError,
  };
}
