import { useState, useCallback, useEffect } from "react";
import { WSProvider } from "../shared/ws/WSProvider";
import { ThemeProvider, useTheme } from "./providers/ThemeProvider";
import { ErrorBoundary } from "./ErrorBoundary";
import { MotionProvider } from "../shared/motion/MotionProvider";
import { ScreenTransition } from "../shared/motion/ScreenTransition";
import { HomeScreen } from "../features/home/HomeScreen";
import { PreRideScreen } from "../features/pre-ride/PreRideScreen";
import { RideScreen, type RideSummaryData } from "../features/ride/RideScreen";
import { RideStartRitual } from "../features/ride-start/RideStartRitual";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";
import { DevicesScreen } from "../features/devices/DevicesScreen";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { OnboardingFlow } from "../features/onboarding/OnboardingFlow";
import { useOnboarding } from "../features/onboarding/useOnboarding";
import { AppEntryGate } from "../features/startup/AppEntryGate";
import { ProfileProvider } from "../features/profiles/ProfileProvider";
import { useProfileContext } from "../features/profiles/useProfileContext";
import { AppNav } from "./AppNav";
import type { AppView } from "./types";
import type { RideConfig } from "../features/pre-ride/RideOptions";
import { createDefaultRideConfig } from "../features/pre-ride/defaultRideConfig";
import type { MapViewMode } from "../features/ride/components/MiniMap";

interface RideStartContext {
  routeId: string;
  routeName: string;
  config: RideConfig;
  rideSessionId: string;
}

type RouteOpenMode = "focus" | "options";

interface RoutePreSelect {
  routeId: string;
  mode: RouteOpenMode;
}

function createRideSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ride-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


function AppShell({ onSwitchProfile }: { onSwitchProfile: () => void }) {
  const { isDark } = useTheme();
  const { activeProfile } = useProfileContext();
  const [view, setView] = useState<AppView>('home');
  const [routePreSelect, setRoutePreSelect] = useState<RoutePreSelect | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rideSummary, setRideSummary] = useState<RideSummaryData | null>(null);
  const [rideStartCtx, setRideStartCtx] = useState<RideStartContext | null>(null);
  const [rideViewMode, setRideViewMode] = useState<MapViewMode>("chase");
  const { done: onboardingDone, step, stepIndex, totalSteps, advance, complete, reopen } = useOnboarding(activeProfile?.id ?? null);

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

  const handleOpenRoutes = useCallback((preSelectId?: string, mode: RouteOpenMode = "focus") => {
    setRoutePreSelect(preSelectId ? { routeId: preSelectId, mode } : null);
    setView('routes');
  }, []);

  const handleNavigate = useCallback((v: AppView) => {
    if (v !== 'routes') setRoutePreSelect(null);
    setView(v);
  }, []);

  const handleStartRide = useCallback((routeId: string, routeName: string, config: RideConfig) => {
    setRideStartCtx({ routeId, routeName, config: { ...config, physicsMode: true }, rideSessionId: createRideSessionId() });
    setRideViewMode("chase");
    setView('preparing');
  }, []);

  const handleStartRideDefault = useCallback((routeId: string, routeName: string) => {
    handleStartRide(routeId, routeName, createDefaultRideConfig());
  }, [handleStartRide]);

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
        <ScreenTransition transitionKey={view}>
          {view === 'home' && (
            <HomeScreen
              onOpenRoutes={handleOpenRoutes}
              onStartRide={handleStartRideDefault}
              onOpenDevices={() => handleNavigate('devices')}
            />
          )}
          {view === 'routes' && (
            <PreRideScreen
              onStarted={() => setView('ride')}
              onStartRide={handleStartRide}
              initialRouteId={routePreSelect?.routeId ?? null}
              initialMode={routePreSelect?.mode ?? "focus"}
            />
          )}
          {view === 'summary' && (
            <RideSummaryScreen
              summaryData={rideSummary}
              onReturnHome={() => { setRideSummary(null); setRideStartCtx(null); setView('home'); }}
              onRideAgain={rideSummary?.route_id
                ? () => {
                  const id = rideSummary!.route_id!;
                  const name = rideSummary!.route_name ?? "Route";
                  setRideSummary(null);
                  setRideStartCtx(null);
                  handleStartRideDefault(id, name);
                }
                : undefined
              }
            />
          )}
          {view === 'analytics' && <AnalyticsScreen />}
          {view === 'devices' && <DevicesScreen />}
          {view === 'settings' && <SettingsScreen onReopenOnboarding={handleReopenOnboarding} onSwitchProfile={onSwitchProfile} />}
        </ScreenTransition>
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
        <ErrorBoundary>
          <ProfileProvider>
            <MotionProvider defaultMode="cinematic">
              <AppEntryGate>
                {(onSwitchProfile) => <AppShell onSwitchProfile={onSwitchProfile} />}
              </AppEntryGate>
            </MotionProvider>
          </ProfileProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </WSProvider>
  );
}
