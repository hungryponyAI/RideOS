import { useState, useRef, useCallback, useEffect } from "react";
import { ScreenHeader } from "../../shared/ui/ScreenHeader";
import { useWS } from "../../shared/ws/useWS";
import { useRouteLibrary } from "../routes/hooks/useRouteLibrary";
import { useAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import { useRouteFavorites } from "../routes/hooks/useRouteFavorites";
import { setLastRouteId } from "../home/hooks/useHomeRecommendation";
import type { RouteLibraryEntry } from "../../shared/types/route";
import { RouteCard } from "./RouteCard";
import { RouteCardExpanded } from "./RouteCardExpanded";
import { RouteQuickFocusCard } from "./RouteQuickFocusCard";
import { RouteFilterBar, applyRouteFilters, type RouteFilter } from "../routes/components/RouteFilterBar";
import type { RideConfig } from "./RideOptions";
import { createDefaultRideConfig } from "./defaultRideConfig";

type RouteSelectionMode = "focus" | "options";

interface Props {
  onStarted: () => void;
  onStartRide?: (routeId: string, routeName: string, config: RideConfig) => void;
  initialRouteId?: string | null;
  initialMode?: RouteSelectionMode;
}

export function PreRideScreen({ onStarted, onStartRide, initialRouteId, initialMode = "focus" }: Props) {
  const { sendMessage, status: wsStatus } = useWS();
  const routeLibrary = useRouteLibrary();
  const { settings: athleteSettings } = useAthleteSettings();
  const { kickrConnected } = useDeviceStatus();
  const { isFavorite, toggle: toggleFavorite, favorites } = useRouteFavorites();

  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteLibraryEntry | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteSelectionMode>(initialMode);
  const [activeFilters, setActiveFilters] = useState<Set<RouteFilter>>(new Set());
  const hasAppliedInitial = useRef(false);

  useEffect(() => {
    if (!hasAppliedInitial.current && initialRouteId && routeLibrary.length > 0) {
      const route = routeLibrary.find(r => r.id === initialRouteId);
      if (route) {
        setSelectedRoute(route);
        setSelectedMode(initialMode);
        hasAppliedInitial.current = true;
      }
    }
  }, [initialMode, initialRouteId, routeLibrary]);

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
    setSelectedMode("focus");
    setSelectedRoute(route);
  }, [routeLibrary]);

  const startRouteWithConfig = useCallback((route: RouteLibraryEntry, config: RideConfig) => {
    setLastRouteId(route.id);
    if (onStartRide) {
      onStartRide(route.id, route.name, { ...config, physicsMode: true });
    } else {
      sendMessage({
        type: "start_ride",
        route_id: route.id,
        reverse: config.reverse,
        cutout_start_m: config.cutoutStartM,
        cutout_end_m: config.cutoutEndM,
        laps: config.laps,
        ghost: config.ghost,
        warmup_s: config.warmup ? 120 : 0,
        cooldown_s: config.cooldown ? 120 : 0,
        erg_mode: config.ergMode,
        physics_mode: true,
      });
      onStarted();
    }
  }, [sendMessage, onStarted, onStartRide]);

  const handleStartWithConfig = useCallback((config: RideConfig) => {
    if (!selectedRoute) return;
    startRouteWithConfig(selectedRoute, config);
  }, [selectedRoute, startRouteWithConfig]);

  const handleStartDefault = useCallback(() => {
    if (!selectedRoute) return;
    startRouteWithConfig(selectedRoute, createDefaultRideConfig());
  }, [selectedRoute, startRouteWithConfig]);

  const handleShowOptions = useCallback(() => {
    setSelectedMode("options");
  }, []);

  const handleDelete = useCallback((routeId: string) => {
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
    sendMessage({ type: "delete_route", route_id: routeId });
  }, [sendMessage, selectedRoute]);

  const handleRename = useCallback((routeId: string, name: string) => {
    sendMessage({ type: "rename_route", route_id: routeId, name });
  }, [sendMessage]);

  const selectedRouteId = selectedRoute?.id ?? null;

  const filteredLibrary = applyRouteFilters(routeLibrary, activeFilters, favorites);
  const otherRoutes = filteredLibrary.filter(r => r.id !== selectedRouteId);

  const wsSearching = wsStatus === "connecting" || wsStatus === "reconnecting";
  const trainerSearching = !kickrConnected && (wsSearching || wsStatus === "connected");
  const importPanel = (
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
  );

  return (
    <div className="w-full h-full bg-[var(--bg)] flex flex-col overflow-hidden">
      <ScreenHeader right={
        <>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              kickrConnected
                ? "bg-[var(--success)] animate-pulse"
                : trainerSearching
                ? "bg-[var(--warning)] animate-pulse"
                : "bg-[var(--border)]"
            }`}
          />
          <p className={`text-xs ${kickrConnected ? "text-[var(--success)]" : "text-[var(--text-subtle)]"}`}>
            {kickrConnected ? "Trainer verbunden" : trainerSearching ? "Trainer wird gesucht" : "Trainer nicht verbunden"}
          </p>
        </>
      } />

      <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-8 pb-8 pt-6">
        <div className="h-full flex flex-col sm:flex-row min-h-0 gap-0 overflow-y-auto sm:overflow-hidden">
          {importPanel}

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
            ) : filteredLibrary.length === 0 && !selectedRoute ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-sm font-medium text-[var(--text)]">Keine passenden Strecken</span>
                <button type="button" onClick={() => setActiveFilters(new Set())} className="text-xs text-[var(--accent)] hover:underline cursor-pointer">Filter zurücksetzen</button>
              </div>
            ) : selectedRoute ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-5">
                {selectedMode === "options" ? (
                  <RouteCardExpanded
                    route={selectedRoute}
                    athleteSettings={athleteSettings}
                    onStart={handleStartWithConfig}
                    onClose={() => setSelectedRoute(null)}
                    onRename={handleRename}
                    isFavorite={isFavorite(selectedRoute.id)}
                    onToggleFavorite={toggleFavorite}
                  />
                ) : (
                  <RouteQuickFocusCard
                    route={selectedRoute}
                    athleteSettings={athleteSettings}
                    onStart={handleStartDefault}
                    onOptions={handleShowOptions}
                    onClose={() => setSelectedRoute(null)}
                  />
                )}
                {otherRoutes.length > 0 && (
                  <div className="min-h-0">
                    <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Weitere Strecken</p>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                      {otherRoutes.map(route => (
                        <RouteCard key={route.id} route={route} onLoad={handleSelectRoute} onDelete={handleDelete} onRename={handleRename} athleteSettings={athleteSettings} isSelected={false}
                          isFavorite={isFavorite(route.id)} onToggleFavorite={toggleFavorite} />
                      ))}
                    </div>
                  </div>
                )}
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
      </div>

    </div>
  );
}
