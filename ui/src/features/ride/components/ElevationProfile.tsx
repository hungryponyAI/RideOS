import { memo, useMemo } from "react";
import type { ElevationChartDatum } from "../../../shared/types/route";

interface Props {
  data: ElevationChartDatum[] | null;
  positionM: number | null;
}

const WINDOW_M = 10_000;
const LABEL_STEP_M = 2_000;

export const ElevationProfile = memo(function ElevationProfile({ data, positionM }: Props) {
  const chart = useMemo(() => {
    const hasRoute = data !== null && data.length >= 2;
    if (!hasRoute) {
      return { pathD: `M0,100 L1000,100`, baseLabels: [] as Array<{ xPct: number; label: string }>, posXPct: null, hasRoute: false, elevMin: null, elevMax: null };
    }

    const totalDistM = data![data!.length - 1].dist;
    const posM = positionM ?? 0;
    let xMin = Math.max(0, posM - WINDOW_M / 2);
    let xMax = xMin + WINDOW_M;
    if (xMax > totalDistM) {
      xMax = totalDistM;
      xMin = Math.max(0, xMax - WINDOW_M);
    }

    const visible = data!.filter(d => d.dist >= xMin && d.dist <= xMax);
    if (visible.length < 2) {
      return { pathD: `M0,100 L1000,100`, baseLabels: [] as Array<{ xPct: number; label: string }>, posXPct: null, hasRoute: true, elevMin: null, elevMax: null };
    }

    const elevMin = Math.min(...visible.map(d => d.elev));
    const elevMax = Math.max(...visible.map(d => d.elev));
    const elevRange = Math.max(elevMax - elevMin, 10);
    const span = xMax - xMin;

    const toX = (distM: number) => ((distM - xMin) / span) * 1000;
    const toY = (elev: number) => 100 - ((elev - elevMin) / elevRange) * 82;

    const pts = visible.map(d => `${toX(d.dist).toFixed(1)},${toY(d.elev).toFixed(1)}`);
    const pathD = `M${toX(visible[0].dist).toFixed(1)},100 L${pts.join(' ')} L${toX(visible[visible.length - 1].dist).toFixed(1)},100 Z`;

    const startLabel = Math.ceil(xMin / LABEL_STEP_M) * LABEL_STEP_M;
    const baseLabels: Array<{ xPct: number; label: string }> = [];
    for (let dM = startLabel; dM <= xMax; dM += LABEL_STEP_M) {
      if (dM >= xMin) {
        baseLabels.push({ xPct: ((dM - xMin) / span) * 100, label: String(Math.round(dM / 1000)) });
      }
    }

    const posXPct =
      positionM !== null && positionM >= xMin && positionM <= xMax
        ? ((positionM - xMin) / span) * 100
        : null;

    return { pathD, baseLabels, posXPct, hasRoute: true, elevMin: Math.round(elevMin), elevMax: Math.round(elevMax) };
  }, [data, positionM]);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg)]">
      <div className="flex-1 relative overflow-hidden">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full block">
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#74AFCB" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#74AFCB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={chart.pathD}
            fill={chart.hasRoute ? "url(#elevGrad)" : "var(--chart-empty)"}
            stroke={chart.hasRoute ? "#74AFCB" : "none"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {chart.posXPct !== null && (
            <>
              <line
                x1={chart.posXPct * 10} y1={0}
                x2={chart.posXPct * 10} y2={100}
                stroke="#74AFCB"
                strokeWidth="1.5"
                strokeOpacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={chart.posXPct * 10} cy={50}
                r={3}
                fill="#74AFCB"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {chart.hasRoute && chart.elevMax !== null && (
          <>
            <span className="absolute top-1 left-2 text-[10px] font-medium text-[var(--text-muted)] select-none leading-none pointer-events-none tabular-nums">
              {chart.elevMax} m
            </span>
            <span className="absolute bottom-1 left-2 text-[10px] font-medium text-[var(--text-muted)] select-none leading-none pointer-events-none tabular-nums">
              {chart.elevMin} m
            </span>
          </>
        )}
        {!chart.hasRoute && (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-[var(--text-muted)]">
            Keine Strecke geladen
          </span>
        )}
      </div>
      <div className="h-7 bg-[var(--bg-secondary)] border-t border-[var(--border)] relative shrink-0 flex items-center">
        {chart.baseLabels.map(({ xPct, label }) => (
          <span
            key={label}
            className="absolute text-[10px] font-medium text-[var(--text-muted)] -translate-x-1/2 select-none tabular-nums"
            style={{ left: `${xPct}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
});
