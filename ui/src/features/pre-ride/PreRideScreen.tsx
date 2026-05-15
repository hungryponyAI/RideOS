import { useState, useRef, useCallback, useEffect } from "react";
import { OudenaLogo } from "../../shared/ui/OudenaLogo";
import { useWS } from "../../shared/ws/useWS";
import { useRouteLibrary } from "../routes/hooks/useRouteLibrary";
import { useAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { useStravaStatus } from "../strava/hooks/useStravaStatus";
import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import { useRouteFavorites } from "../routes/hooks/useRouteFavorites";
import { StravaConnectModal, type StravaModalStep } from "../strava/StravaConnectModal";
import { setLastRouteId } from "../home/hooks/useHomeRecommendation";
import type { RouteLibraryEntry } from "../../shared/types/route";
import { RouteCard } from "./RouteCard";
import { RouteCardExpanded } from "./RouteCardExpanded";
import { RouteFilterBar, applyRouteFilters, type RouteFilter } from "../routes/components/RouteFilterBar";
import type { RideConfig } from "./RideOptions";

interface Props {
  onStarted: () => void;
  onStartRide?: (routeId: string, routeName: string, config: RideConfig) => void;
  initialRouteId?: string | null;
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export function PreRideScreen({ onStarted, onStartRide, initialRouteId }: Props) {
  const { sendMessage, status: wsStatus } = useWS();
  const routeLibrary = useRouteLibrary();
  const { settings: athleteSettings } = useAthleteSettings();
  const { stravaStatus, stravaAuthUrl, stravaError, clearStravaAuthUrl, clearStravaError } = useStravaStatus();
  const { kickrConnected } = useDeviceStatus();
  const { isFavorite, toggle: toggleFavorite, favorites } = useRouteFavorites();

  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteLibraryEntry | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<RouteFilter>>(new Set());
  const hasAppliedInitial = useRef(false);

  useEffect(() => {
    if (!hasAppliedInitial.current && initialRouteId && routeLibrary.length > 0) {
      const route = routeLibrary.find(r => r.id === initialRouteId);
      if (route) { setSelectedRoute(route); hasAppliedInitial.current = true; }
    }
  }, [initialRouteId, routeLibrary]);

  const [showStravaModal, setShowStravaModal] = useState(false);
  const [modalStep, setModalStep] = useState<StravaModalStep>("idle");
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (stravaAuthUrl && showStravaModal) {
      setModalStep("enter_code");
      window.open(stravaAuthUrl, "_blank");
      clearStravaAuthUrl();
    }
  }, [stravaAuthUrl, showStravaModal, clearStravaAuthUrl]);

  useEffect(() => {
    if (stravaStatus?.connected && modalStep === "connecting") {
      setShowStravaModal(false);
      setModalStep("idle");
      setModalError(null);
    }
  }, [stravaStatus, modalStep]);

  useEffect(() => {
    if (stravaError && showStravaModal) {
      setModalError(stravaError);
      setModalStep("enter_code");
      clearStravaError();
    }
  }, [stravaError, showStravaModal, clearStravaError]);

  const handleOpenStravaModal = () => { setShowStravaModal(true); setModalStep("idle"); setModalError(null); };
  const handleCloseStravaModal = () => { setShowStravaModal(false); setModalStep("idle"); setModalError(null); };
  const handleRequestAuthUrl = () => { setModalStep("waiting_url"); sendMessage({ type: "strava_get_auth_url" }); };
  const handleSubmitCode = (code: string) => { setModalStep("connecting"); setModalError(null); sendMessage({ type: "strava_submit_code", code }); };
  const handleStravaSync = () => sendMessage({ type: "strava_sync" });
  const handleStravaDisconnect = () => sendMessage({ type: "strava_disconnect" });

  const loadFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".gpx")) { setFileError("Keine .gpx-Datei ausgewählt"); return; }
    setFileError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const sent = sendMessage({ type: "load_route_content", content });
      if (!sent) { setFileError("Keine Verbindung zur Engine"); setLoading(false); return; }
      onStarted();
    };
    reader.onerror = () => { setFileError("Datei konnte nicht gelesen werden"); setLoading(false); };
    reader.readAsText(file);
  }, [sendMessage, onStarted]);

  const handleSelectRoute = useCallback((routeId: string) => {
    const route = routeLibrary.find(r => r.id === routeId) ?? null;
    if (route) setLastRouteId(routeId);
    setSelectedRoute(route);
  }, [routeLibrary]);

  const handleStartWithConfig = useCallback((config: RideConfig) => {
    if (!selectedRoute) return;
    if (onStartRide) {
      onStartRide(selectedRoute.id, selectedRoute.name, config);
    } else {
      sendMessage({
        type: "start_ride",
        route_id: selectedRoute.id,
        reverse: config.reverse,
        cutout_start_m: config.cutoutStartM,
        cutout_end_m: config.cutoutEndM,
        laps: config.laps,
        ghost: config.ghost,
        warmup_s: config.warmup ? 120 : 0,
        cooldown_s: config.cooldown ? 120 : 0,
        erg_mode: config.ergMode,
        physics_mode: config.physicsMode,
      });
      onStarted();
    }
  }, [selectedRoute, sendMessage, onStarted, onStartRide]);

  const handleDelete = useCallback((routeId: string) => {
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
    sendMessage({ type: "delete_route", route_id: routeId });
  }, [sendMessage, selectedRoute]);

  const handleRename = useCallback((routeId: string, name: string) => {
    sendMessage({ type: "rename_route", route_id: routeId, name });
  }, [sendMessage]);

  const isStravaConnected = stravaStatus?.connected ?? false;
  const isStravaSyncing = stravaStatus?.syncing ?? false;
  const selectedRouteId = selectedRoute?.id ?? null;

  const filteredLibrary = applyRouteFilters(routeLibrary, activeFilters, favorites);
  const otherRoutes = filteredLibrary.filter(r => r.id !== selectedRouteId);

  const wsSearching = wsStatus === "connecting" || wsStatus === "reconnecting";
  const trainerSearching = !kickrConnected && (wsSearching || wsStatus === "connected");

  return (
    <div className="w-full h-full bg-[var(--bg)] flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center px-4 sm:px-8 py-5 border-b border-[var(--border)]">
        <div className="flex flex-col items-start">
          <OudenaLogo height={40} />
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                kickrConnected
                  ? "bg-[var(--success)] animate-pulse"
                  : trainerSearching
                  ? "bg-[var(--warning)] animate-pulse"
                  : "bg-[var(--critical)]"
              }`}
            />
            <p className={`text-xs ${kickrConnected ? "text-[var(--success)]" : "text-[var(--text-subtle)]"}`}>
              {kickrConnected ? "Trainer verbunden" : trainerSearching ? "Trainer wird gesucht" : "Trainer nicht verbunden"}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!isStravaConnected ? (
            <button type="button" onClick={handleOpenStravaModal} className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors duration-150">
              <StravaIcon size={12} /> Mit Strava verbinden
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <StravaIcon size={12} />
              <span className="text-xs text-[#FC4C02]">{stravaStatus?.athleteName ?? "Strava"}</span>
              {isStravaSyncing && <span className="text-xs text-[var(--text-subtle)]">Synchronisiert…</span>}
              <button type="button" onClick={handleStravaSync} disabled={isStravaSyncing} className="text-xs border border-[#FC4C02] text-[#FC4C02] rounded px-2.5 py-1 hover:bg-[#FC4C02] hover:text-white transition-colors duration-150 disabled:opacity-40">Sync</button>
              <button type="button" onClick={handleStravaDisconnect} className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors duration-150 px-1 py-1">Trennen</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 sm:px-8 pb-8 pt-6 gap-5">
        {selectedRoute ? (
          <>
            <RouteCardExpanded
              route={selectedRoute}
              athleteSettings={athleteSettings}
              onStart={handleStartWithConfig}
              onClose={() => setSelectedRoute(null)}
              onRename={handleRename}
              isFavorite={isFavorite(selectedRoute.id)}
              onToggleFavorite={toggleFavorite}
            />
            {otherRoutes.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Weitere Strecken</p>
                <div className="grid grid-cols-3 xl:grid-cols-4 gap-2">
                  {otherRoutes.map(route => (
                    <RouteCard key={route.id} route={route} onLoad={handleSelectRoute} onDelete={handleDelete} onRename={handleRename} athleteSettings={athleteSettings} isSelected={false} compact
                      isFavorite={isFavorite(route.id)} onToggleFavorite={toggleFavorite} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col sm:flex-row min-h-0 gap-0 overflow-y-auto sm:overflow-hidden">
            <div className="w-full sm:w-[260px] shrink-0 flex flex-col gap-4 sm:pr-8 pb-4 sm:pb-0">
              <div
                role="button"
                tabIndex={0}
                aria-label="GPX-Datei importieren"
                className={`flex flex-col items-center justify-center gap-3 border border-dashed rounded-xl p-8 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:border-[var(--accent)] ${
                  dragging ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--border)] bg-transparent hover:border-[var(--accent)] hover:bg-[var(--surface)]"
                }`}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              >
                <input ref={fileInputRef} type="file" accept=".gpx" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} className="hidden" />
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={loading ? "text-[var(--accent)]" : "text-[var(--text-subtle)]"} aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className={`text-xs font-medium text-center ${loading ? "text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
                  {loading ? "Wird geladen…" : dragging ? "Hier ablegen" : "GPX-Datei importieren"}
                </span>
                {fileError && <span className="text-xs text-[var(--critical)] text-center">{fileError}</span>}
              </div>

              <button type="button" disabled={loading} onClick={() => onStarted()} className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] disabled:opacity-40 transition-colors duration-150 py-2 text-center">
                Ohne Strecke fahren
              </button>
            </div>

            <div className="hidden sm:block w-px bg-[var(--border)] shrink-0" />

            <div className="flex-1 min-w-0 flex flex-col sm:pl-8">
              <div className="flex items-center gap-3 mb-3 shrink-0 flex-wrap">
                <span className="text-xs font-medium text-[var(--text-muted)]">Meine Strecken</span>
                {routeLibrary.length > 0 && (
                  <span className="text-xs text-[var(--text-subtle)] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5">
                    {filteredLibrary.length < routeLibrary.length ? `${filteredLibrary.length}/${routeLibrary.length}` : routeLibrary.length}
                  </span>
                )}
              </div>

              {routeLibrary.length > 0 && (
                <div className="mb-3 shrink-0">
                  <RouteFilterBar
                    active={activeFilters}
                    routes={routeLibrary}
                    favorites={favorites}
                    onChange={setActiveFilters}
                  />
                </div>
              )}

              {routeLibrary.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-sm font-medium text-[var(--text)]">Noch keine Routen</span>
                  <span className="text-xs text-[var(--text-subtle)]">Importiere eine GPX-Datei oder verbinde Strava.</span>
                </div>
              ) : filteredLibrary.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-sm font-medium text-[var(--text)]">Keine passenden Strecken</span>
                  <button type="button" onClick={() => setActiveFilters(new Set())} className="text-xs text-[var(--accent)] hover:underline cursor-pointer">Filter zurücksetzen</button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {filteredLibrary.map((route: RouteLibraryEntry) => (
                      <RouteCard key={route.id} route={route} onLoad={handleSelectRoute} onDelete={handleDelete} onRename={handleRename} athleteSettings={athleteSettings} isSelected={selectedRouteId === route.id}
                        isFavorite={isFavorite(route.id)} onToggleFavorite={toggleFavorite} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showStravaModal && (
        <StravaConnectModal step={modalStep} authUrl={stravaAuthUrl} error={modalError} onClose={handleCloseStravaModal} onRequestUrl={handleRequestAuthUrl} onSubmitCode={handleSubmitCode} />
      )}
    </div>
  );
}
