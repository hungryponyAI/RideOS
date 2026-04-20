import { useTelemetry } from "./hooks/useTelemetry";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { MetricDisplay } from "./components/MetricDisplay";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap } from "./components/MiniMap";

function App() {
  const { telemetry: t, status } = useTelemetry();

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-col">
      <ConnectionBanner status={status} />
      <div className="flex-1 grid grid-cols-[1fr_auto] p-6 gap-8 min-h-0">
        <div className="flex flex-col gap-8">
          <MetricDisplay
            value={t?.speed_kmh?.toFixed(1) ?? "\u2014"}
            unit="km/h"
            size="display"
          />
          <GearStrip gear={t?.gear ?? null} />
          <div className="flex gap-8">
            <MetricDisplay
              value={t?.power_w ?? "\u2014"}
              unit="Watt"
              size="body"
            />
            <MetricDisplay
              value={t?.cadence_rpm ?? "\u2014"}
              unit="U/min"
              size="body"
            />
          </div>
          <GradeBar
            real={t?.real_grade_pct ?? 0}
            effective={t?.effective_grade_pct ?? 0}
          />
        </div>
        <MiniMap />
      </div>
      <div className="h-[120px] shrink-0">
        <ElevationProfile />
      </div>
    </div>
  );
}

export default App;
