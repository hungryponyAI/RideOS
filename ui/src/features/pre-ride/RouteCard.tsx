import { memo, useState, useCallback, useRef, useEffect } from "react";
import type { RouteLibraryEntry } from "../../shared/types/route";
import type { AthleteSettings } from "../settings/hooks/useAthleteSettings";

interface Props {
  route: RouteLibraryEntry;
  onLoad: (routeId: string) => void;
  onDelete: (routeId: string) => void;
  onRename: (routeId: string, name: string) => void;
  athleteSettings: AthleteSettings;
  isSelected?: boolean;
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (routeId: string) => void;
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

function formatLastAttempt(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return "Heute";
    if (diffDays === 1) return "Gestern";
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    if (diffDays < 30) return `Vor ${Math.floor(diffDays / 7)} Wo.`;
    if (diffDays < 365) return `Vor ${Math.floor(diffDays / 30)} Mon.`;
    return `Vor ${Math.floor(diffDays / 365)} J.`;
  } catch {
    return null;
  }
}

function MiniProfile({ thumbnail }: { thumbnail: number[] }) {
  if (thumbnail.length < 2) return <div className="w-full h-full bg-[var(--chart-empty)]" />;
  const min = Math.min(...thumbnail), max = Math.max(...thumbnail), range = Math.max(max - min, 1), n = thumbnail.length;
  const pts = thumbnail.map((e, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${(100 - ((e - min) / range) * 82).toFixed(1)}`);
  const areaPath = `M0,100 L${pts.join(" L")} L1000,100 Z`;
  const linePath = `M${pts.join(" L")}`;
  return (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full block">
      <path d={areaPath} fill="#74AFCB" fillOpacity="0.15" />
      <path d={linePath} fill="none" stroke="#74AFCB" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const RouteCard = memo(function RouteCard({
  route, onLoad, onDelete, onRename, athleteSettings, isSelected, compact, isFavorite, onToggleFavorite,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(route.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameVal(route.name); }, [route.name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== route.name) onRename(route.id, trimmed);
    else setNameVal(route.name);
  }, [nameVal, route.id, route.name, onRename]);

  const estTime = estimateTimeS(route.distance_km, route.elevation_gain_m, athleteSettings.ftp_w, athleteSettings.weight_kg, athleteSettings.height_cm);
  const lastAttempt = formatLastAttempt(route.activity_date);
  const hasGhost = route.best_time_s !== null;

  return (
    <div className={`flex flex-col bg-[var(--surface)] border rounded-xl overflow-hidden cursor-pointer group transition-all duration-150 ${isSelected ? "border-[var(--accent)] shadow-soft" : "border-[var(--border)] hover:border-[var(--accent)] hover:shadow-soft"} ${compact ? "opacity-60 hover:opacity-100" : ""}`}>
      <div className={`${compact ? "h-[28px]" : "h-[44px]"} overflow-hidden shrink-0 relative`} onClick={() => onLoad(route.id)}>
        <MiniProfile thumbnail={route.elevation_thumbnail} />
        {hasGhost && !compact && (
          <span className="absolute top-1 right-1 text-[8px] text-[var(--accent)] bg-[var(--bg)] border border-[var(--accent)] rounded px-1 py-px leading-none opacity-80" title="Ghost verfügbar">
            Ghost
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1" onClick={() => !editing && onLoad(route.id)}>
          {editing ? (
            <input ref={inputRef} value={nameVal} onChange={e => setNameVal(e.target.value)} onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setNameVal(route.name); }}}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[var(--bg)] border border-[var(--accent)] text-[var(--text)] text-xs font-medium px-1 py-0 rounded focus:outline-none" />
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              {route.strava_id && (
                <span title="Strava-Aktivität" className="inline-flex items-center gap-0.5 text-[#FC4C02] shrink-0" aria-label="Strava">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
                </span>
              )}
              <span className="text-xs font-medium text-[var(--text)] leading-tight truncate cursor-pointer" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }} title={route.name}>{route.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{route.distance_km.toFixed(1)} km</span>
            <span className="text-[10px] text-[var(--text-subtle)]">·</span>
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">↑{route.elevation_gain_m} m</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {route.best_time_s !== null ? (
              <><span className="text-[10px] text-[var(--success)]">Bestzeit</span><span className="text-[10px] font-data tabular-nums text-[var(--success)] ml-0.5">{formatTime(route.best_time_s)}</span></>
            ) : (
              <><span className="text-[10px] text-[var(--text-subtle)]">ca.</span><span className="text-[10px] font-data tabular-nums text-[var(--text-muted)] ml-0.5">{formatTime(estTime)}</span></>
            )}
            {lastAttempt && (
              <><span className="text-[10px] text-[var(--text-subtle)]">·</span><span className="text-[10px] text-[var(--text-subtle)]">{lastAttempt}</span></>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {onToggleFavorite && (
            <button type="button" onClick={e => { e.stopPropagation(); onToggleFavorite(route.id); }} aria-label={isFavorite ? "Favorit entfernen" : "Als Favorit speichern"}
              className={`w-6 h-6 flex items-center justify-center cursor-pointer transition-colors ${isFavorite ? "text-[var(--accent)]" : "text-[var(--text-subtle)] hover:text-[var(--accent)] opacity-0 group-hover:opacity-100"}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          )}
          <button type="button" onClick={e => { e.stopPropagation(); setEditing(true); }} aria-label="Umbenennen" className="w-6 h-6 flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(route.id); }} aria-label="Löschen" className="w-6 h-6 flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--critical)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
});
