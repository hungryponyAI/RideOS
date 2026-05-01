import { useEffect, useRef, useState } from "react";
import { useTelemetry } from "./hooks/useTelemetry";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { MetricDisplay } from "./components/MetricDisplay";
import { GearStrip } from "./components/GearStrip";
import { GradeBar } from "./components/GradeBar";
import { ElevationProfile } from "./components/ElevationProfile";
import { MiniMap } from "./components/MiniMap";
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

function App() {
  const { telemetry: t, status, sendMessage, routeRef, routeLoaded, routeError, clearRouteError, clickConnected, kickrConnected, routeLibrary } =
    useTelemetry();
  const [started, setStarted] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('rideos-theme') === 'dark';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const prevStatusRef = useRef(status);

  const toggleTheme = () => setIsDark(d => !d);

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

  // Send athlete settings to engine whenever WS (re)connects.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const nowActive = status === "connected" || status === "live";
    const wasActive = prev === "connected" || prev === "live";
    if (nowActive && !wasActive) {
      sendMessage({ type: "athlete_settings", ...loadAthleteSettings() });
    }
  }, [status, sendMessage]);

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

          {/* Gear: chainring icon + number */}
          <GearStrip gear={t?.gear ?? null} />

          {/* Grade: slope icon + effective grade */}
          <GradeBar effective={t?.effective_grade_pct ?? 0} />

          {/* Power + cadence pushed to bottom */}
          <div className="flex flex-col gap-5 mt-auto">
            <MetricDisplay value={t?.power_w ?? "–"} unit="WATT" size="body" />
            <MetricDisplay value={t?.cadence_rpm ?? "–"} unit="U/MIN" size="body" />
          </div>
        </div>

        {/* Map fills all remaining space */}
        <div className="relative h-full overflow-hidden">
          <MiniMap
            coords={stored?.coords ?? null}
            cumDist={stored?.cumDist ?? null}
            positionM={positionM}
            isDark={isDark}
          />
        </div>
      </div>

      {/* Elevation profile strip */}
      <div className="h-[140px] shrink-0">
        <ElevationProfile data={stored?.elevationChart ?? null} positionM={positionM} />
      </div>

      <SettingsButton onClick={() => setIsSettingsOpen(o => !o)} />
      <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
      {settingsPanel}
    </div>
  );
}

export default App;
