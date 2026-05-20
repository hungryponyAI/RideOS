import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WSContext } from "./WSContext";
import type { ConnectionStatus } from "../types/telemetry";
import {
  incrementRideDiagCounter,
  setRideDiagGauge,
} from "../diagnostics/rideDiagnostics";

const WS_URL = "ws://localhost:8765";

export function WSProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const lastMsgRef = useRef<Map<string, unknown>>(new Map());
  const disposedRef = useRef(false);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const subscribe = useCallback((type: string, cb: (payload: unknown) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(cb);
    setRideDiagGauge("ws_listener_types", listenersRef.current.size);
    setRideDiagGauge(
      "ws_listener_count",
      Array.from(listenersRef.current.values()).reduce((sum, set) => sum + set.size, 0),
    );
    // Replay last known message so late-mounting components get current state
    const last = lastMsgRef.current.get(type);
    if (last !== undefined) {
      try {
        cb(last);
      } catch (error) {
        console.error("[RideOS] WS subscriber failed during replay", error);
      }
    }
    return () => {
      listenersRef.current.get(type)?.delete(cb);
      setRideDiagGauge(
        "ws_listener_count",
        Array.from(listenersRef.current.values()).reduce((sum, set) => sum + set.size, 0),
      );
    };
  }, []);

  const sendMessage = useCallback((msg: object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
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
      incrementRideDiagCounter("ws_messages");
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;
      incrementRideDiagCounter(`ws_${msg.type}`);
      lastMsgRef.current.set(msg.type, msg);
      const listeners = listenersRef.current.get(msg.type);
      if (listeners) {
        listeners.forEach((cb) => {
          try {
            cb(msg);
          } catch (error) {
            console.error("[RideOS] WS subscriber failed", error);
          }
        });
      }
    };

    ws.onclose = () => {
      if (disposedRef.current) return;
      setStatus("disconnected");
      const delay = Math.min(30000, 2000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      retryRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = null;
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WSContext.Provider value={{ status, sendMessage, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}
