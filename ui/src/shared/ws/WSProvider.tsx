import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WSContext } from "./WSContext";
import type { ConnectionStatus } from "../types/telemetry";

const WS_URL = "ws://localhost:8765";

export function WSProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());

  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const subscribe = useCallback((type: string, cb: (payload: unknown) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(cb);
    return () => {
      listenersRef.current.get(type)?.delete(cb);
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
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;
      const listeners = listenersRef.current.get(msg.type);
      if (listeners) {
        listeners.forEach((cb) => cb(msg));
      }
    };

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

  return (
    <WSContext.Provider value={{ status, sendMessage, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}
