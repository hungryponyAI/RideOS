import { memo, useMemo } from "react";
import type { RouteLibraryEntry } from "../../shared/types/route";
import type { AthleteSettings } from "../settings/hooks/useAthleteSettings";

interface Props {
  route: RouteLibraryEntry;
  athleteSettings: AthleteSettings;
  onStart: () => void;
  onOptions: () => void;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function estimateTimeS(distanceKm: number, elevationGainM: number, ftpW: number, weightKg: number, heightCm: number): number {
  const rho = 1.225, g = 9.81, crr = 0.004, hM = heightCm / 100;
  const cda = 0.0276 * Math.pow(hM, 0.725) * Math.pow(weightKg, 0.425) * 1.15;
  const avgGrade = distanceKm > 0 ? elevationGainM / (distanceKm * 1000) : 0;
  const power = ftpW * 0.88;
  let lo = 0.1, hi = 25.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const p = 0.5 * rho * cda * mid ** 3 + weightKg * g * (crr + avgGrade) * mid;
    if (p < power) lo = mid; else hi = mid;
  }
  return Math.round((distanceKm * 1000) / ((lo + hi) / 2));
}

function ElevationPreview({ thumbnail }: { thumbnail: number[] }) {
  if (thumbnail.length < 2) {
    return <div className="w-full h-full bg-[var(--surface)]" />;
  }

  const min = Math.min(...thumbnail), max = Math.max(...thumbnail), range = Math.max(max - min, 1), n = thumbnail.length;
  const pts = thumbnail.map((e, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${(100 - ((e - min) / range) * 88).toFixed(1)}`);
  const areaPath = `M0,100 L${pts.join(" L")} L1000,100 Z`;
  const linePath = `M${pts.join(" L")}`;

  return (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full block" aria-hidden="true">
      <path d={areaPath} fill="#74AFCB" fillOpacity="0.18" />
      <path d={linePath} fill="none" stroke="#74AFCB" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const RouteQuickFocusCard = memo(function RouteQuickFocusCard({
  route,
  athleteSettings,
  onStart,
  onOptions,
  onClose,
}: Props) {
  const estimatedTime = useMemo(
    () => estimateTimeS(route.distance_km, route.elevation_gain_m, athleteSettings.ftp_w, athleteSettings.weight_kg, athleteSettings.height_cm),
    [athleteSettings.ftp_w, athleteSettings.height_cm, athleteSettings.weight_kg, route.distance_km, route.elevation_gain_m],
  );
  const timeLabel = route.best_time_s !== null ? formatTime(route.best_time_s) : formatTime(estimatedTime);

  return (
    <div data-testid="route-quick-focus" className="flex flex-col bg-[var(--surface)] border border-[var(--accent)] rounded-xl overflow-hidden shadow-elevated animate-[oudena-screen-in_360ms_var(--ease-oudena)_both] motion-reduce:animate-none">
      <div className="h-[82px] shrink-0">
        <ElevationPreview thumbnail={route.elevation_thumbnail} />
      </div>
      <div className="px-4 py-3 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
              {route.strava_id && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="#FC4C02" aria-hidden="true">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
              )}
              <span className="text-sm font-semibold text-[var(--text)] truncate">{route.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{route.distance_km.toFixed(1)} km</span>
              <span className="text-[10px] text-[var(--text-subtle)]">·</span>
              <span className="text-[10px] text-[var(--text-muted)] tabular-nums">↑{route.elevation_gain_m} m</span>
              <span className="text-[10px] text-[var(--text-subtle)]">·</span>
              {route.best_time_s !== null ? (
                <>
                  <span className="text-[10px] text-[var(--success)]">Bestzeit</span>
                  <span className="text-[10px] font-data tabular-nums text-[var(--success)] ml-0.5">{timeLabel}</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-[var(--text-subtle)]">ca.</span>
                  <span className="text-[10px] font-data tabular-nums text-[var(--text-muted)] ml-0.5">{timeLabel}</span>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Auswahl aufheben" className="w-7 h-7 flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] cursor-pointer text-base transition-colors shrink-0">x</button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="quick-focus-start"
            onClick={onStart}
            className="flex-1 min-h-[42px] bg-[var(--accent)] text-white font-medium text-sm rounded-lg cursor-pointer hover:opacity-90 transition-opacity duration-150"
          >
            Jetzt fahren
          </button>
          <button
            type="button"
            data-testid="quick-focus-options"
            onClick={onOptions}
            className="min-h-[42px] px-3 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] text-xs font-medium rounded-lg cursor-pointer transition-colors duration-150"
          >
            Optionen
          </button>
        </div>
      </div>
    </div>
  );
});
