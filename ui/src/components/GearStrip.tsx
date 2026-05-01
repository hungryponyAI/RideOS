import { memo } from "react";

interface Props {
  gear: number | null;
}

export const GearStrip = memo(function GearStrip({ gear }: Props) {
  return (
    <div className="flex items-center gap-4">
      {/* Chainring / sprocket icon */}
      <svg
        width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        className="text-[var(--label-accent)] shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="3"/>
        {/* 6 spokes at 60° intervals */}
        <line x1="12"  y1="3"    x2="12"  y2="9"/>
        <line x1="19.8" y1="7.5"  x2="14.6" y2="10.5"/>
        <line x1="19.8" y1="16.5" x2="14.6" y2="13.5"/>
        <line x1="12"  y1="21"   x2="12"  y2="15"/>
        <line x1="4.2"  y1="16.5" x2="9.4"  y2="13.5"/>
        <line x1="4.2"  y1="7.5"  x2="9.4"  y2="10.5"/>
      </svg>
      <span className="text-[48px] font-data font-bold text-[var(--text)] tabular-nums leading-none">
        {gear ?? "–"}
      </span>
    </div>
  );
});
