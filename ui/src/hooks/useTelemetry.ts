import { useEffect, useRef, useState, useCallback } from "react";
import type { TelemetryState, ConnectionStatus } from "../types/telemetry";

const WS_URL = "ws://localhost:8765";

export function useTelemetry() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("live");
      retryCountRef.current = 0;
    };
    ws.onmessage = (e) => setTelemetry(JSON.parse(e.data));
    ws.onclose = () => {
      setStatus("disconnected");
      const delay = Math.min(30000, 2000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      retryRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return { telemetry, status };
}
