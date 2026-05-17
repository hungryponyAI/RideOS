import { useContext } from "react";
import { MotionContext } from "./MotionContext";

export function useMotionMode() {
  const value = useContext(MotionContext);
  if (!value) throw new Error("useMotionMode must be used within MotionProvider");
  return value;
}
