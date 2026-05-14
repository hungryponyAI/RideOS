import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useRideTelemetry } from "./hooks/useRideTelemetry";
import { useRouteData } from "./hooks/useRouteData";
import { loadAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { ConnectionBanner } from "../../shared/ui/ConnectionBanner";
import { MetricDisplay } from "../../shared/ui/MetricDisplay";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap, type MapViewMode } from "./components/MiniMap";

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function PlayPauseOverlay({ isPaused, visible, onToggle }: { isPaused: boolean; visible: boolean; onToggle: () => void }) {
  return (
    <div className={`fixed inset-0 z-[1500] flex items-center justify-center transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      <button type="button" onClick={onToggle} aria-label={isPaused ? "Fahrt starten" : "Fahrt pausieren"} className="flex flex-col items-center gap-2 cursor-pointer group">
        <div className="w-20 h-20 rounded-full bg-black/60 border-2 border-white/40 flex items-center justify-center text-white group-hover:bg-black/80 group-hover:border-white/70 transition-all duration-150">
          {isPaused ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          )}
        </div>
        <span className="text-white/80 font-condensed font-bold text-[10px] tracking-widest uppercase">{isPaused ? "STARTEN" : "PAUSE"}</span>
      </button>
    </div>
  );
}

interface Props {
  isDark: boolean;
}

export function RideScreen({ isDark }: Props) {
  const { status, sendMessage } = useWS();
  const t = useRideTelemetry();
  const { routeRef, routeLoaded, routeError, clearRouteError } = useRouteData();

  const [isPaused, setIsPaused] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>("chase");
  const prevStatusRef = useRef(status);

  const togglePause = useCallback(() => {
    setIsPaused(p => {
      const next = !p;
      sendMessage({ type: "set_paused", paused: next });
      return next;
    });
  }, [sendMessage]);

  // Send athlete settings + initial paused state on (re)connect
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const nowActive = status === "connected" || status === "live";
    const wasActive = prev === "connected" || prev === "live";
    if (nowActive && !wasActive) {
      sendMessage({ type: "athlete_settings", ...loadAthleteSettings() });
      sendMessage({ type: "set_paused", paused: true });
    }
  }, [status, sendMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" || e.key === "J") sendMessage({ type: "gear_shift", direction: "down" });
      else if (e.key === "k" || e.key === "K") sendMessage({ type: "gear_shift", direction: "up" });
      else if (e.key === "m" || e.key === "M") setViewMode(m => m === "chase" ? "follow" : m === "follow" ? "birdseye" : "chase");
      else if (e.key === " ") { e.preventDefault(); togglePause(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendMessage, togglePause]);

  useEffect(() => {
    if (routeError) console.warn("[RideOS] route_error:", routeError);
  }, [routeError]);

  useEffect(() => {
    const onMove = () => {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    };
    window.addEventListener("mousemove", onMove);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const stored = routeLoaded ? routeRef.current : null;
  const positionM = t?.position_m ?? null;

  return (
    <div className="w-screen h-screen bg-[var(--bg)] overflow-hidden flex flex-col">
      <ConnectionBanner status={status} />
      {routeError && (
        <div className="bg-[#E10600] text-white text-[11px] font-condensed font-bold tracking-widest uppercase px-4 py-2 flex items-center justify-between">
          <span>STRECKE KONNTE NICHT GELADEN WERDEN: {routeError}</span>
          <button type="button" onClick={clearRouteError} className="ml-4 text-white font-bold cursor-pointer">✕</button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-[256px_1fr] min-h-0 overflow-hidden">
        <div className="flex flex-col gap-8 px-6 py-6 border-r border-[var(--border)] overflow-hidden">
          <MetricDisplay value={t?.speed_kmh?.toFixed(1) ?? "–"} unit="KM/H" size="display" />
          {!t?.erg_mode && <GearStrip gear={t?.gear ?? null} />}
          {!t?.erg_mode && <GradeBar effective={t?.effective_grade_pct ?? 0} />}
          {t?.lap_count != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)]">LAP</span>
              <span className="text-[16px] font-data font-bold tabular-nums text-[var(--text)]">{(t?.lap_index ?? 0) + 1}</span>
              <span className="text-[11px] font-condensed text-[var(--text-muted)]">/ {t.lap_count}</span>
            </div>
          )}
          <div className="flex flex-col gap-5 mt-auto">
            <div className="flex flex-col gap-0.5">
              <MetricDisplay value={t?.power_w ?? "–"} unit="WATT" size="body" />
              {t?.erg_mode && t?.target_power_w != null && <span className="text-[9px] font-condensed font-bold tracking-[0.15em] uppercase text-[var(--label-accent)]">ZIEL {Math.round(t.target_power_w)} W</span>}
            </div>
            <div className="flex flex-col gap-0.5">
              <MetricDisplay value={t?.cadence_rpm ?? "–"} unit="U/MIN" size="body" />
              {t?.erg_mode && t?.target_cadence_rpm != null && <span className="text-[9px] font-condensed font-bold tracking-[0.15em] uppercase text-[var(--label-accent)]">ZIEL {t.target_cadence_rpm} RPM</span>}
            </div>
          </div>
        </div>

        <div className="relative h-full overflow-hidden">
          <MiniMap coords={stored?.coords ?? null} cumDist={stored?.cumDist ?? null} positionM={positionM} isDark={isDark} viewMode={viewMode} ghostLat={t?.ghost_lat ?? null} ghostLng={t?.ghost_lng ?? null} ghostBearingDeg={t?.ghost_bearing_deg ?? null} />

          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 flex-wrap">
            {t?.ghost_time_gap_s != null && (
              <div className="bg-black/70 text-white px-2 py-1 text-[10px] font-bold font-condensed tracking-widest">
                {t.ghost_time_gap_s > 0 ? `+${Math.round(t.ghost_time_gap_s)}s` : `${Math.round(t.ghost_time_gap_s)}s`}
              </div>
            )}
            {t?.elapsed_s != null && <div className="bg-black/70 text-white/90 px-2 py-1 text-[10px] font-condensed font-bold tracking-widest tabular-nums">{formatTime(t.elapsed_s)}</div>}
            {t?.dist_remaining_m != null && <div className="bg-black/70 text-white/90 px-2 py-1 text-[10px] font-condensed font-bold tracking-widest tabular-nums">{(t.dist_remaining_m / 1000).toFixed(1)} KM</div>}
          </div>

          {(t?.ride_phase === "warmup" || t?.ride_phase === "cooldown") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/80 border border-[#FFF200] px-4 py-2">
              <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[#FFF200]">{t.ride_phase === "warmup" ? "WARM-UP" : "COOL-DOWN"}</span>
              <span className="text-[11px] font-condensed text-[var(--text-muted)]">{t.target_power_w != null ? `${Math.round(t.target_power_w)} W` : "90 W"}</span>
              {t.phase_remaining_s != null && <span className="text-[11px] font-data font-bold tabular-nums text-white">{formatTime(t.phase_remaining_s)}</span>}
            </div>
          )}

          {t?.erg_mode && t?.erg_change_countdown_s != null && t.erg_change_countdown_s <= 10 && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-[#FFF200] text-black px-3 py-1.5">
              <span className="text-[10px] font-condensed font-bold tracking-widest uppercase">ERG WECHSEL IN</span>
              <span className="text-[13px] font-data font-bold tabular-nums">{Math.ceil(t.erg_change_countdown_s)}s</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-[140px] shrink-0">
        <ElevationProfile data={stored?.elevationChart ?? null} positionM={positionM} />
      </div>

      <PlayPauseOverlay isPaused={isPaused} visible={showControls} onToggle={togglePause} />
    </div>
  );
}
