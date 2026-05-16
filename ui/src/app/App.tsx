import { useState, useCallback, useEffect } from "react";
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
import type { MapViewMode } from "../features/ride/components/MiniMap";

interface RideStartContext {
  routeId: string;
  routeName: string;
  config: RideConfig;
  rideSessionId: string;
}

function createRideSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ride-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


function AppShell() {
  const { isDark } = useTheme();
  const [view, setView] = useState<AppView>('home');
  const [routePreSelect, setRoutePreSelect] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rideSummary, setRideSummary] = useState<RideSummaryData | null>(null);
  const [rideStartCtx, setRideStartCtx] = useState<RideStartContext | null>(null);
  const [rideViewMode, setRideViewMode] = useState<MapViewMode>("chase");
  const { done: onboardingDone, step, stepIndex, totalSteps, advance, complete, reopen } = useOnboarding();

  const handleReopenOnboarding = useCallback(() => {
    reopen();
    setView('home');
  }, [reopen]);

  const isRiding = view === 'ride';
  const isPreparing = view === 'preparing';

  useEffect(() => {
    if (!isRiding) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isRiding]);

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
    setRideStartCtx({ routeId, routeName, config, rideSessionId: createRideSessionId() });
    setRideViewMode("chase");
    setView('preparing');
  }, []);

  const cycleRideCamera = useCallback(() => {
    setRideViewMode(m => m === "chase" ? "follow" : m === "follow" ? "birdseye" : "chase");
  }, []);

  if (isRiding) {
    return (
      <>
        <RideScreen
          isDark={isDark}
          onRideEnded={handleRideEnded}
          activeRouteId={rideStartCtx?.routeId ?? null}
          activeRideSessionId={rideStartCtx?.rideSessionId ?? null}
          viewMode={rideViewMode}
          onCycleCamera={cycleRideCamera}
        />
        <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </>
    );
  }

  if (isPreparing && rideStartCtx) {
    return (
      <>
        <RideScreen
          isDark={isDark}
          onRideEnded={handleRideEnded}
          activeRouteId={rideStartCtx.routeId}
          activeRideSessionId={rideStartCtx.rideSessionId}
          viewMode={rideViewMode}
          onCycleCamera={cycleRideCamera}
        />
        <RideStartRitual
          routeId={rideStartCtx.routeId}
          rideSessionId={rideStartCtx.rideSessionId}
          routeName={rideStartCtx.routeName}
          config={rideStartCtx.config}
          viewMode={rideViewMode}
          onCycleCamera={cycleRideCamera}
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
