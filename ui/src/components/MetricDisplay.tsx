import { memo } from "react";

interface Props {
  value: string | number;
  unit: string;
  size: "display" | "body";
}

export const MetricDisplay = memo(function MetricDisplay({ value, unit, size }: Props) {
  const valueClass = size === "display"
    ? "text-[72px] font-bold leading-none"
    : "text-[20px] font-normal leading-[1.4]";
  const unitClass = size === "display"
    ? "text-[20px] font-normal text-gray-500"
    : "text-[12px] font-normal text-gray-500";

  return (
    <div className="flex items-baseline gap-2">
      <span className={`${valueClass} text-gray-50 tabular-nums`}>
        {value}
      </span>
      <span className={unitClass}>{unit}</span>
    </div>
  );
});
