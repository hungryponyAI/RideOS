import { memo } from "react";

interface Props {
  value: string | number;
  unit: string;
  label?: string;
  note?: string;
  emphasis?: "primary" | "secondary";
  className?: string;
}

export const MetricTile = memo(function MetricTile({
  value,
  unit,
  label,
  note,
  emphasis = "secondary",
  className = "",
}: Props) {
  if (emphasis === "primary") {
    return (
      <div className={`flex flex-col leading-none ${className}`}>
        {label && (
          <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-1">
            {label}
          </span>
        )}
        <span className="font-data font-bold tabular-nums text-[var(--text)] text-[40px] sm:text-[44px] leading-none">
          {value}
        </span>
        <span className="font-sans font-medium text-[11px] uppercase tracking-wider text-[var(--text-muted)] mt-1">
          {unit}
        </span>
        {note && (
          <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--accent)] mt-1">
            {note}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col leading-none ${className}`}>
      {label && (
        <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-0.5">
          {label}
        </span>
      )}
      <span className="font-data font-bold tabular-nums text-[var(--text)] text-[30px] leading-none">
        {value}
      </span>
      <span className="font-sans font-medium text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
        {unit}
      </span>
      {note && (
        <span className="text-[9px] font-sans font-medium uppercase tracking-[0.15em] text-[var(--accent)] mt-0.5">
          {note}
        </span>
      )}
    </div>
  );
});
