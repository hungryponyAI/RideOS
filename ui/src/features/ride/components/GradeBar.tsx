import { memo } from "react";

interface Props {
  effective: number;
  highlight?: boolean;
}

export const GradeBar = memo(function GradeBar({ effective, highlight = false }: Props) {
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const fmt = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <svg
        width="22" height="22" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className="text-[var(--label-accent)] shrink-0"
        aria-hidden="true"
      >
        <polyline points="2,19 22,5"/>
        <polyline points="15,5 22,5 22,12"/>
        <line x1="2" y1="19" x2="22" y2="19" strokeOpacity="0.35"/>
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-0.5">
          Steigung
        </span>
        <span className={`text-[32px] font-data font-bold tabular-nums leading-none transition-colors duration-300 ${highlight ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
          {fmt(effective)}
        </span>
      </div>
    </div>
  );
});
