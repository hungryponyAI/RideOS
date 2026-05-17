import { useCallback } from "react";
import { ScreenHeader } from "../../shared/ui/ScreenHeader";
import { useOptionalProfileContext } from "../profiles/useProfileContext";
import { useRouteLibrary } from "../routes/hooks/useRouteLibrary";
import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import { useAthleteSettings } from "../settings/hooks/useAthleteSettings";
import { useHomeRecommendation, setLastRouteId, type RecommendReason } from "./hooks/useHomeRecommendation";
import type { RouteLibraryEntry } from "../../shared/types/route";
import type { AthleteSettings } from "../settings/hooks/useAthleteSettings";

interface Props {
  onOpenRoutes: (preSelectId?: string) => void;
  onOpenDevices: () => void;
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

const REASON_LABELS: Record<RecommendReason, string> = {
  last_selected: "Zuletzt gefahren",
  recent: "Neue Strecke",
  ridden: "Deine Bestzeit",
  first: "Empfohlen",
};

function HeroElevation({ thumbnail }: { thumbnail: number[] }) {
  if (thumbnail.length < 2) return <div className="w-full h-full bg-[var(--surface)]" />;
  const min = Math.min(...thumbnail), max = Math.max(...thumbnail), range = Math.max(max - min, 1), n = thumbnail.length;
  const pts = thumbnail.map((e, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${(100 - ((e - min) / range) * 88).toFixed(1)}`);
  const areaPath = `M0,100 L${pts.join(" L")} L1000,100 Z`;
  const linePath = `M${pts.join(" L")}`;
  return (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full block">
      <path d={areaPath} fill="#74AFCB" fillOpacity="0.18" />
      <path d={linePath} fill="none" stroke="#74AFCB" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface HeroProps {
  route: RouteLibraryEntry;
  reason: RecommendReason;
  athleteSettings: AthleteSettings;
  onStart: (routeId: string) => void;
}

function HeroCard({ route, reason, athleteSettings, onStart }: HeroProps) {
  const estTime = estimateTimeS(route.distance_km, route.elevation_gain_m, athleteSettings.ftp_w, athleteSettings.weight_kg, athleteSettings.height_cm);
  return (
    <div data-testid="hero-recommendation" className="flex flex-col bg-[var(--surface)] border border-[var(--accent)] rounded-xl overflow-hidden shadow-elevated">
      <div className="h-[88px] shrink-0">
        <HeroElevation thumbnail={route.elevation_thumbnail} />
      </div>
      <div className="px-4 py-3 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
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
                  <span className="text-[10px] font-data tabular-nums text-[var(--success)] ml-0.5">{formatTime(route.best_time_s)}</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-[var(--text-subtle)]">ca.</span>
                  <span className="text-[10px] font-data tabular-nums text-[var(--text-muted)] ml-0.5">{formatTime(estTime)}</span>
                </>
              )}
            </div>
          </div>
          <span className="text-[9px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5 shrink-0 uppercase tracking-wider whitespace-nowrap">
            {REASON_LABELS[reason]}
          </span>
        </div>
        <button
          type="button"
          data-testid="hero-start-btn"
          onClick={() => onStart(route.id)}
          className="w-full min-h-[44px] bg-[var(--accent)] text-white font-medium text-sm rounded-lg cursor-pointer hover:opacity-90 transition-opacity duration-150"
        >
          Jetzt fahren →
        </button>
      </div>
    </div>
  );
}

function CompactRouteCard({ route, onClick }: { route: RouteLibraryEntry; onClick: () => void }) {
  const thumb = route.elevation_thumbnail;
  const hasThumb = thumb.length >= 2;
  const svgContent = hasThumb ? (() => {
    const n = thumb.length;
    const minE = Math.min(...thumb), maxE = Math.max(...thumb), range = Math.max(maxE - minE, 1);
    const pts = thumb.map((e, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${(100 - ((e - minE) / range) * 82).toFixed(1)}`);
    return { area: `M0,100 L${pts.join(" L")} L1000,100 Z`, line: `M${pts.join(" L")}` };
  })() : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-colors duration-150 text-left w-full"
    >
      <div className="h-[28px] shrink-0">
        {svgContent ? (
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full block">
            <path d={svgContent.area} fill="#74AFCB" fillOpacity="0.12" />
            <path d={svgContent.line} fill="none" stroke="#74AFCB" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="w-full h-full bg-[var(--border)]" />
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-medium text-[var(--text)] leading-tight truncate">{route.name}</p>
        <p className="text-[9px] text-[var(--text-muted)] tabular-nums mt-0.5">{route.distance_km.toFixed(1)} km · ↑{route.elevation_gain_m} m</p>
      </div>
    </button>
  );
}

function EmptyState({ onOpenRoutes, onOpenDevices, kickrConnected }: { onOpenRoutes: () => void; onOpenDevices: () => void; kickrConnected: boolean }) {
  return (
    <div data-testid="home-empty-state" className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-base font-semibold text-[var(--text)]">Willkommen bei OUDENA</span>
        <span className="text-xs text-[var(--text-subtle)] max-w-[260px]">Verbinde deinen Trainer, importiere eine Strecke und starte deine erste Fahrt.</span>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[320px]">
        <button
          type="button"
          onClick={onOpenDevices}
          className={`flex items-center gap-3 px-4 py-3 border rounded-xl text-left transition-colors duration-150 cursor-pointer ${
            kickrConnected
              ? "border-[var(--success)] bg-[var(--surface)]"
              : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${kickrConnected ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--text)]">Trainer verbinden</p>
            <p className="text-[10px] text-[var(--text-subtle)]">{kickrConnected ? "Trainer verbunden" : "Gerät erkunden"}</p>
          </div>
          {!kickrConnected && <span className="text-[var(--text-subtle)] text-xs">→</span>}
        </button>
        <button
          type="button"
          onClick={onOpenRoutes}
          className="flex items-center gap-3 px-4 py-3 border border-[var(--border)] bg-[var(--surface)] rounded-xl text-left hover:border-[var(--accent)] transition-colors duration-150 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-subtle)] shrink-0" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--text)]">GPX-Strecke importieren</p>
            <p className="text-[10px] text-[var(--text-subtle)]">Du kannst auch ohne Strecke starten</p>
          </div>
          <span className="text-[var(--text-subtle)] text-xs">→</span>
        </button>
        <button
          type="button"
          onClick={onOpenRoutes}
          className="flex items-center gap-3 px-4 py-3 border border-[var(--border)] bg-[var(--surface)] rounded-xl text-left hover:border-[var(--accent)] transition-colors duration-150 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#FC4C02" aria-hidden="true">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--text)]">Strava verbinden</p>
            <p className="text-[10px] text-[var(--text-subtle)]">Strecken aus Strava importieren</p>
          </div>
          <span className="text-[var(--text-subtle)] text-xs">→</span>
        </button>
      </div>
    </div>
  );
}

export function HomeScreen({ onOpenRoutes, onOpenDevices }: Props) {
  const library = useRouteLibrary();
  const profileContext = useOptionalProfileContext();
  const activeProfileId = profileContext?.activeProfile?.id ?? null;
  const { kickrConnected } = useDeviceStatus();
  const { settings: athleteSettings } = useAthleteSettings();
  const recommendation = useHomeRecommendation(library, activeProfileId);

  const handleHeroStart = useCallback((routeId: string) => {
    setLastRouteId(routeId, activeProfileId);
    onOpenRoutes(routeId);
  }, [activeProfileId, onOpenRoutes]);

  const handleCompactClick = useCallback((routeId: string) => {
    setLastRouteId(routeId, activeProfileId);
    onOpenRoutes(routeId);
  }, [activeProfileId, onOpenRoutes]);

  const otherRoutes = recommendation
    ? library.filter(r => r.id !== recommendation.route.id).slice(0, 4)
    : [];

  return (
    <div data-testid="home-screen" className="w-full h-full bg-[var(--bg)] flex flex-col overflow-hidden">
      <ScreenHeader />

      {recommendation === null ? (
        <EmptyState onOpenRoutes={() => onOpenRoutes()} onOpenDevices={onOpenDevices} kickrConnected={kickrConnected} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-5">
          <HeroCard
            route={recommendation.route}
            reason={recommendation.reason}
            athleteSettings={athleteSettings}
            onStart={handleHeroStart}
          />

          {otherRoutes.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[var(--text-muted)]">Weitere Strecken</span>
                <button
                  type="button"
                  onClick={() => onOpenRoutes()}
                  className="text-[10px] text-[var(--text-subtle)] hover:text-[var(--accent)] transition-colors duration-150 cursor-pointer"
                >
                  Alle anzeigen →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {otherRoutes.map(r => (
                  <CompactRouteCard key={r.id} route={r} onClick={() => handleCompactClick(r.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
