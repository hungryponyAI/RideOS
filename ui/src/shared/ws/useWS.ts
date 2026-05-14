import { useContext } from "react";
import { WSContext, type WSContextValue } from "./WSContext";

export function useWS(): WSContextValue {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used inside WSProvider");
  return ctx;
}
