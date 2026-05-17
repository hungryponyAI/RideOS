import type { ReactNode } from "react";
import { useMotionMode } from "./useMotionMode";

export function ScreenTransition({
  children,
  transitionKey,
  className = "",
}: {
  children: ReactNode;
  transitionKey: string;
  className?: string;
}) {
  const { effectiveMode, reducedMotion } = useMotionMode();
  const motionClass = reducedMotion
    ? ""
    : effectiveMode === "cinematic"
      ? "animate-[oudena-screen-in_520ms_var(--ease-oudena)_both]"
      : "animate-[oudena-fade-in_180ms_ease-out_both]";

  return (
    <div key={transitionKey} className={`w-full h-full ${motionClass} ${className}`}>
      {children}
    </div>
  );
}
