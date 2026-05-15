import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useRideTelemetry } from "./hooks/useRideTelemetry";
import { useClimbFocus } from "./hooks/useClimbFocus";
import { useDescentState } from "./hooks/useDescentState";
import { useRouteData } from "./hooks/useRouteData";
import { loadAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { ConnectionBanner } from "../../shared/ui/ConnectionBanner";
import { HudPanel } from "../../shared/ui/HudPanel";
import { MetricTile } from "../../shared/ui/MetricTile";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap, type MapViewMode } from "./components/MiniMap";
import { RideControls } from "./components/RideControls";

export interface RideSummaryData {
  elapsed_s: number | null;
  reason: "completed" | "user_ended";
  route_name?: string | null;
  route_id?: string | null;
  distance_m?: number | null;
  ghost_time_gap_s?: number | null;
}

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function EndRideConfirmation({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Fahrt beenden bestätigen">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-elevated px-8 py-6 flex flex-col items-center gap-4 min-w-[240px]">
        <span className="text-[13px] font-medium text-[var(--text)]">Fahrt beenden?</span>
        <span className="text-[11px] text-[var(--text-muted)] text-center">Die Fahrt wird gestoppt und gespeichert.</span>
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl border border-[var(--border)] text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="end-ride-confirm"
            className="flex-1 min-h-[44px] rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[12px] font-medium text-[var(--text)] hover:border-[var(--accent)] transition-colors duration-150 cursor-pointer"
          >
            Beenden
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  isDark: boolean;
  onRideEnded?: (data: RideSummaryData) => void;
}

export function RideScreen({ isDark, onRideEnded }: Props) {
  const { status, sendMessage } = useWS();
  const t = useRideTelemetry();
  const { routeRef, routeLoaded, routeError, clearRouteError } = useRouteData();
  const isClimbFocus = useClimbFocus(t?.effective_grade_pct);
  const isDescending = useDescentState(t?.effective_grade_pct);

  const [isPaused, setIsPaused] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>("chase");
  const prevStatusRef = useRef<typeof status>("connecting");
  const endedRef = useRef(false);

  // Ghost trend tracking
  const prevGhostGapRef = useRef<number | null>(null);
  const ghostGap = t?.ghost_time_gap_s ?? null;
  const prevGap = prevGhostGapRef.current;
  const ghostTrend = ghostGap != null && prevGap != null
    ? ghostGap < prevGap ? "closing" : ghostGap > prevGap ? "losing" : "neutral"
    : null;

  useEffect(() => {
    prevGhostGapRef.current = ghostGap;
  }, [ghostGap]);

  const ghostColor = ghostGap == null
    ? "text-[var(--text)]"
    : ghostGap < 0
      ? "text-[var(--success)]"
      : ghostTrend === "closing"
        ? "text-[var(--accent)]"
        : ghostTrend === "losing"
          ? "text-[var(--warning)]"
          : "text-[var(--text)]";

  // Aria-live announcement tracking
  const prevPausedAnnounceRef = useRef<boolean | null>(null);
  const prevCompletedAnnounceRef = useRef(false);

  const isCompleted = t?.ride_phase === "done";

  const togglePause = useCallback(() => {
    setIsPaused(p => {
      const next = !p;
      sendMessage({ type: "set_paused", paused: next });
      return next;
    });
  }, [sendMessage]);

  const handleEndConfirmed = useCallback(() => {
    setShowEndConfirm(false);
    sendMessage({ type: "end_ride" });
  }, [sendMessage]);

  const shiftGear = useCallback((dir: "up" | "down") => {
    sendMessage({ type: "gear_shift", direction: dir });
  }, [sendMessage]);

  const cycleCamera = useCallback(() => {
    setViewMode(m => m === "chase" ? "follow" : m === "follow" ? "birdseye" : "chase");
  }, []);

  // Pause announcement
  useEffect(() => {
    const prev = prevPausedAnnounceRef.current;
    prevPausedAnnounceRef.current = isPaused;
    if (prev === null) return;
    setAnnouncement(isPaused ? "Fahrt pausiert" : "Fahrt fortgesetzt");
  }, [isPaused]);

  // Completed announcement
  useEffect(() => {
    if (isCompleted && !prevCompletedAnnounceRef.current) {
      prevCompletedAnnounceRef.current = true;
      setAnnouncement("Fahrt beendet");
    }
  }, [isCompleted]);

  useEffect(() => {
    if (!isCompleted || endedRef.current) return;
    endedRef.current = true;
    const reason = t?.ended_reason === "user_ended" ? "user_ended" : "completed";
    const elapsed = t?.elapsed_s ?? null;
    const distance_m = t?.position_m ?? null;
    const ghost_time_gap_s = t?.ghost_time_gap_s ?? null;
    const delay = reason === "completed" ? 1500 : 0;
    const timer = setTimeout(() => {
      onRideEnded?.({ elapsed_s: elapsed, reason, distance_m, ghost_time_gap_s });
    }, delay);
    return () => clearTimeout(timer);
  }, [isCompleted, t?.ended_reason, t?.elapsed_s, onRideEnded]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const nowActive = status === "connected" || status === "live";
    const wasActive = prev === "connected" || prev === "live";
    if (nowActive && !wasActive) {
      sendMessage({ type: "athlete_settings", ...loadAthleteSettings() });
      sendMessage({ type: "set_paused", paused: true });
    }
    if (status === "disconnected") setAnnouncement("Verbindung unterbrochen");
    else if (status === "reconnecting") setAnnouncement("Verbindung wird wiederhergestellt");
  }, [status, sendMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" || e.key === "J") sendMessage({ type: "gear_shift", direction: "down" });
      else if (e.key === "k" || e.key === "K") sendMessage({ type: "gear_shift", direction: "up" });
      else if (e.key === "m" || e.key === "M") cycleCamera();
      else if (e.key === " ") { e.preventDefault(); togglePause(); }
      else if (e.key === "Escape" && showEndConfirm) setShowEndConfirm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendMessage, togglePause, cycleCamera, showEndConfirm]);

  useEffect(() => {
    if (routeError) console.warn("[RideOS] route_error:", routeError);
  }, [routeError]);

  useEffect(() => {
    const onMove = () => {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    };
    window.addEventListener("mousemove", onMove, true);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const stored = routeLoaded ? routeRef.current : null;
  const positionM = t?.position_m ?? null;
  const controlsVisible = (isPaused || showControls) && !isCompleted;

  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[var(--bg)]">
      {/* Screen reader live region */}
      <div
        data-testid="ride-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Map fills full viewport */}
      <div className="absolute inset-0 z-0">
        <MiniMap
          coords={stored?.coords ?? null}
          cumDist={stored?.cumDist ?? null}
          positionM={positionM}
          isDark={isDark}
          viewMode={viewMode}
          isDescending={isDescending}
          isClimbing={isClimbFocus}
          ghostLat={t?.ghost_lat ?? null}
          ghostLng={t?.ghost_lng ?? null}
          ghostBearingDeg={t?.ghost_bearing_deg ?? null}
        />
      </div>

      {/* Paused: subtle dim over map */}
      <div
        className={`absolute inset-0 z-[5] pointer-events-none transition-opacity duration-300 motion-reduce:transition-none ${isPaused ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.22)" }}
      />

      {/* Reconnecting: subtle edge indicator */}
      {(status === "reconnecting") && (
        <div
          data-testid="reconnecting-overlay"
          className="absolute inset-0 z-[6] pointer-events-none rounded-none"
          style={{ boxShadow: "inset 0 0 0 2px rgba(var(--warning-rgb, 220 150 50) / 0.35)" }}
          aria-hidden="true"
        />
      )}

      {/* Connection status — docked at top */}
      <div className="absolute top-0 left-0 right-0 z-30">
        <ConnectionBanner status={status} />
      </div>

      {/* Route load error */}
      {routeError && (
        <div className="absolute top-7 left-0 right-0 z-30 flex items-center justify-between px-4 py-2 bg-[var(--critical)] text-white text-[11px] font-medium">
          <span>Strecke konnte nicht geladen werden: {routeError}</span>
          <button type="button" onClick={clearRouteError} aria-label="Fehlermeldung schließen" className="ml-4 min-w-[44px] min-h-[44px] flex items-center justify-center font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Top-left: primary metrics HUD */}
      <div className={`absolute top-[40px] left-4 z-10 transition-opacity duration-500 motion-reduce:transition-none ${isCompleted ? "opacity-40" : "opacity-100"}`}>
        <HudPanel elevated className="p-4 flex flex-col gap-3 min-w-[180px] sm:min-w-[220px]">
          <MetricTile
            value={t?.speed_kmh?.toFixed(1) ?? "–"}
            unit="km/h"
            emphasis="primary"
          />

          <div className={`flex gap-5 transition-opacity duration-500 motion-reduce:transition-none ${isClimbFocus ? "opacity-60" : "opacity-100"}`}>
            <div className="flex flex-col gap-0.5">
              <MetricTile value={t?.power_w ?? "–"} unit="Watt" emphasis="secondary" />
              {t?.erg_mode && t?.target_power_w != null && (
                <span className="text-[9px] font-medium text-[var(--accent)]">Ziel {Math.round(t.target_power_w)} W</span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <MetricTile value={t?.cadence_rpm ?? "–"} unit="U/Min" emphasis="secondary" />
              {t?.erg_mode && t?.target_cadence_rpm != null && (
                <span className="text-[9px] font-medium text-[var(--accent)]">Ziel {t.target_cadence_rpm} rpm</span>
              )}
            </div>
          </div>

          {!t?.erg_mode && (
            <div className="flex gap-5 border-t border-[var(--border)] pt-2.5">
              <GearStrip gear={t?.gear ?? null} />
              <GradeBar effective={t?.effective_grade_pct ?? 0} highlight={isClimbFocus} />
            </div>
          )}

          {t?.lap_count != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Runde</span>
              <span className="text-[14px] font-data font-bold tabular-nums text-[var(--text)]">{(t.lap_index ?? 0) + 1}</span>
              <span className="text-[11px] text-[var(--text-muted)]">/ {t.lap_count}</span>
            </div>
          )}
        </HudPanel>
      </div>

      {/* Top-right: ghost delta + ride time + distance */}
      <div className={`absolute top-[40px] right-4 z-10 flex flex-col gap-1.5 items-end transition-opacity duration-500 motion-reduce:transition-none ${isCompleted ? "opacity-40" : "opacity-100"}`}>
        {ghostGap != null && (
          <div className="bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-lg px-2.5 py-1.5 shadow-soft">
            <span className={`text-[12px] font-data font-bold tabular-nums transition-colors duration-300 ${ghostColor}`}>
              {ghostGap > 0 ? `+${Math.round(ghostGap)}s` : `${Math.round(ghostGap)}s`}
            </span>
          </div>
        )}
        {t?.elapsed_s != null && (
          <div className="bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-lg px-2.5 py-1.5 shadow-soft">
            <span className="text-[12px] font-data tabular-nums text-[var(--text-muted)]">{formatTime(t.elapsed_s)}</span>
          </div>
        )}
        {t?.dist_remaining_m != null && (
          <div className="bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-lg px-2.5 py-1.5 shadow-soft">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">{(t.dist_remaining_m / 1000).toFixed(1)} km</span>
          </div>
        )}
      </div>

      {/* Centre banners: ride phase + ERG countdown + completed */}
      <div className="absolute top-[40px] left-1/2 -translate-x-1/2 z-20 flex flex-col gap-2 items-center">
        {(t?.ride_phase === "warmup" || t?.ride_phase === "cooldown") && (
          <HudPanel className="flex items-center gap-3 px-4 py-2">
            <span className="text-[11px] font-medium text-[var(--accent)]">
              {t.ride_phase === "warmup" ? "Aufwärmen" : "Abkühlen"}
            </span>
            {t.target_power_w != null && (
              <span className="text-[11px] text-[var(--text-muted)]">{Math.round(t.target_power_w)} W</span>
            )}
            {t.phase_remaining_s != null && (
              <span className="text-[12px] font-data font-bold tabular-nums text-[var(--text)]">{formatTime(t.phase_remaining_s)}</span>
            )}
          </HudPanel>
        )}
        {t?.erg_mode && t?.erg_change_countdown_s != null && t.erg_change_countdown_s <= 10 && (
          <HudPanel className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">ERG-Wechsel in</span>
            <span className="text-[13px] font-data font-bold tabular-nums text-[var(--accent)]">{Math.ceil(t.erg_change_countdown_s)}s</span>
          </HudPanel>
        )}
        {isCompleted && (
          <HudPanel elevated className="flex flex-col items-center gap-1 px-6 py-4">
            <span className="text-[13px] font-medium text-[var(--text)]">Fahrt beendet</span>
            {t?.elapsed_s != null && (
              <span className="text-[11px] text-[var(--text-muted)]">{formatTime(t.elapsed_s)}</span>
            )}
          </HudPanel>
        )}
      </div>

      {/* Bottom: elevation timeline */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 transition-[height] duration-500 ease-oudena motion-reduce:transition-none ${isClimbFocus ? "h-[200px]" : "h-[140px]"}`}>
        <ElevationProfile
          data={stored?.elevationChart ?? null}
          gradesPct={stored?.gradesPct ?? null}
          positionM={positionM}
          ghostDistM={t?.ghost_dist_m ?? null}
        />
      </div>

      {/* Ride controls: gear, camera, pause, end */}
      {!isCompleted && (
        <RideControls
          isPaused={isPaused}
          visible={controlsVisible}
          onTogglePause={togglePause}
          onEndRide={() => setShowEndConfirm(true)}
          onShiftGear={shiftGear}
          onCycleCamera={cycleCamera}
          viewMode={viewMode}
        />
      )}

      {showEndConfirm && (
        <EndRideConfirmation
          onConfirm={handleEndConfirmed}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}
    </div>
  );
}
