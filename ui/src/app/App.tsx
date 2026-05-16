import { useState, useCallback } from "react";
import { WSProvider } from "../shared/ws/WSProvider";
import { ThemeProvider, useTheme } from "./providers/ThemeProvider";
import { HomeScreen } from "../features/home/HomeScreen";
import { PreRideScreen } from "../features/pre-ride/PreRideScreen";
import { RideScreen, type RideSummaryData } from "../features/ride/RideScreen";
import { RideStartRitual } from "../features/ride-start/RideStartRitual";
import { HistoryScreen } from "../features/history/HistoryScreen";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";
import { DevicesScreen } from "../features/devices/DevicesScreen";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { OnboardingFlow } from "../features/onboarding/OnboardingFlow";
import { useOnboarding } from "../features/onboarding/useOnboarding";
import { AppNav } from "./AppNav";
import type { AppView } from "./types";
import type { RideConfig } from "../features/pre-ride/RideOptions";

interface RideStartContext {
  routeId: string;
  routeName: string;
  config: RideConfig;
}

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
  const [routePreSelect, setRoutePreSelect] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rideSummary, setRideSummary] = useState<RideSummaryData | null>(null);
  const [rideStartCtx, setRideStartCtx] = useState<RideStartContext | null>(null);
  const { done: onboardingDone, step, stepIndex, totalSteps, advance, complete, reopen } = useOnboarding();

  const handleReopenOnboarding = useCallback(() => {
    reopen();
    setView('home');
  }, [reopen]);

  const isRiding = view === 'ride';
  const isPreparing = view === 'preparing';

  const handleRideEnded = (data: RideSummaryData) => {
    setRideSummary({
      ...data,
      route_name: rideStartCtx?.routeName ?? null,
      route_id: rideStartCtx?.routeId ?? null,
    });
    setView('summary');
  };

  const handleOpenRoutes = useCallback((preSelectId?: string) => {
    setRoutePreSelect(preSelectId ?? null);
    setView('routes');
  }, []);

  const handleNavigate = useCallback((v: AppView) => {
    if (v !== 'routes') setRoutePreSelect(null);
    setView(v);
  }, []);

  const handleStartRide = useCallback((routeId: string, routeName: string, config: RideConfig) => {
    setRideStartCtx({ routeId, routeName, config });
    setView('preparing');
  }, []);

  if (isRiding) {
    return (
      <>
        <RideScreen isDark={isDark} onRideEnded={handleRideEnded} />
        <ThemeToggle />
        <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </>
    );
  }

  if (isPreparing && rideStartCtx) {
    return (
      <>
        <RideScreen isDark={isDark} onRideEnded={handleRideEnded} />
        <RideStartRitual
          routeId={rideStartCtx.routeId}
          routeName={rideStartCtx.routeName}
          config={rideStartCtx.config}
          onReady={() => { setView('ride'); }}
          onCancel={() => { setRideStartCtx(null); setView('routes'); }}
        />
      </>
    );
  }

  return (
    <div data-testid="app-shell" className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 min-h-0">
        {view === 'home' && (
          <HomeScreen
            onOpenRoutes={handleOpenRoutes}
            onOpenDevices={() => handleNavigate('devices')}
          />
        )}
        {view === 'routes' && (
          <PreRideScreen onStarted={() => setView('ride')} onStartRide={handleStartRide} initialRouteId={routePreSelect} />
        )}
        {view === 'summary' && (
          <RideSummaryScreen
            summaryData={rideSummary}
            onReturnHome={() => { setRideSummary(null); setRideStartCtx(null); setView('home'); }}
            onRideAgain={rideSummary?.route_id
              ? () => {
                  const id = rideSummary!.route_id!;
                  setRideSummary(null);
                  setRideStartCtx(null);
                  handleOpenRoutes(id);
                }
              : undefined
            }
          />
        )}
        {view === 'history' && <HistoryScreen />}
        {view === 'analytics' && <AnalyticsScreen />}
        {view === 'devices' && <DevicesScreen />}
        {view === 'settings' && <SettingsScreen onReopenOnboarding={handleReopenOnboarding} />}
      </div>

      <AppNav current={view} onNavigate={handleNavigate} />

      <ThemeToggle />
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onReopenOnboarding={reopen}
      />

      {!onboardingDone && (
        <OnboardingFlow
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          onAdvance={advance}
          onComplete={complete}
        />
      )}
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
