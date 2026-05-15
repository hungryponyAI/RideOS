import { useState, useCallback, useEffect, useRef } from "react";
import type { RideSummaryData } from "../ride/RideScreen";
import { useWS } from "../../shared/ws/useWS";
import { useWSSubscription } from "../../shared/ws/useWSSubscription";

interface RideSummaryMsg {
  found: boolean;
  duration_s?: number | null;
  distance_m?: number | null;
  avg_power_w?: number | null;
  max_power_w?: number | null;
}

function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function narrativeInsight(
  reason: "completed" | "user_ended",
  ghostGap: number | null | undefined,
  avgPower: number | null | undefined,
): string {
  if (reason === "user_ended") return "Fahrt gestoppt und gespeichert.";
  if (ghostGap != null) {
    if (ghostGap < 0) return "Du bist vor dem Ghost ins Ziel gekommen.";
    if (ghostGap < 30) return "Knapp hinter dem Ghost – beim nächsten Mal schaffst du es.";
    return "Der Ghost war heute schneller. Bereit für die nächste Runde?";
  }
  if (avgPower != null && avgPower > 0) {
    return "Gute Arbeit. Schau dir deine Leistung an und plane das nächste Ziel.";
  }
  return "Strecke abgeschlossen. Erhol dich gut.";
}

interface MetricTileProps {
  value: string;
  label: string;
  accent?: boolean;
}

function MetricTile({ value, label, accent }: MetricTileProps) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 min-w-[80px]">
      <span className={`text-[16px] font-data font-bold tabular-nums ${accent ? "text-[var(--success)]" : "text-[var(--text)]"}`}>
        {value}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

interface Props {
  summaryData: RideSummaryData | null;
  onReturnHome: () => void;
  onRideAgain?: () => void;
}

export function RideSummaryScreen({ summaryData, onReturnHome, onRideAgain }: Props) {
  const { sendMessage, status } = useWS();
  const [backendSummary, setBackendSummary] = useState<RideSummaryMsg | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!requestedRef.current && (status === "connected" || status === "live")) {
      requestedRef.current = true;
      sendMessage({ type: "get_ride_summary" });
    }
  }, [status, sendMessage]);

  const handleSummaryMsg = useCallback((msg: RideSummaryMsg) => {
    setBackendSummary(msg);
  }, []);

  useWSSubscription<RideSummaryMsg>("ride_summary", handleSummaryMsg);

  const reason = summaryData?.reason ?? "completed";
  const isCompleted = reason === "completed";
  const elapsed = summaryData?.elapsed_s ?? null;
  const routeName = summaryData?.route_name ?? null;
  const distanceM = summaryData?.distance_m ?? backendSummary?.distance_m ?? null;
  const ghostGap = summaryData?.ghost_time_gap_s ?? null;
  const avgPower = backendSummary?.found ? (backendSummary.avg_power_w ?? null) : null;

  const insight = narrativeInsight(reason, ghostGap, avgPower);

  const hasMetrics = distanceM != null || avgPower != null || ghostGap != null;

  return (
    <div
      data-testid="summary-screen"
      className="w-full h-full flex flex-col bg-[var(--bg)] overflow-hidden"
    >
      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col items-center gap-6 px-6 py-10 max-w-[440px] mx-auto">

          {/* Status */}
          <div className="flex flex-col items-center gap-2">
            <svg
              width="28" height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[var(--accent)]"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {isCompleted ? (
                <>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </>
              ) : (
                <rect x="3" y="3" width="18" height="18" rx="2" />
              )}
            </svg>
            <span className="text-[10px] font-medium text-[var(--text-muted)] tracking-widest uppercase">
              {isCompleted ? "Strecke abgeschlossen" : "Fahrt beendet"}
            </span>
          </div>

          {/* Hero time */}
          {elapsed != null && (
            <div className="flex flex-col items-center gap-1">
              <span
                data-testid="summary-elapsed"
                className="text-[44px] font-data font-bold tabular-nums leading-none text-[var(--text)]"
              >
                {formatTime(elapsed)}
              </span>
              <span className="text-[10px] text-[var(--text-subtle)]">Fahrzeit</span>
            </div>
          )}

          {/* Route name */}
          {routeName && (
            <span
              data-testid="summary-route-name"
              className="text-sm font-medium text-[var(--text-muted)] text-center"
            >
              {routeName}
            </span>
          )}

          {/* Metrics */}
          {hasMetrics && (
            <div
              data-testid="summary-metrics"
              className="flex flex-row flex-wrap gap-2 justify-center w-full"
            >
              {distanceM != null && (
                <MetricTile
                  value={formatDistance(distanceM)}
                  label="Distanz"
                />
              )}
              {avgPower != null && (
                <MetricTile
                  value={`${Math.round(avgPower)} W`}
                  label="Ø Watt"
                />
              )}
              {ghostGap != null && (
                <MetricTile
                  value={ghostGap > 0 ? `+${Math.round(ghostGap)}s` : `${Math.round(ghostGap)}s`}
                  label="Ghost"
                  accent={ghostGap < 0}
                />
              )}
            </div>
          )}

          {/* Narrative insight */}
          <p
            data-testid="summary-insight"
            className="text-[11px] text-[var(--text-subtle)] text-center leading-relaxed max-w-[280px]"
          >
            {insight}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-2 px-6 pb-6 pt-3 border-t border-[var(--border)]">
        <div className="max-w-[440px] mx-auto w-full flex flex-col gap-2">
          {onRideAgain && (
            <button
              type="button"
              data-testid="ride-again-button"
              onClick={onRideAgain}
              className="w-full min-h-[44px] text-sm font-medium bg-[var(--accent)] text-white rounded-xl px-4 py-2 hover:opacity-90 transition-opacity duration-150 cursor-pointer"
            >
              Nochmal fahren →
            </button>
          )}
          <button
            type="button"
            data-testid="return-home-button"
            onClick={onReturnHome}
            className="w-full min-h-[44px] text-xs border border-[var(--border)] text-[var(--text-muted)] rounded-xl px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer"
          >
            Zur Startseite
          </button>
        </div>
      </div>
    </div>
  );
}
