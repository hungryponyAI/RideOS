import { memo } from "react";

interface Props {
  value: string | number;
  unit: string;
  size: "display" | "body";
}

export const MetricDisplay = memo(function MetricDisplay({ value, unit, size }: Props) {
  if (size === "display") {
    return (
      <div className="flex flex-col items-start leading-none">
        <span className="text-[clamp(64px,8vw,120px)] font-data font-bold text-[var(--text)] tabular-nums leading-none">
          {value}
        </span>
        <span className="text-[18px] font-condensed font-bold uppercase tracking-widest text-[var(--label-accent)] mt-1">
          {unit}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start leading-none">
      <span className="text-[28px] font-data font-bold text-[var(--text)] tabular-nums leading-none">
        {value}
      </span>
      <span className="text-[11px] font-condensed font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
        {unit}
      </span>
    </div>
  );
});
