import { createContext } from "react";
import type { MotionMode } from "./types";

export interface MotionContextValue {
  motionMode: MotionMode;
  setMotionMode: (mode: MotionMode) => void;
  reducedMotion: boolean;
  effectiveMode: MotionMode;
}

export const MotionContext = createContext<MotionContextValue | null>(null);
