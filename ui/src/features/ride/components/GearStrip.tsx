import { useEffect, useRef, useState } from "react";
import type { ShiftMode } from "../../settings/hooks/useAppSettings";

interface Props {
  gear: number | null;
  shiftMode?: ShiftMode;
  lastAutoShiftAt?: number | null;
}

export function GearStrip({ gear, shiftMode = "manual", lastAutoShiftAt }: Props) {
  const [flash, setFlash] = useState(false);
  const [autoBadge, setAutoBadge] = useState<"up" | "down" | null>(null);
  const prevAutoShiftAtRef = useRef<number | null | undefined>(undefined);
  const prevGearRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevAutoShiftAtRef.current;
    prevAutoShiftAtRef.current = lastAutoShiftAt;
    if (prev === undefined) return;
    if (lastAutoShiftAt == null || lastAutoShiftAt === prev) return;

    const dir = gear != null && prevGearRef.current != null
      ? (gear > prevGearRef.current ? "up" : "down")
      : null;

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);

    setFlash(true);
    setAutoBadge(dir);
    flashTimerRef.current = setTimeout(() => setFlash(false), 600);
    badgeTimerRef.current = setTimeout(() => setAutoBadge(null), 1000);
  }, [lastAutoShiftAt, gear]);

  useEffect(() => {
    prevGearRef.current = gear;
  }, [gear]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
  }, []);

  if (shiftMode === "cassette") {
    return (
      <div className="flex items-center gap-3 min-w-0">
        <svg
          width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className="text-[var(--label-accent)] shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12"  y1="3"    x2="12"  y2="9"/>
          <line x1="19.8" y1="7.5"  x2="14.6" y2="10.5"/>
          <line x1="19.8" y1="16.5" x2="14.6" y2="13.5"/>
          <line x1="12"  y1="21"   x2="12"  y2="15"/>
          <line x1="4.2"  y1="16.5" x2="9.4"  y2="13.5"/>
          <line x1="4.2"  y1="7.5"  x2="9.4"  y2="10.5"/>
        </svg>
        <div className="flex flex-col leading-none">
          <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-0.5">
            Gang
          </span>
          <span className="text-[14px] font-sans font-medium text-[var(--text-muted)] leading-none">
            Mechanisch
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0 relative">
      <svg
        width="22" height="22" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        className="text-[var(--label-accent)] shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="3"/>
        <line x1="12"  y1="3"    x2="12"  y2="9"/>
        <line x1="19.8" y1="7.5"  x2="14.6" y2="10.5"/>
        <line x1="19.8" y1="16.5" x2="14.6" y2="13.5"/>
        <line x1="12"  y1="21"   x2="12"  y2="15"/>
        <line x1="4.2"  y1="16.5" x2="9.4"  y2="13.5"/>
        <line x1="4.2"  y1="7.5"  x2="9.4"  y2="10.5"/>
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-0.5">
          Gang
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[32px] font-data font-bold tabular-nums leading-none transition-colors duration-150 ${flash ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
          >
            {gear ?? "–"}
          </span>
          {autoBadge && (
            <span className="text-[9px] font-medium font-sans text-[var(--accent)] uppercase tracking-wide leading-none animate-fade-in">
              AUTO {autoBadge === "up" ? "↑" : "↓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
