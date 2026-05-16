import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "../../shared/ws/useWS";
import { useWSSubscription } from "../../shared/ws/useWSSubscription";
import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import type { RideConfig } from "../pre-ride/RideOptions";
import type { RouteDataMessage, RouteErrorMessage } from "../../shared/types/route";
import type { MapViewMode } from "../ride/components/MiniMap";

interface Props {
  routeId: string;
  rideSessionId: string;
  routeName: string;
  config: RideConfig;
  viewMode: MapViewMode;
  onCycleCamera: () => void;
  onReady: () => void;
  onCancel: () => void;
}

type Stage = "preparing" | "countdown" | "error";

const COUNTDOWN_FROM = 3;

export function RideStartRitual({
  routeId,
  rideSessionId,
  routeName,
  config,
  viewMode,
  onCycleCamera,
  onReady,
  onCancel,
}: Props) {
  const { sendMessage, status } = useWS();
  const { kickrConnected } = useDeviceStatus();
  const [stage, setStage] = useState<Stage>("preparing");
  const [routeReady, setRouteReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const startedRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start setup paused; RideScreen's play button sends resume when the rider starts.
  useEffect(() => {
    if (startedRef.current) return;
    if (status !== "connected" && status !== "live") return;
    startedRef.current = true;
    sendMessage({
      type: "start_ride",
      route_id: routeId,
      ride_session_id: rideSessionId,
      reverse: config.reverse,
      cutout_start_m: config.cutoutStartM,
      cutout_end_m: config.cutoutEndM,
      laps: config.laps,
      ghost: config.ghost,
      warmup_s: config.warmup ? 120 : 0,
      cooldown_s: config.cooldown ? 120 : 0,
      erg_mode: config.ergMode,
      physics_mode: config.physicsMode,
      paused: true,
    });
    sendMessage({ type: "set_paused", paused: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useWSSubscription<RouteDataMessage>("route_data", useCallback((msg) => {
    if (msg.ride_session_id !== rideSessionId) return;
    if (msg.route_id !== routeId) return;
    setRouteReady(true);
  }, [routeId, rideSessionId]));

  useWSSubscription<RouteErrorMessage>("route_error", useCallback((msg) => {
    if (msg.ride_session_id && msg.ride_session_id !== rideSessionId) return;
    setErrorMsg(msg.message);
    setStage("error");
  }, [rideSessionId]));

  // Advance to countdown once route data arrives (trainer status is informational)
  useEffect(() => {
    if (stage === "preparing" && routeReady) {
      setStage("countdown");
      setCountdown(COUNTDOWN_FROM);
    }
  }, [stage, routeReady]);

  // Countdown tick
  useEffect(() => {
    if (stage !== "countdown") return;
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          onReadyRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [stage, sendMessage]);

  const handleCancel = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    sendMessage({ type: "end_ride" });
    onCancelRef.current();
  }, [sendMessage]);

  const cameraLabel = viewMode === "chase" ? "Chase" : viewMode === "follow" ? "Follow" : "Übersicht";

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      data-testid="ride-start-ritual"
      className={`fixed inset-0 z-[1800] flex flex-col items-center justify-center bg-[var(--bg)] ${
        prefersReducedMotion ? "" : "animate-in fade-in duration-300"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Fahrt wird vorbereitet"
    >
      {/* Route name */}
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-8">
        {routeName}
      </p>

      {stage === "error" ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[var(--surface)] border border-[var(--critical)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-[var(--text)]">Strecke konnte nicht geladen werden</p>
          {errorMsg && (
            <p className="text-[11px] text-[var(--text-muted)] max-w-[280px] text-center">{errorMsg}</p>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="mt-2 min-h-[44px] px-6 rounded-xl border border-[var(--border)] text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            Zurück
          </button>
        </div>
      ) : stage === "countdown" ? (
        <div className="flex flex-col items-center gap-8">
          {/* Big countdown number */}
          <div
            data-testid="countdown-number"
            className={`text-[120px] font-data font-bold tabular-nums leading-none text-[var(--text)] select-none ${
              prefersReducedMotion ? "" : "transition-all duration-700"
            }`}
            aria-live="assertive"
            aria-atomic="true"
          >
            {countdown}
          </div>

          {/* Trainer indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                kickrConnected ? "bg-[var(--success)] animate-pulse motion-reduce:animate-none" : "bg-[var(--warning)] animate-pulse motion-reduce:animate-none"
              }`}
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              {kickrConnected ? "Trainer bereit" : "Trainer wird gesucht"}
            </span>
          </div>

          <button
            type="button"
            data-testid="cancel-countdown"
            onClick={handleCancel}
            className="min-h-[44px] px-6 rounded-xl border border-[var(--border)] text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        /* Preparing stage */
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col gap-3 items-start min-w-[200px]">
            <StatusRow
              label="Strecke wird geladen"
              done={routeReady}
              loading={!routeReady}
            />
            <StatusRow
              label={kickrConnected ? "Trainer verbunden" : "Trainer wird gesucht"}
              done={kickrConnected}
              loading={!kickrConnected}
              warn={!kickrConnected}
            />
          </div>

          <button
            type="button"
            data-testid="cancel-preparing"
            onClick={handleCancel}
            className="mt-4 min-h-[44px] px-6 rounded-xl border border-[var(--border)] text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            Abbrechen
          </button>
        </div>
      )}

    </div>
  );
}

function StatusRow({
  label,
  done,
  loading,
  warn,
}: {
  label: string;
  done: boolean;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 flex items-center justify-center shrink-0">
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : warn ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse motion-reduce:animate-none" />
        ) : loading ? (
          <span className="w-3 h-3 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin motion-reduce:animate-none" />
        ) : null}
      </div>
      <span className={`text-[12px] ${done ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
        {label}
      </span>
    </div>
  );
}
