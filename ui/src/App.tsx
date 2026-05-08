import { useCallback, useEffect, useRef, useState } from "react";
import { useTelemetry } from "./hooks/useTelemetry";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { MetricDisplay } from "./components/MetricDisplay";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap, type MapViewMode } from "./components/MiniMap";
import { PreRideScreen } from "./components/PreRideScreen";
import { SettingsPanel, loadAthleteSettings } from "./components/SettingsPanel";

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Einstellungen öffnen"
      className="fixed top-[6px] right-[48px] z-[2000] w-7 h-7 flex items-center justify-center bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] cursor-pointer transition-colors duration-150 hover:border-[#FFF200] hover:text-[var(--text)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  );
}

function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
      className="fixed top-[6px] right-4 z-[2000] w-7 h-7 flex items-center justify-center bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] cursor-pointer transition-colors duration-150 hover:border-[#FFF200] hover:text-[var(--text)]"
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function PlayPauseOverlay({
  isPaused,
  visible,
  onToggle,
}: {
  isPaused: boolean;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-[1500] flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPaused ? "Fahrt starten" : "Fahrt pausieren"}
        className="flex flex-col items-center gap-2 cursor-pointer group"
      >
        <div className="w-20 h-20 rounded-full bg-black/60 border-2 border-white/40 flex items-center justify-center text-white group-hover:bg-black/80 group-hover:border-white/70 transition-all duration-150">
          {isPaused ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          )}
        </div>
        <span className="text-white/80 font-condensed font-bold text-[10px] tracking-widest uppercase">
          {isPaused ? "STARTEN" : "PAUSE"}
        </span>
      </button>
    </div>
  );
}

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function App() {
  const {
    telemetry: t, status, sendMessage, routeRef, routeLoaded, routeError, clearRouteError,
    clickConnected, kickrConnected, routeLibrary,
    stravaStatus, stravaAuthUrl, clearStravaAuthUrl, stravaError, clearStravaError,
  } = useTelemetry();
  const [started, setStarted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [showControls, setShowControls] = useState<boolean>(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('rideos-theme') === 'dark';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<MapViewMode>("chase");
  const prevStatusRef = useRef(status);

  const toggleTheme = () => setIsDark(d => !d);

  const togglePause = useCallback(() => {
    setIsPaused(p => {
      const next = !p;
      sendMessage({ type: "set_paused", paused: next });
      return next;
    });
  }, [sendMessage]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('rideos-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" || e.key === "J") {
        sendMessage({ type: "gear_shift", direction: "down" });
      } else if (e.key === "k" || e.key === "K") {
        sendMessage({ type: "gear_shift", direction: "up" });
      } else if ((e.key === "m" || e.key === "M") && started) {
        setViewMode((m) =>
          m === "chase" ? "follow" : m === "follow" ? "birdseye" : "chase"
        );
      } else if (e.key === " " && started) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendMessage, started, togglePause]);

  useEffect(() => {
    if (routeError) {
      console.warn("[RideOS] route_error:", routeError);
    }
  }, [routeError]);

  // Send athlete settings to engine whenever WS (re)connects.
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

  // Show controls overlay on mouse movement; hide after 2 s of inactivity.
  useEffect(() => {
    if (!started) return;
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
  }, [started]);

  const settingsPanel = (
    <SettingsPanel
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      sendMessage={sendMessage}
      wsStatus={status}
      clickConnected={clickConnected}
      kickrConnected={kickrConnected}
    />
  );

  if (!started) {
    return (
      <>
        <PreRideScreen
          onStarted={() => setStarted(true)}
          sendMessage={sendMessage}
          routeLibrary={routeLibrary}
          athleteSettings={loadAthleteSettings()}
          stravaStatus={stravaStatus}
          stravaAuthUrl={stravaAuthUrl}
          onStravaAuthUrlConsumed={clearStravaAuthUrl}
          stravaError={stravaError}
          onStravaErrorConsumed={clearStravaError}
        />
        <SettingsButton onClick={() => setIsSettingsOpen(o => !o)} />
        <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
        {settingsPanel}
      </>
    );
  }

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

      {/* Main area: left metrics panel + full-height map */}
      <div className="flex-1 grid grid-cols-[256px_1fr] min-h-0 overflow-hidden">

        {/* Left panel: all metrics */}
        <div className="flex flex-col gap-8 px-6 py-6 border-r border-[var(--border)] overflow-hidden">
          {/* Speed — primary metric */}
          <MetricDisplay value={t?.speed_kmh?.toFixed(1) ?? "–"} unit="KM/H" size="display" />

          {/* Gear (hidden in erg mode) */}
          {!t?.erg_mode && <GearStrip gear={t?.gear ?? null} />}

          {/* Grade (hidden in erg mode) */}
          {!t?.erg_mode && <GradeBar effective={t?.effective_grade_pct ?? 0} />}

          {/* Lap counter — always shown when a route is active */}
          {t?.lap_count != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)]">LAP</span>
              <span className="text-[16px] font-data font-bold tabular-nums text-[var(--text)]">
                {(t?.lap_index ?? 0) + 1}
              </span>
              <span className="text-[11px] font-condensed text-[var(--text-muted)]">/ {t.lap_count}</span>
            </div>
          )}

          {/* Power + cadence pushed to bottom, with erg targets inline */}
          <div className="flex flex-col gap-5 mt-auto">
            <div className="flex flex-col gap-0.5">
              <MetricDisplay value={t?.power_w ?? "–"} unit="WATT" size="body" />
              {t?.erg_mode && t?.target_power_w != null && (
                <span className="text-[9px] font-condensed font-bold tracking-[0.15em] uppercase text-[var(--label-accent)]">
                  ZIEL {Math.round(t.target_power_w)} W
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <MetricDisplay value={t?.cadence_rpm ?? "–"} unit="U/MIN" size="body" />
              {t?.erg_mode && t?.target_cadence_rpm != null && (
                <span className="text-[9px] font-condensed font-bold tracking-[0.15em] uppercase text-[var(--label-accent)]">
                  ZIEL {t.target_cadence_rpm} RPM
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Map fills all remaining space */}
        <div className="relative h-full overflow-hidden">
          <MiniMap
            coords={stored?.coords ?? null}
            cumDist={stored?.cumDist ?? null}
            positionM={positionM}
            isDark={isDark}
            viewMode={viewMode}
            ghostLat={t?.ghost_lat ?? null}
            ghostLng={t?.ghost_lng ?? null}
            ghostBearingDeg={t?.ghost_bearing_deg ?? null}
          />

          {/* Top-left overlay: ghost time gap · elapsed time · distance remaining */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 flex-wrap">
            {t?.ghost_time_gap_s != null && (
              <div className="bg-black/70 text-white px-2 py-1 text-[10px] font-bold font-condensed tracking-widest">
                {t.ghost_time_gap_s > 0
                  ? `+${Math.round(t.ghost_time_gap_s)}s`
                  : `${Math.round(t.ghost_time_gap_s)}s`}
              </div>
            )}
            {t?.elapsed_s != null && (
              <div className="bg-black/70 text-white/90 px-2 py-1 text-[10px] font-condensed font-bold tracking-widest tabular-nums">
                {formatTime(t.elapsed_s)}
              </div>
            )}
            {t?.dist_remaining_m != null && (
              <div className="bg-black/70 text-white/90 px-2 py-1 text-[10px] font-condensed font-bold tracking-widest tabular-nums">
                {(t.dist_remaining_m / 1000).toFixed(1)} KM
              </div>
            )}
          </div>

          {/* Phase banner: warmup / cooldown with countdown */}
          {(t?.ride_phase === "warmup" || t?.ride_phase === "cooldown") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/80 border border-[#FFF200] px-4 py-2">
              <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[#FFF200]">
                {t.ride_phase === "warmup" ? "WARM-UP" : "COOL-DOWN"}
              </span>
              <span className="text-[11px] font-condensed text-[var(--text-muted)]">
                {t.target_power_w != null ? `${Math.round(t.target_power_w)} W` : "90 W"}
              </span>
              {t.phase_remaining_s != null && (
                <span className="text-[11px] font-data font-bold tabular-nums text-white">
                  {formatTime(t.phase_remaining_s)}
                </span>
              )}
            </div>
          )}

          {/* Erg mode: change countdown (last 10 s before a target switch) */}
          {t?.erg_mode && t?.erg_change_countdown_s != null && t.erg_change_countdown_s <= 10 && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-[#FFF200] text-black px-3 py-1.5">
              <span className="text-[10px] font-condensed font-bold tracking-widest uppercase">
                ERG WECHSEL IN
              </span>
              <span className="text-[13px] font-data font-bold tabular-nums">
                {Math.ceil(t.erg_change_countdown_s)}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Elevation profile strip */}
      <div className="h-[140px] shrink-0">
        <ElevationProfile data={stored?.elevationChart ?? null} positionM={positionM} />
      </div>

      <PlayPauseOverlay isPaused={isPaused} visible={showControls} onToggle={togglePause} />
      <SettingsButton onClick={() => setIsSettingsOpen(o => !o)} />
      <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
      {settingsPanel}
    </div>
  );
}

export default App;
