import { memo, useState, useCallback, useRef, useEffect } from "react";
import type { RouteLibraryEntry } from "../../shared/types/route";
import type { AthleteSettings } from "../settings/hooks/useAthleteSettings";
import { RouteTrimSlider } from "./RouteTrimSlider";
import { RideOptions, type RideConfig } from "./RideOptions";

interface Props {
  route: RouteLibraryEntry;
  athleteSettings: AthleteSettings;
  onStart: (config: RideConfig) => void;
  onClose: () => void;
  onRename: (routeId: string, name: string) => void;
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

export const RouteCardExpanded = memo(function RouteCardExpanded({ route, athleteSettings, onStart, onClose, onRename }: Props) {
  const totalDistM = route.distance_km * 1000;
  const [config, setConfig] = useState<RideConfig>(() => ({ ghost: false, reverse: false, cutoutStartM: null, cutoutEndM: null, laps: 1, warmup: false, cooldown: false, ergMode: false }));
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(totalDistM);
  const [trimEnabled, setTrimEnabled] = useState(false);
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

  const handleTrimChange = useCallback((s: number, e: number) => { setTrimStart(s); setTrimEnd(e); }, []);
  const handleToggleTrim = useCallback(() => {
    if (!trimEnabled) { setTrimStart(0); setTrimEnd(totalDistM); }
    setTrimEnabled(t => !t);
  }, [trimEnabled, totalDistM]);

  const handleStart = useCallback(() => {
    onStart({ ...config, cutoutStartM: trimEnabled ? trimStart : null, cutoutEndM: trimEnabled ? trimEnd : null });
  }, [config, trimEnabled, trimStart, trimEnd, onStart]);

  const estTime = estimateTimeS(route.distance_km, route.elevation_gain_m, athleteSettings.ftp_w, athleteSettings.weight_kg, athleteSettings.height_cm);
  const hasStravaOrBestTime = !!(route.strava_id || route.best_time_s);

  return (
    <div className="flex flex-col bg-[var(--surface)] border border-[#FFF200] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input ref={inputRef} value={nameVal} onChange={e => setNameVal(e.target.value)} onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setNameVal(route.name); }}}
              className="w-full bg-[var(--bg)] border border-[#FFF200] text-[var(--text)] font-condensed font-bold text-[14px] tracking-wide px-1 py-0 focus:outline-none" />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              {route.strava_id && <svg width="10" height="10" viewBox="0 0 24 24" fill="#FC4C02" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>}
              <span className="text-[14px] font-condensed font-bold text-[var(--text)] truncate cursor-pointer" onDoubleClick={() => setEditing(true)}>{route.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] tabular-nums">{route.distance_km.toFixed(1)} KM</span>
            <span className="text-[9px] font-condensed text-[var(--text-muted)]">·</span>
            <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] tabular-nums">↑{route.elevation_gain_m} M</span>
            <span className="text-[9px] font-condensed text-[var(--text-muted)]">·</span>
            <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] tabular-nums">↓{route.elevation_loss_m} M</span>
            <span className="text-[9px] font-condensed text-[var(--text-muted)]">·</span>
            {route.best_time_s !== null ? (
              <><span className="text-[9px] font-condensed font-bold uppercase text-[#22C55E]">BEST</span><span className="text-[10px] font-data font-bold tabular-nums text-[#22C55E]">{formatTime(route.best_time_s)}</span></>
            ) : (
              <><span className="text-[9px] font-condensed font-bold uppercase text-[var(--text-muted)]">EST</span><span className="text-[10px] font-data font-bold tabular-nums text-[var(--text-muted)]">{formatTime(estTime)}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setEditing(true)} aria-label="Umbenennen" className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" onClick={onClose} aria-label="Auswahl aufheben" className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer font-bold text-base leading-none">×</button>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">STRECKENPROFIL</span>
          <button type="button" onClick={handleToggleTrim}
            className={`text-[9px] font-condensed font-bold tracking-widest uppercase px-2 py-0.5 border transition-colors cursor-pointer ${trimEnabled ? "border-[#FFF200] text-[#FFF200]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"}`}>
            {trimEnabled ? "AUSSCHNITT AN" : "AUSSCHNITT"}
          </button>
        </div>
        {route.elevation_thumbnail.length >= 2 ? (
          trimEnabled ? (
            <RouteTrimSlider thumbnail={route.elevation_thumbnail} totalDistM={totalDistM} startM={trimStart} endM={trimEnd} onChange={handleTrimChange} />
          ) : (
            <div style={{ height: 72 }}>
              <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="w-full h-full block">
                {(() => {
                  const thumb = route.elevation_thumbnail, n = thumb.length;
                  const minE = Math.min(...thumb), maxE = Math.max(...thumb), range = Math.max(maxE - minE, 1);
                  const pts = thumb.map((e, i) => `${((i / (n - 1)) * 1000).toFixed(1)},${(80 - ((e - minE) / range) * 72).toFixed(1)}`);
                  return <path d={`M0,80 L${pts.join(" ")} L1000,80 Z`} fill="#FFF200" stroke="#000" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
                })()}
              </svg>
            </div>
          )
        ) : (
          <div className="h-[72px] flex items-center justify-center">
            <span className="text-[9px] font-condensed text-[var(--text-muted)] tracking-widest uppercase">KEIN PROFIL</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-b border-[var(--border)]">
        <RideOptions config={config} totalDistM={totalDistM} hasStravaOrBestTime={hasStravaOrBestTime} onChange={setConfig} />
      </div>

      <div className="px-4 py-3 flex justify-end">
        <button type="button" onClick={handleStart} className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-10 py-3 cursor-pointer hover:bg-white transition-colors duration-150">STARTEN →</button>
      </div>
    </div>
  );
});
