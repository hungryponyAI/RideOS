import { useState, useRef, useCallback, useEffect } from "react";
import type { OutgoingMessage, RouteLibraryEntry } from "../types/route";
import type { AthleteSettings } from "./SettingsPanel";
import type { StravaStatus } from "../hooks/useTelemetry";
import type { RideConfig } from "./RideOptions";
import { RouteCard } from "./RouteCard";
import { RouteCardExpanded } from "./RouteCardExpanded";

interface PreRideScreenProps {
  onStarted: () => void;
  sendMessage: (msg: OutgoingMessage | object) => boolean;
  routeLibrary: RouteLibraryEntry[];
  athleteSettings: AthleteSettings;
  stravaStatus: StravaStatus | null;
  stravaAuthUrl: string | null;
  onStravaAuthUrlConsumed: () => void;
  stravaError: string | null;
  onStravaErrorConsumed: () => void;
}

function extractCode(input: string): string {
  const match = input.match(/[?&]code=([^&\s]+)/);
  return match ? match[1] : input.trim();
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

type ModalStep = "idle" | "waiting_url" | "enter_code" | "connecting";

function StravaAuthModal({
  step, authUrl, error, onClose, onRequestUrl, onSubmitCode,
}: {
  step: ModalStep;
  authUrl: string | null;
  error: string | null;
  onClose: () => void;
  onRequestUrl: () => void;
  onSubmitCode: (code: string) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "enter_code") setTimeout(() => inputRef.current?.focus(), 50);
  }, [step]);

  const handleSubmit = () => {
    const code = extractCode(codeInput);
    if (code) onSubmitCode(code);
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg)] border border-[var(--border)] w-[480px] max-w-[90vw] p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#FC4C02]">
            <StravaIcon size={16} />
            <span className="font-condensed font-bold text-[13px] tracking-widest uppercase">
              Mit Strava verbinden
            </span>
          </div>
          <button type="button" onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer font-bold text-lg leading-none"
            aria-label="Schließen">×</button>
        </div>

        <div className={`flex flex-col gap-3 ${step === "enter_code" || step === "connecting" ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">1</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">Strava-Anmeldung öffnen</span>
              {step === "idle" && (
                <button type="button" onClick={onRequestUrl}
                  className="self-start bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-2 cursor-pointer hover:bg-[#e04400] transition-colors">
                  Strava öffnen →
                </button>
              )}
              {step === "waiting_url" && (
                <span className="text-[10px] font-condensed text-[var(--text-muted)] tracking-wide">Wird geladen…</span>
              )}
              {(step === "enter_code" || step === "connecting") && authUrl && (
                <button type="button" onClick={() => window.open(authUrl, "_blank")}
                  className="self-start border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-1.5 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors">
                  Nochmals öffnen
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`flex flex-col gap-3 ${step === "idle" || step === "waiting_url" ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">2</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">Code aus der URL einfügen</span>
              <p className="text-[10px] font-condensed text-[var(--text-muted)] leading-relaxed">
                Nach der Anmeldung erscheint der Code nach <code className="text-[var(--text)] bg-[var(--surface)] px-1">code=</code> in der URL.
              </p>
              <input
                ref={inputRef}
                type="text"
                placeholder="http://localhost/…?code=abc123 oder nur abc123"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-condensed text-[11px] px-3 py-2 focus:outline-none focus:border-[#FC4C02] placeholder:text-[var(--text-muted)]"
                disabled={step === "connecting"}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="text-[10px] font-condensed font-bold text-[#E10600] tracking-wide border border-[#E10600] px-3 py-2">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="font-condensed font-bold text-[11px] tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer px-4 py-2">
            Abbrechen
          </button>
          <button type="button" onClick={handleSubmit}
            disabled={step !== "enter_code" || !codeInput.trim()}
            className="bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-6 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e04400] transition-colors">
            {step === "connecting" ? "Verbinde…" : "Verbinden"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export function PreRideScreen({
  onStarted,
  sendMessage,
  routeLibrary,
  athleteSettings,
  stravaStatus,
  stravaAuthUrl,
  onStravaAuthUrlConsumed,
  stravaError,
  onStravaErrorConsumed,
}: PreRideScreenProps) {
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedRoute, setSelectedRoute] = useState<RouteLibraryEntry | null>(null);

  const [showStravaModal, setShowStravaModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("idle");
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (stravaAuthUrl && showStravaModal) {
      setModalStep("enter_code");
      window.open(stravaAuthUrl, "_blank");
      onStravaAuthUrlConsumed();
    }
  }, [stravaAuthUrl, showStravaModal, onStravaAuthUrlConsumed]);

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
      onStravaErrorConsumed();
    }
  }, [stravaError, showStravaModal, onStravaErrorConsumed]);

  const handleOpenStravaModal = () => { setShowStravaModal(true); setModalStep("idle"); setModalError(null); };
  const handleCloseStravaModal = () => { setShowStravaModal(false); setModalStep("idle"); setModalError(null); };
  const handleRequestAuthUrl = () => { setModalStep("waiting_url"); sendMessage({ type: "strava_get_auth_url" }); };
  const handleSubmitCode = (code: string) => { setModalStep("connecting"); setModalError(null); sendMessage({ type: "strava_submit_code", code }); };
  const handleStravaSync = () => sendMessage({ type: "strava_sync" });
  const handleStravaDisconnect = () => sendMessage({ type: "strava_disconnect" });

  const loadFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      setFileError("Keine .gpx-Datei ausgewählt");
      return;
    }
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleSelectRoute = useCallback((routeId: string) => {
    const route = routeLibrary.find(r => r.id === routeId) ?? null;
    setSelectedRoute(route);
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

  const selectedRouteId: string | null = selectedRoute !== null ? selectedRoute.id : null;
  const otherRoutes = routeLibrary.filter(r => r.id !== selectedRouteId);

  return (
    <div className="w-screen h-screen bg-[var(--bg)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center pt-6 pb-4 px-8 gap-6">
        <div className="flex flex-col items-start">
          <span className="font-condensed font-bold text-[48px] text-black bg-[#FFF200] px-5 py-0.5 inline-block leading-none">
            RIDEOS
          </span>
          <p className="text-[10px] font-condensed font-bold tracking-widest text-[var(--text-muted)] mt-2 uppercase">
            INDOOR CYCLING ENGINE
          </p>
        </div>

        {/* Strava in header when route is selected */}
        {selectedRoute && (
          <div className="ml-auto flex items-center gap-2">
            {!isStravaConnected ? (
              <button type="button" onClick={handleOpenStravaModal}
                className="flex items-center gap-1.5 border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors">
                <StravaIcon size={10} /> MIT STRAVA VERBINDEN
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <StravaIcon size={10} />
                <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[#FC4C02]">
                  {stravaStatus?.athleteName ?? "Strava"}
                </span>
                {isStravaSyncing && (
                  <span className="text-[9px] font-condensed text-[var(--text-muted)]">Syncing…</span>
                )}
                <button type="button" onClick={handleStravaSync} disabled={isStravaSyncing}
                  className="border border-[#FC4C02] text-[#FC4C02] font-condensed font-bold text-[9px] tracking-widest uppercase px-2 py-1 cursor-pointer disabled:opacity-40 hover:bg-[#FC4C02] hover:text-white transition-colors">
                  SYNC
                </button>
              </div>
            )}
          </div>
        )}

        <div className={`h-[2px] w-full bg-[#FFF200] ${selectedRoute ? "hidden" : ""}`} style={selectedRoute ? {} : { position: 'absolute', bottom: 0, left: 32, right: 32 }} />
      </div>

      <div className="h-[2px] w-full bg-[#FFF200] shrink-0 mx-0" />

      {/* Main area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-8 pb-8 pt-5 gap-5">

        {selectedRoute ? (
          /* ── ROUTE SELECTED: expanded card + remaining grid ─────────── */
          <>
            <RouteCardExpanded
              route={selectedRoute}
              athleteSettings={athleteSettings}
              onStart={handleStartWithConfig}
              onClose={() => setSelectedRoute(null)}
              onRename={handleRename}
            />

            {otherRoutes.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">
                  ANDERE STRECKEN
                </div>
                <div className="grid grid-cols-3 xl:grid-cols-4 gap-2">
                  {otherRoutes.map(route => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      onLoad={handleSelectRoute}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      athleteSettings={athleteSettings}
                      isSelected={false}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── NO SELECTION: two-column layout ──────────────────────────── */
          <div className="flex-1 flex min-h-0 gap-0">
            {/* Left: upload + strava */}
            <div className="w-[300px] shrink-0 flex flex-col justify-center gap-4 pr-8">
              <div
                className={`flex flex-col items-center justify-center gap-3 border-2 p-8 cursor-pointer transition-colors ${
                  dragging ? "border-[#FFF200] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface)]"
                }`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".gpx"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
                  className="hidden" />
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"} aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className={`text-[11px] font-condensed font-bold tracking-widest uppercase text-center ${loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"}`}>
                  {loading ? "WIRD GELADEN…" : dragging ? "HIER ABLEGEN" : "GPX AUSWÄHLEN ODER ZIEHEN"}
                </span>
                {fileError && (
                  <span className="text-[10px] font-condensed font-bold text-[#E10600] text-center">{fileError}</span>
                )}
              </div>

              <button type="button" disabled={loading} onClick={() => onStarted()}
                className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-8 py-3 border-0 disabled:opacity-40 cursor-pointer hover:bg-white transition-colors duration-150">
                OHNE STRECKE STARTEN
              </button>

              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                {!isStravaConnected ? (
                  <button type="button" onClick={handleOpenStravaModal}
                    className="flex items-center justify-center gap-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-3 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors duration-150">
                    <StravaIcon size={12} /> MIT STRAVA VERBINDEN
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1">
                      <StravaIcon size={12} />
                      <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[#FC4C02]">
                        {stravaStatus?.athleteName ?? "Strava verbunden"}
                      </span>
                      {isStravaSyncing && (
                        <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-wide ml-auto">Syncing…</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleStravaSync} disabled={isStravaSyncing}
                        className="flex-1 border border-[#FC4C02] text-[#FC4C02] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer disabled:opacity-40 hover:bg-[#FC4C02] hover:text-white transition-colors duration-150">
                        {isStravaSyncing ? "LÄUFT…" : "SYNC"}
                      </button>
                      <button type="button" onClick={handleStravaDisconnect}
                        className="border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer hover:border-[#E10600] hover:text-[#E10600] transition-colors duration-150">
                        TRENNEN
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-[var(--border)] shrink-0" />

            {/* Right: route library */}
            <div className="flex-1 min-w-0 flex flex-col pl-8">
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <span className="text-[11px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">
                  MEINE STRECKEN
                </span>
                {routeLibrary.length > 0 && (
                  <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5">
                    {routeLibrary.length}
                  </span>
                )}
              </div>

              {routeLibrary.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)] text-center">
                    NOCH KEINE STRECKEN<br />GPX-DATEI HINZUFÜGEN
                  </span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {routeLibrary.map((route: RouteLibraryEntry) => (
                      <RouteCard
                        key={route.id}
                        route={route}
                        onLoad={handleSelectRoute}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        athleteSettings={athleteSettings}
                        isSelected={selectedRouteId === route.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showStravaModal && (
        <StravaAuthModal
          step={modalStep}
          authUrl={stravaAuthUrl}
          error={modalError}
          onClose={handleCloseStravaModal}
          onRequestUrl={handleRequestAuthUrl}
          onSubmitCode={handleSubmitCode}
        />
      )}
    </div>
  );
}
