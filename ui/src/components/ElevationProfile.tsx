import { memo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const EMPTY_DATA = [{ x: 0, y: 0 }, { x: 1, y: 0 }];

export const ElevationProfile = memo(function ElevationProfile() {
  return (
    <div className="relative w-full h-full bg-[#111111]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={EMPTY_DATA}>
          <Area
            type="linear"
            dataKey="y"
            stroke="#374151"
            fill="#374151"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6B7280]">
        Keine Strecke geladen
      </span>
    </div>
  );
});
