import { useState } from "react";
import { WSProvider } from "../shared/ws/WSProvider";
import { ThemeProvider, useTheme } from "./providers/ThemeProvider";
import { PreRideScreen } from "../features/pre-ride/PreRideScreen";
import { RideScreen } from "../features/ride/RideScreen";
import { HistoryScreen } from "../features/history/HistoryScreen";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";
import { DevicesScreen } from "../features/devices/DevicesScreen";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { AppNav } from "./AppNav";
import type { AppView } from "./types";

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme} aria-label={isDark ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}
      className="fixed top-0 right-0 z-[2000] min-w-[44px] min-h-[44px] flex items-center justify-center bg-[var(--surface)] border-b border-l border-[var(--border)] text-[var(--text-muted)] cursor-pointer transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--text)]">
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function AppShell() {
  const { isDark } = useTheme();
  const [view, setView] = useState<AppView>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isRiding = view === 'ride';

  if (isRiding) {
    return (
      <>
        <RideScreen isDark={isDark} />
        <ThemeToggle />
        <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </>
    );
  }

  return (
    <div data-testid="app-shell" className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 min-h-0">
        {(view === 'home' || view === 'routes') && (
          <PreRideScreen onStarted={() => setView('ride')} />
        )}
        {view === 'summary' && (
          <RideSummaryScreen onReturnHome={() => setView('home')} />
        )}
        {view === 'history' && <HistoryScreen />}
        {view === 'analytics' && <AnalyticsScreen />}
        {view === 'devices' && <DevicesScreen />}
      </div>

      <AppNav
        current={view}
        onNavigate={setView}
        onSettingsOpen={() => setIsSettingsOpen(o => !o)}
      />

      <ThemeToggle />
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <WSProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </WSProvider>
  );
}
