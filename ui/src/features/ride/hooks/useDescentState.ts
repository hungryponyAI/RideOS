import { useEffect, useRef, useState } from "react";

export function useDescentState(effectiveGradePct: number | null | undefined): boolean {
  const [descending, setDescending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBelow = (effectiveGradePct ?? 0) <= -3;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isBelow) {
      timerRef.current = setTimeout(() => setDescending(true), 5_000);
    } else {
      timerRef.current = setTimeout(() => setDescending(false), 3_000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isBelow]);

  return descending;
}
