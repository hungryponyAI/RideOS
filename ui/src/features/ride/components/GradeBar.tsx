import { memo } from "react";

interface Props {
  effective: number;
}

export const GradeBar = memo(function GradeBar({ effective }: Props) {
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const fmt = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

  return (
    <div className="flex items-center gap-4">
      <svg
        width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className="text-[var(--label-accent)] shrink-0"
        aria-hidden="true"
      >
        <polyline points="2,19 22,5"/>
        <polyline points="15,5 22,5 22,12"/>
        <line x1="2" y1="19" x2="22" y2="19" strokeOpacity="0.35"/>
      </svg>
      <span className="text-[32px] font-data font-bold text-[var(--text)] tabular-nums leading-none">
        {fmt(effective)}
      </span>
    </div>
  );
});
