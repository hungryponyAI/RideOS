import { memo } from "react";

interface Props {
  real: number;
  effective: number;
}

export const GradeBar = memo(function GradeBar({ real, effective }: Props) {
  // Color: red-500 for climb (>0), blue-500 for descent (<0), gray-700 for flat (0)
  const fillColor =
    effective > 0 ? "bg-red-500" : effective < 0 ? "bg-blue-500" : "bg-gray-700";

  // Normalize to bar width: +-20% maps to 0-100% of half-width
  const maxGrade = 20;
  const clampedEffective = Math.max(-maxGrade, Math.min(maxGrade, effective));
  const barWidthPercent = Math.abs(clampedEffective / maxGrade) * 50;
  const barLeft = effective >= 0 ? 50 : 50 - barWidthPercent;

  const clampedReal = Math.max(-maxGrade, Math.min(maxGrade, real));
  const realPos = 50 + (clampedReal / maxGrade) * 50;

  // Format with comma as decimal separator (German locale)
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");
  const fmt = (v: number) => `${sign(v)}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

  return (
    <div className="px-6">
      <div className="relative w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        {/* Effective grade fill */}
        <div
          className={`absolute top-0 h-full ${fillColor}`}
          style={{ left: `${barLeft}%`, width: `${barWidthPercent}%` }}
        />
        {/* Real grade marker — 2px line */}
        <div
          className="absolute top-0 h-full w-[2px] bg-gray-600"
          style={{ left: `${realPos}%` }}
        />
      </div>
      <span className="text-[12px] text-gray-500 mt-1 block">
        {fmt(real)} / effektiv {fmt(effective)}
      </span>
    </div>
  );
});
