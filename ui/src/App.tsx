import { useEffect, useState } from "react";
import { useTelemetry } from "./hooks/useTelemetry";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { MetricDisplay } from "./components/MetricDisplay";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap } from "./components/MiniMap";
import { PreRideScreen } from "./components/PreRideScreen";

function App() {
  const { telemetry: t, status, sendMessage, routeRef, routeLoaded, routeError, clearRouteError } =
    useTelemetry();
  const [started, setStarted] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" || e.key === "J") {
        sendMessage({ type: "gear_shift", direction: "down" });
      } else if (e.key === "k" || e.key === "K") {
        sendMessage({ type: "gear_shift", direction: "up" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendMessage]);

  useEffect(() => {
    if (routeError) {
      console.warn("[RideOS] route_error:", routeError);
    }
  }, [routeError]);

  if (!started) {
    return (
      <PreRideScreen
        onStarted={() => setStarted(true)}
        sendMessage={sendMessage}
      />
    );
  }

  // routeRef is a ref — reading .current is OK here; routeLoaded boolean triggers the re-render
  // when it flips from false→true, at which point routeRef.current has been populated.
  const stored = routeLoaded ? routeRef.current : null;
  const positionM = t?.position_m ?? null;

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-col">
      <ConnectionBanner status={status} />
      {routeError && (
        <div className="bg-[#7F1D1D] text-[#FCA5A5] text-[12px] px-4 py-2 flex items-center justify-between">
          <span>Strecke konnte nicht geladen werden: {routeError}</span>
          <button type="button" onClick={clearRouteError} className="ml-4 text-[#FCA5A5] font-bold">✕</button>
        </div>
      )}
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
        <MiniMap
          coords={stored?.coords ?? null}
          cumDist={stored?.cumDist ?? null}
          positionM={positionM}
        />
      </div>
      <div className="h-[120px] shrink-0">
        <ElevationProfile
          data={stored?.elevationChart ?? null}
          positionM={positionM}
        />
      </div>
    </div>
  );
}

export default App;
