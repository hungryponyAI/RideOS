import { useState, useRef, useCallback, useEffect } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useRouteLibrary } from "../routes/hooks/useRouteLibrary";
import { useAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { useStravaStatus } from "../strava/hooks/useStravaStatus";
import { StravaConnectModal, type StravaModalStep } from "../strava/StravaConnectModal";
import type { RouteLibraryEntry } from "../../shared/types/route";
import { RouteCard } from "./RouteCard";
import { RouteCardExpanded } from "./RouteCardExpanded";
import type { RideConfig } from "./RideOptions";

interface Props {
  onStarted: () => void;
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export function PreRideScreen({ onStarted }: Props) {
  const { sendMessage } = useWS();
  const routeLibrary = useRouteLibrary();
  const { settings: athleteSettings } = useAthleteSettings();
  const { stravaStatus, stravaAuthUrl, stravaError, clearStravaAuthUrl, clearStravaError } = useStravaStatus();

  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteLibraryEntry | null>(null);

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
    setSelectedRoute(routeLibrary.find(r => r.id === routeId) ?? null);
  }, [routeLibrary]);

  const handleStartWithConfig = useCallback((config: RideConfig) => {
    if (!selectedRoute) return;
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
    });
    onStarted();
  }, [selectedRoute, sendMessage, onStarted]);

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
  const otherRoutes = routeLibrary.filter(r => r.id !== selectedRouteId);

  return (
    <div className="w-screen h-screen bg-[var(--bg)] flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center pt-6 pb-4 px-8 gap-6">
        <div className="flex flex-col items-start">
          <span className="font-condensed font-bold text-[48px] text-black bg-[#FFF200] px-5 py-0.5 inline-block leading-none">RIDEOS</span>
          <p className="text-[10px] font-condensed font-bold tracking-widest text-[var(--text-muted)] mt-2 uppercase">INDOOR CYCLING ENGINE</p>
        </div>
        {selectedRoute && (
          <div className="ml-auto flex items-center gap-2">
            {!isStravaConnected ? (
              <button type="button" onClick={handleOpenStravaModal} className="flex items-center gap-1.5 border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors">
                <StravaIcon size={10} /> MIT STRAVA VERBINDEN
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <StravaIcon size={10} />
                <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[#FC4C02]">{stravaStatus?.athleteName ?? "Strava"}</span>
                {isStravaSyncing && <span className="text-[9px] font-condensed text-[var(--text-muted)]">Syncing…</span>}
                <button type="button" onClick={handleStravaSync} disabled={isStravaSyncing} className="border border-[#FC4C02] text-[#FC4C02] font-condensed font-bold text-[9px] tracking-widest uppercase px-2 py-1 cursor-pointer disabled:opacity-40 hover:bg-[#FC4C02] hover:text-white transition-colors">SYNC</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-[2px] w-full bg-[#FFF200] shrink-0" />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-8 pb-8 pt-5 gap-5">
        {selectedRoute ? (
          <>
            <RouteCardExpanded route={selectedRoute} athleteSettings={athleteSettings} onStart={handleStartWithConfig} onClose={() => setSelectedRoute(null)} onRename={handleRename} />
            {otherRoutes.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">ANDERE STRECKEN</div>
                <div className="grid grid-cols-3 xl:grid-cols-4 gap-2">
                  {otherRoutes.map(route => (
                    <RouteCard key={route.id} route={route} onLoad={handleSelectRoute} onDelete={handleDelete} onRename={handleRename} athleteSettings={athleteSettings} isSelected={false} compact />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex min-h-0 gap-0">
            <div className="w-[300px] shrink-0 flex flex-col justify-center gap-4 pr-8">
              <div
                className={`flex flex-col items-center justify-center gap-3 border-2 p-8 cursor-pointer transition-colors ${dragging ? "border-[#FFF200] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface)]"}`}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".gpx" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} className="hidden" />
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"} aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className={`text-[11px] font-condensed font-bold tracking-widest uppercase text-center ${loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"}`}>
                  {loading ? "WIRD GELADEN…" : dragging ? "HIER ABLEGEN" : "GPX AUSWÄHLEN ODER ZIEHEN"}
                </span>
                {fileError && <span className="text-[10px] font-condensed font-bold text-[#E10600] text-center">{fileError}</span>}
              </div>

              <button type="button" disabled={loading} onClick={() => onStarted()} className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-8 py-3 border-0 disabled:opacity-40 cursor-pointer hover:bg-white transition-colors duration-150">OHNE STRECKE STARTEN</button>

              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                {!isStravaConnected ? (
                  <button type="button" onClick={handleOpenStravaModal} className="flex items-center justify-center gap-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-3 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors duration-150">
                    <StravaIcon size={12} /> MIT STRAVA VERBINDEN
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1">
                      <StravaIcon size={12} />
                      <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[#FC4C02]">{stravaStatus?.athleteName ?? "Strava verbunden"}</span>
                      {isStravaSyncing && <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-wide ml-auto">Syncing…</span>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleStravaSync} disabled={isStravaSyncing} className="flex-1 border border-[#FC4C02] text-[#FC4C02] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer disabled:opacity-40 hover:bg-[#FC4C02] hover:text-white transition-colors duration-150">{isStravaSyncing ? "LÄUFT…" : "SYNC"}</button>
                      <button type="button" onClick={handleStravaDisconnect} className="border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer hover:border-[#E10600] hover:text-[#E10600] transition-colors duration-150">TRENNEN</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="w-px bg-[var(--border)] shrink-0" />

            <div className="flex-1 min-w-0 flex flex-col pl-8">
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <span className="text-[11px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">MEINE STRECKEN</span>
                {routeLibrary.length > 0 && <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5">{routeLibrary.length}</span>}
              </div>
              {routeLibrary.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)] text-center">NOCH KEINE STRECKEN<br />GPX-DATEI HINZUFÜGEN</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {routeLibrary.map((route: RouteLibraryEntry) => (
                      <RouteCard key={route.id} route={route} onLoad={handleSelectRoute} onDelete={handleDelete} onRename={handleRename} athleteSettings={athleteSettings} isSelected={selectedRouteId === route.id} />
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
