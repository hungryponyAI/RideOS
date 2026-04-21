import { memo } from "react";
import {
  AreaChart,
  Area,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ElevationChartDatum } from "../types/route";

interface ElevationProfileProps {
  data: ElevationChartDatum[] | null;
  positionM: number | null;
}

const EMPTY_DATA: ElevationChartDatum[] = [
  { dist: 0, elev: 0 },
  { dist: 1, elev: 0 },
];

export const ElevationProfile = memo(function ElevationProfile({
  data,
  positionM,
}: ElevationProfileProps) {
  const hasRoute = data !== null && data.length > 0;
  const chartData = hasRoute ? data : EMPTY_DATA;

  return (
    <div className="relative w-full h-full bg-[#111111]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          {hasRoute && (
            <defs>
              <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.3} />
              </linearGradient>
            </defs>
          )}
          <Area
            type="linear"
            dataKey="elev"
            stroke={hasRoute ? "#6B7280" : "#374151"}
            fill={hasRoute ? "url(#elevGrad)" : "#374151"}
            dot={false}
            isAnimationActive={false}
          />
          {hasRoute && positionM !== null && (
            <ReferenceLine
              x={positionM}
              stroke="#F59E0B"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {!hasRoute && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6B7280]">
          Keine Strecke geladen
        </span>
      )}
    </div>
  );
});
