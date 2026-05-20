import { memo } from "react";

interface Props {
  gradePct: number;
  highlight?: boolean;
}

export const GradeBar = memo(function GradeBar({ gradePct, highlight = false }: Props) {
  const sign = (v: number) => (v >= 0 ? "+" : "−");
  const fmt = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

  return (
    <div className="flex flex-col leading-none">
      <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-0.5">
        Steigung
      </span>
      <span className={`whitespace-nowrap text-[32px] font-data font-bold tabular-nums leading-none transition-colors duration-300 ${highlight ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {fmt(gradePct)}
      </span>
    </div>
  );
});
