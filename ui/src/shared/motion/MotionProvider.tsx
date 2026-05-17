import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MotionContext, type MotionContextValue } from "./MotionContext";
import type { MotionMode } from "./types";

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MotionProvider({
  children,
  defaultMode = "cinematic",
}: {
  children: ReactNode;
  defaultMode?: MotionMode;
}) {
  const [motionMode, setMotionMode] = useState<MotionMode>(defaultMode);
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(query.matches);
    handleChange();
    query.addEventListener?.("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }, []);

  const value = useMemo<MotionContextValue>(() => ({
    motionMode,
    setMotionMode,
    reducedMotion,
    effectiveMode: reducedMotion ? "subtle" : motionMode,
  }), [motionMode, reducedMotion]);

  return (
    <MotionContext.Provider value={value}>
      {children}
    </MotionContext.Provider>
  );
}
