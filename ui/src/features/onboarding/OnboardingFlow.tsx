import { useEffect, useState } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import { useStravaStatus } from "../strava/hooks/useStravaStatus";
import { useRouteLibrary } from "../routes/hooks/useRouteLibrary";
import { StravaConnectModal, type StravaModalStep } from "../strava/StravaConnectModal";
import type { OnboardingStep } from "./useOnboarding";

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-200 ${
            i === current
              ? "w-4 h-1.5 bg-[var(--accent)]"
              : i < current
              ? "w-1.5 h-1.5 bg-[var(--accent)]/40"
              : "w-1.5 h-1.5 bg-[var(--border)]"
          }`}
        />
      ))}
    </div>
  );
}

function TrainerStatus({ connected, searching }: { connected: boolean; searching: boolean }) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
        <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
        <span className="text-sm font-medium text-[var(--success)]">Trainer verbunden</span>
      </div>
    );
  }
  if (searching) {
    return (
      <div className="flex items-center gap-2 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
        <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse shrink-0" />
        <span className="text-sm font-medium text-[var(--warning)]">Trainer wird gesucht…</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
      <span className="w-2 h-2 rounded-full bg-[var(--critical)] shrink-0" />
      <span className="text-sm font-medium text-[var(--text-muted)]">Trainer nicht verbunden</span>
    </div>
  );
}

interface Props {
  step: OnboardingStep;
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onComplete: () => void;
}

export function OnboardingFlow({ step, stepIndex, totalSteps, onAdvance, onComplete }: Props) {
  const { sendMessage, status } = useWS();
  const { kickrConnected } = useDeviceStatus();
  const routeLibrary = useRouteLibrary();
  const { stravaStatus, stravaAuthUrl, stravaError, clearStravaAuthUrl, clearStravaError } = useStravaStatus();

  const [showStravaModal, setShowStravaModal] = useState(false);
  const [stravaModalStep, setStravaModalStep] = useState<StravaModalStep>("idle");
  const [stravaModalError, setStravaModalError] = useState<string | null>(null);

  const wsSearching = status === "connecting" || status === "reconnecting";
  const trainerSearching = !kickrConnected && (wsSearching || status === "connected");
  const isStravaConnected = stravaStatus?.connected ?? false;
  const isLastStep = stepIndex === totalSteps - 1;

  useEffect(() => {
    if (stravaAuthUrl && showStravaModal) {
      setStravaModalStep("enter_code");
      window.open(stravaAuthUrl, "_blank");
      clearStravaAuthUrl();
    }
  }, [stravaAuthUrl, showStravaModal, clearStravaAuthUrl]);

  useEffect(() => {
    if (isStravaConnected && stravaModalStep === "connecting") {
      setShowStravaModal(false);
      setStravaModalStep("idle");
      setStravaModalError(null);
    }
  }, [isStravaConnected, stravaModalStep]);

  useEffect(() => {
    if (stravaError && showStravaModal) {
      setStravaModalError(stravaError);
      setStravaModalStep("enter_code");
      clearStravaError();
    }
  }, [stravaError, showStravaModal, clearStravaError]);

  const handleOpenStrava = () => {
    setShowStravaModal(true);
    setStravaModalStep("idle");
    setStravaModalError(null);
  };

  const handleCloseStrava = () => {
    setShowStravaModal(false);
    setStravaModalStep("idle");
    setStravaModalError(null);
  };

  return (
    <div
      data-testid="onboarding-flow"
      className="fixed inset-0 z-[2000] bg-[var(--bg)] flex flex-col items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Einführung"
    >
      <div className="w-full max-w-sm flex flex-col gap-8">
        <ProgressDots total={totalSteps} current={stepIndex} />

        {step === "welcome" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold text-[var(--text)] leading-tight">
              Willkommen bei OUDENA
            </h1>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Dein ruhiges Indoor-Cycling-Studio. Verbinde deinen Trainer, lade eine Strecke und fahr los.
            </p>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Diese Einführung dauert weniger als eine Minute.
            </p>
          </div>
        )}

        {step === "trainer" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-[var(--text)]">Trainer-Verbindung</h2>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              OUDENA verbindet sich automatisch mit deinem Wahoo KICKR. Starte die Engine, falls du es noch nicht getan hast.
            </p>
            <TrainerStatus connected={kickrConnected} searching={trainerSearching} />
            {!kickrConnected && (
              <p className="text-xs text-[var(--text-subtle)]">
                Du kannst auch ohne Trainer-Verbindung weitermachen und dich später verbinden.
              </p>
            )}
          </div>
        )}

        {step === "strava" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-[var(--text)]">Strava verbinden</h2>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              Importiere deine Strava-Strecken direkt in OUDENA.
            </p>
            {isStravaConnected ? (
              <div className="flex items-center gap-2 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
                <span className="text-sm font-medium text-[var(--success)]">
                  Strava verbunden{stravaStatus?.athleteName ? ` · ${stravaStatus.athleteName}` : ""}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenStrava}
                className="self-start flex items-center gap-2 bg-[#FC4C02] text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer hover:bg-[#e04400] transition-colors duration-150"
              >
                Mit Strava verbinden
              </button>
            )}
          </div>
        )}

        {step === "route" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-[var(--text)]">
              {routeLibrary.length > 0 ? "Bereit zum Fahren" : "Strecken importieren"}
            </h2>
            {routeLibrary.length > 0 ? (
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {routeLibrary.length === 1
                  ? "1 Strecke ist bereit."
                  : `${routeLibrary.length} Strecken sind bereit.`}{" "}
                Wähle auf der nächsten Seite deine erste Fahrt aus.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  Ziehe eine GPX-Datei auf die Startseite oder verbinde Strava, um Strecken zu importieren.
                </p>
                <p className="text-xs text-[var(--text-subtle)]">
                  Du kannst auch ohne Strecke starten.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {step === "strava" && !isStravaConnected && (
            <button
              type="button"
              onClick={onAdvance}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer py-2"
            >
              Strava später verbinden
            </button>
          )}

          {step === "trainer" && !kickrConnected && (
            <button
              type="button"
              onClick={onAdvance}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer py-2"
            >
              Später verbinden
            </button>
          )}

          {step !== "strava" && step !== "trainer" && <span />}
          {step === "strava" && isStravaConnected && <span />}
          {step === "trainer" && kickrConnected && <span />}

          <button
            type="button"
            onClick={isLastStep ? onComplete : onAdvance}
            className="bg-[var(--accent)] text-[var(--bg)] text-sm font-medium px-6 py-2.5 rounded-lg cursor-pointer hover:opacity-90 transition-opacity duration-150 min-w-[100px] text-center"
          >
            {isLastStep ? "Los gehts" : "Weiter"}
          </button>
        </div>
      </div>

      {showStravaModal && (
        <StravaConnectModal
          step={stravaModalStep}
          authUrl={stravaAuthUrl}
          error={stravaModalError}
          onClose={handleCloseStrava}
          onRequestUrl={() => {
            setStravaModalStep("waiting_url");
            sendMessage({ type: "strava_get_auth_url" });
          }}
          onSubmitCode={(code) => {
            setStravaModalStep("connecting");
            setStravaModalError(null);
            sendMessage({ type: "strava_submit_code", code });
          }}
        />
      )}
    </div>
  );
}
