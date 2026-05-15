import { useState } from "react";
import { useAnalyticsOverview, type PowerTrendPoint } from "./useAnalytics";

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m)} m`;
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface StatTileProps {
  value: string;
  label: string;
}

function StatTile({ value, label }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
      <span className="text-[20px] font-data font-bold tabular-nums text-[var(--text)]">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

interface PowerChartProps {
  trend: PowerTrendPoint[];
}

function PowerChart({ trend }: PowerChartProps) {
  if (trend.length === 0) return null;
  const values = trend.map(p => p.avg_power_w);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 280;
  const H = 56;
  const barW = Math.floor(W / trend.length) - 2;
  const lastIdx = trend.length - 1;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Leistungstrend</span>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Leistungstrend der letzten Fahrten"
        className="overflow-visible"
      >
        {values.map((v, i) => {
          const barH = Math.max(4, Math.round(((v - min) / range) * (H - 12)) + 4);
          const x = i * (barW + 2);
          const y = H - barH;
          const isLast = i === lastIdx;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                className={isLast ? "fill-[var(--accent)]" : "fill-[var(--text-subtle)]"}
                opacity={isLast ? 1 : 0.5}
              />
              {isLast && (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={9}
                  className="fill-[var(--text-muted)]"
                >
                  {Math.round(v)}W
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        className="text-[var(--text-subtle)]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <p className="text-xs text-[var(--text-subtle)] max-w-[200px] leading-relaxed">
        Auswertungen erscheinen hier nach mehreren Fahrten.
      </p>
    </div>
  );
}

export function AnalyticsScreen() {
  const { overview, loading } = useAnalyticsOverview();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div data-testid="analytics-screen" className="w-full h-full flex flex-col bg-[var(--bg)]">
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text-muted)] tracking-wider uppercase">Analyse</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="text-xs text-[var(--text-subtle)]">Lade Analyse…</span>
          </div>
        )}

        {!loading && overview?.total_rides === 0 && <EmptyState />}

        {!loading && overview && overview.total_rides > 0 && (
          <div className="flex flex-col gap-6 px-4 py-6 max-w-[440px] mx-auto">

            {/* Stat tiles */}
            <div data-testid="overview-stats" className="grid grid-cols-2 gap-3">
              <StatTile value={String(overview.total_rides)} label="Fahrten" />
              <StatTile value={formatDistance(overview.total_distance_m)} label="Gesamt" />
              <StatTile value={formatDuration(overview.total_duration_s)} label="Fahrzeit" />
              {overview.avg_power_w != null && (
                <StatTile value={`${Math.round(overview.avg_power_w)} W`} label="Ø Leistung" />
              )}
            </div>

            {/* Consistency */}
            <div data-testid="consistency-section" className="flex flex-col gap-2">
              <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Regelmäßigkeit</span>
              <div className="flex gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[18px] font-data font-bold tabular-nums text-[var(--text)]">
                    {overview.rides_last_7_days}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Diese Woche</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[18px] font-data font-bold tabular-nums text-[var(--text)]">
                    {overview.rides_last_30_days}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Diesen Monat</span>
                </div>
              </div>
            </div>

            {/* Power trend chart */}
            {overview.power_trend.length > 0 && (
              <div data-testid="power-trend-section">
                <PowerChart trend={overview.power_trend} />
              </div>
            )}

            {/* Advanced section */}
            <div data-testid="advanced-section" className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="advanced-toggle"
                onClick={() => setAdvancedOpen(o => !o)}
                aria-expanded={advancedOpen}
                className="flex items-center justify-between w-full text-left py-2 border-t border-[var(--border)] cursor-pointer"
              >
                <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Erweitert</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`text-[var(--text-subtle)] transition-transform duration-150 ${advancedOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {advancedOpen && (
                <div data-testid="advanced-content" className="flex flex-col gap-3 pt-1">
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-subtle)]">
                      Detaillierte Analyse pro Fahrt öffnest du im Verlauf.
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
