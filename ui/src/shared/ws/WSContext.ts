import { createContext } from "react";
import type { ConnectionStatus } from "../types/telemetry";

export interface WSContextValue {
  status: ConnectionStatus;
  sendMessage: (msg: object) => boolean;
  subscribe: (type: string, cb: (payload: unknown) => void) => () => void;
}

export const WSContext = createContext<WSContextValue | null>(null);
