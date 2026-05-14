import { useEffect, useRef, useState } from "react";

export function useClimbFocus(effectiveGradePct: number | null | undefined): boolean {
  const [climbFocus, setClimbFocus] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAbove = (effectiveGradePct ?? 0) >= 4;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isAbove) {
      timerRef.current = setTimeout(() => setClimbFocus(true), 10_000);
    } else {
      timerRef.current = setTimeout(() => setClimbFocus(false), 5_000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isAbove]);

  return climbFocus;
}
