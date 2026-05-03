import { useState, useRef, useCallback, useEffect } from "react";
import type { OutgoingMessage, RouteLibraryEntry } from "../types/route";
import type { AthleteSettings } from "./SettingsPanel";
import type { StravaStatus } from "../hooks/useTelemetry";
import { RouteCard } from "./RouteCard";

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
  step,
  authUrl,
  error,
  onClose,
  onRequestUrl,
  onSubmitCode,
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
    if (step === "enter_code") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#FC4C02]">
            <StravaIcon size={16} />
            <span className="font-condensed font-bold text-[13px] tracking-widest uppercase">
              Mit Strava verbinden
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer font-bold text-lg leading-none"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {/* Step 1: open browser */}
        <div className={`flex flex-col gap-3 ${step === "enter_code" || step === "connecting" ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">1</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">
                Strava-Anmeldung öffnen
              </span>
              {step === "idle" && (
                <button
                  type="button"
                  onClick={onRequestUrl}
                  className="self-start bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-2 cursor-pointer hover:bg-[#e04400] transition-colors"
                >
                  Strava öffnen →
                </button>
              )}
              {step === "waiting_url" && (
                <span className="text-[10px] font-condensed text-[var(--text-muted)] tracking-wide">Wird geladen…</span>
              )}
              {(step === "enter_code" || step === "connecting") && authUrl && (
                <button
                  type="button"
                  onClick={() => window.open(authUrl, "_blank")}
                  className="self-start border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-1.5 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors"
                >
                  Nochmals öffnen
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: paste code */}
        <div className={`flex flex-col gap-3 ${step === "idle" || step === "waiting_url" ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#FC4C02] text-white font-condensed font-bold text-[10px] flex items-center justify-center">2</span>
            <div className="flex flex-col gap-2 flex-1">
              <span className="font-condensed font-bold text-[11px] tracking-wide text-[var(--text)] uppercase">
                Code aus der URL einfügen
              </span>
              <p className="text-[10px] font-condensed text-[var(--text-muted)] leading-relaxed">
                Nach der Strava-Anmeldung leitet dich die Seite auf <code className="text-[var(--text)] bg-[var(--surface)] px-1">localhost</code> weiter — die Seite lädt nicht, aber die URL enthält den Code. Kopiere die gesamte URL oder nur den Wert nach <code className="text-[var(--text)] bg-[var(--surface)] px-1">code=</code>.
              </p>
              <input
                ref={inputRef}
                type="text"
                placeholder="http://localhost/exchange_token?…code=abc123… oder nur abc123"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-condensed text-[11px] px-3 py-2 focus:outline-none focus:border-[#FC4C02] placeholder:text-[var(--text-muted)]"
                disabled={step === "connecting"}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[10px] font-condensed font-bold text-[#E10600] tracking-wide border border-[#E10600] px-3 py-2">
            {error}
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="font-condensed font-bold text-[11px] tracking-widest uppercase text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer px-4 py-2"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={step !== "enter_code" || !codeInput.trim()}
            className="bg-[#FC4C02] text-white font-condensed font-bold text-[11px] tracking-widest uppercase px-6 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e04400] transition-colors"
          >
            {step === "connecting" ? "Verbinde…" : "Verbinden"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ghost picker ──────────────────────────────────────────────────────────

type GhostValue = "none" | "estimated" | string; // string = strava_id

function formatActivityDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface GhostOption {
  value: GhostValue;
  label: string;
  subtitle?: string;
}

function GhostPicker({
  selected,
  selectedRoute,
  routeLibrary,
  onChange,
}: {
  selected: GhostValue;
  selectedRoute: RouteLibraryEntry;
  routeLibrary: RouteLibraryEntry[];
  onChange: (v: GhostValue) => void;
}) {
  const options: GhostOption[] = [
    { value: "none", label: "Kein Ghost" },
    {
      value: "estimated",
      label: "Geschätzte Pace",
      subtitle: selectedRoute.moving_time_s
        ? formatDuration(selectedRoute.moving_time_s)
        : undefined,
    },
  ];

  if (selectedRoute.strava_id) {
    options.push({
      value: selectedRoute.strava_id,
      label: "Diese Fahrt",
      subtitle: formatActivityDate(selectedRoute.activity_date),
    });
  }

  const others = routeLibrary.filter(
    (r) => r.strava_id && r.id !== selectedRoute.id,
  );
  others.forEach((r) => {
    options.push({
      value: r.strava_id!,
      label: r.name,
      subtitle: formatActivityDate(r.activity_date),
    });
  });

  return (
    <div className="flex flex-col gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-2.5 px-3 py-2 text-left border transition-colors duration-100 cursor-pointer ${
            selected === opt.value
              ? "border-[#FFF200] bg-[var(--surface)]"
              : "border-[var(--border)] bg-transparent hover:border-[var(--text-muted)]"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full border-2 shrink-0 ${
              selected === opt.value
                ? "border-[#FFF200] bg-[#FFF200]"
                : "border-[var(--text-muted)] bg-transparent"
            }`}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-condensed font-bold tracking-wide text-[var(--text)] truncate">
              {opt.label}
            </span>
            {opt.subtitle && (
              <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-wide">
                {opt.subtitle}
              </span>
            )}
          </div>
        </button>
      ))}
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
  const [ghostValue, setGhostValue] = useState<GhostValue>("none");

  const [showStravaModal, setShowStravaModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("idle");
  const [modalError, setModalError] = useState<string | null>(null);

  // When the engine sends back the auth URL, show it and advance the modal step.
  useEffect(() => {
    if (stravaAuthUrl && showStravaModal) {
      setModalStep("enter_code");
      window.open(stravaAuthUrl, "_blank");
      onStravaAuthUrlConsumed();
    }
  }, [stravaAuthUrl, showStravaModal, onStravaAuthUrlConsumed]);

  // When strava connects successfully, close the modal.
  useEffect(() => {
    if (stravaStatus?.connected && modalStep === "connecting") {
      setShowStravaModal(false);
      setModalStep("idle");
      setModalError(null);
    }
  }, [stravaStatus, modalStep]);

  // When engine sends a strava_error, surface it in the modal.
  useEffect(() => {
    if (stravaError && showStravaModal) {
      setModalError(stravaError);
      setModalStep("enter_code");
      onStravaErrorConsumed();
    }
  }, [stravaError, showStravaModal, onStravaErrorConsumed]);

  const handleOpenStravaModal = () => {
    setShowStravaModal(true);
    setModalStep("idle");
    setModalError(null);
  };

  const handleCloseStravaModal = () => {
    setShowStravaModal(false);
    setModalStep("idle");
    setModalError(null);
  };

  const handleRequestAuthUrl = () => {
    setModalStep("waiting_url");
    sendMessage({ type: "strava_get_auth_url" });
  };

  const handleSubmitCode = (code: string) => {
    setModalStep("connecting");
    setModalError(null);
    sendMessage({ type: "strava_submit_code", code });
  };

  const handleStravaSync = () => {
    sendMessage({ type: "strava_sync" });
  };

  const handleStravaDisconnect = () => {
    sendMessage({ type: "strava_disconnect" });
  };

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
      if (!sent) {
        setFileError("Keine Verbindung zur Engine — ist sie gestartet?");
        setLoading(false);
        return;
      }
      onStarted();
    };
    reader.onerror = () => {
      setFileError("Datei konnte nicht gelesen werden");
      setLoading(false);
    };
    reader.readAsText(file);
  }, [sendMessage, onStarted]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleSelectRoute = useCallback((routeId: string) => {
    const route = routeLibrary.find((r) => r.id === routeId) ?? null;
    setSelectedRoute(route);
    setGhostValue("none");
  }, [routeLibrary]);

  const handleStartWithRoute = useCallback(() => {
    if (!selectedRoute) return;
    sendMessage({ type: "load_saved_route", route_id: selectedRoute.id });
    if (ghostValue === "none") {
      sendMessage({ type: "set_ghost", mode: "none" });
    } else if (ghostValue === "estimated") {
      sendMessage({ type: "set_ghost", mode: "estimated" });
    } else {
      sendMessage({ type: "set_ghost", mode: "strava", strava_id: ghostValue });
    }
    onStarted();
  }, [selectedRoute, ghostValue, sendMessage, onStarted]);

  const handleDelete = useCallback((routeId: string) => {
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
    sendMessage({ type: "delete_route", route_id: routeId });
  }, [sendMessage, selectedRoute]);

  const handleRename = useCallback((routeId: string, name: string) => {
    sendMessage({ type: "rename_route", route_id: routeId, name });
  }, [sendMessage]);

  const isStravaConnected = stravaStatus?.connected ?? false;
  const isStravaSyncing = stravaStatus?.syncing ?? false;

  return (
    <div className="w-screen h-screen bg-[var(--bg)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex flex-col items-center pt-8 pb-6 px-8">
        <span className="font-condensed font-bold text-[56px] text-black bg-[#FFF200] px-6 py-1 inline-block leading-none">
          RIDEOS
        </span>
        <p className="text-[11px] font-condensed font-bold tracking-widest text-[var(--text-muted)] mt-3 uppercase">
          INDOOR CYCLING ENGINE
        </p>
        <div className="h-[2px] w-full max-w-4xl bg-[#FFF200] mt-5" />
      </div>

      {/* Main two-column area */}
      <div className="flex-1 flex min-h-0 px-8 pb-8 gap-0">

        {/* Left: context-sensitive — ghost picker when route selected, else upload+strava */}
        <div className="w-[320px] shrink-0 flex flex-col justify-center gap-4 pr-8">
          {selectedRoute ? (
            <>
              {/* Selected route summary */}
              <div className="border border-[#FFF200] px-3 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {selectedRoute.strava_id && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="#FC4C02" aria-hidden="true">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                    </svg>
                  )}
                  <span className="text-[13px] font-condensed font-bold text-[var(--text)] truncate">
                    {selectedRoute.name}
                  </span>
                </div>
                <span className="text-[10px] font-condensed text-[var(--text-muted)] tracking-wide">
                  {selectedRoute.distance_km.toFixed(1)} km · ↑{selectedRoute.elevation_gain_m} m
                </span>
              </div>

              {/* Ghost picker */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">
                  GHOST AUSWÄHLEN
                </span>
                <GhostPicker
                  selected={ghostValue}
                  selectedRoute={selectedRoute}
                  routeLibrary={routeLibrary}
                  onChange={setGhostValue}
                />
              </div>

              {/* Action buttons */}
              <button
                type="button"
                onClick={handleStartWithRoute}
                className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-8 py-3 cursor-pointer hover:bg-white transition-colors duration-150"
              >
                STARTEN
              </button>
              <button
                type="button"
                onClick={() => setSelectedRoute(null)}
                className="border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-2 cursor-pointer hover:border-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150"
              >
                AUSWAHL AUFHEBEN
              </button>
            </>
          ) : (
            <>
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
                  className="hidden"
                />
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

              <button
                type="button"
                disabled={loading}
                onClick={() => onStarted()}
                className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-8 py-3 border-0 disabled:opacity-40 cursor-pointer hover:bg-white transition-colors duration-150"
              >
                OHNE STRECKE STARTEN
              </button>

              {/* Strava section */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
                {!isStravaConnected ? (
                  <button
                    type="button"
                    onClick={handleOpenStravaModal}
                    className="flex items-center justify-center gap-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] font-condensed font-bold text-[11px] tracking-widest uppercase px-4 py-3 cursor-pointer hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors duration-150"
                  >
                    <StravaIcon size={12} />
                    MIT STRAVA VERBINDEN
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1">
                      <StravaIcon size={12} />
                      <span className="text-[10px] font-condensed font-bold tracking-widest uppercase text-[#FC4C02]">
                        {stravaStatus?.athleteName ?? "Strava verbunden"}
                      </span>
                      {isStravaSyncing && (
                        <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-wide ml-auto">
                          Syncing…
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleStravaSync}
                        disabled={isStravaSyncing}
                        className="flex-1 border border-[#FC4C02] text-[#FC4C02] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer disabled:opacity-40 hover:bg-[#FC4C02] hover:text-white transition-colors duration-150"
                      >
                        {isStravaSyncing ? "LÄUFT…" : "SYNC"}
                      </button>
                      <button
                        type="button"
                        onClick={handleStravaDisconnect}
                        className="border border-[var(--border)] text-[var(--text-muted)] font-condensed font-bold text-[10px] tracking-widest uppercase px-3 py-2 cursor-pointer hover:border-[#E10600] hover:text-[#E10600] transition-colors duration-150"
                      >
                        TRENNEN
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Vertical divider */}
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
                {routeLibrary.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onLoad={handleSelectRoute}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    athleteSettings={athleteSettings}
                    isSelected={selectedRoute?.id === route.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strava auth modal */}
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
