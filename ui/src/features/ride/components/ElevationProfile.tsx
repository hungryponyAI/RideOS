import { memo, useMemo } from "react";
import type { ElevationChartDatum } from "../../../shared/types/route";

interface Props {
  data: ElevationChartDatum[] | null;
  gradesPct: number[] | null;
  positionM: number | null;
  ghostDistM?: number | null;
}

const WINDOW_M = 10_000;
const LABEL_STEP_M = 2_000;
const CLIMB_THRESHOLD_PCT = 4;
const DESCENT_THRESHOLD_PCT = -3;
const GHOST_COLOR = "#E58B4A";
export const ELEVATION_PROFILE_SMOOTHING_WINDOW_M = 180;
export const ELEVATION_PROFILE_BOUNDS_PADDING_M = 4;
export const ELEVATION_PROFILE_LABEL_ROUNDING_M = 5;
export const ELEVATION_TERRAIN_GRADE_SMOOTHING_WINDOW_M = 120;

type TerrainType = "climb" | "descent" | "flat";

function terrainType(grade: number): TerrainType {
  if (grade >= CLIMB_THRESHOLD_PCT) return "climb";
  if (grade <= DESCENT_THRESHOLD_PCT) return "descent";
  return "flat";
}

function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function smoothValuesByDistance<T extends { dist: number }>(
  values: T[],
  valueOf: (item: T, index: number) => number,
  windowM: number,
): number[] {
  if (values.length < 3 || windowM <= 0) return values.map(valueOf);
  const halfWindowM = windowM / 2;
  return values.map((item, i) => {
    let valueSum = 0;
    let weightSum = 0;

    for (let j = i; j >= 0 && item.dist - values[j].dist <= halfWindowM; j--) {
      const distanceM = Math.abs(item.dist - values[j].dist);
      const weight = 1 - distanceM / Math.max(1, halfWindowM);
      valueSum += valueOf(values[j], j) * weight;
      weightSum += weight;
    }
    for (let j = i + 1; j < values.length && values[j].dist - item.dist <= halfWindowM; j++) {
      const distanceM = Math.abs(values[j].dist - item.dist);
      const weight = 1 - distanceM / Math.max(1, halfWindowM);
      valueSum += valueOf(values[j], j) * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? valueSum / weightSum : valueOf(item, i);
  });
}

function interpolateElevationAt(
  values: ElevationChartDatum[],
  distM: number,
): number | null {
  if (values.length === 0) return null;
  if (distM <= values[0].dist) return values[0].elev;
  const last = values[values.length - 1];
  if (distM >= last.dist) return last.elev;

  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const next = values[i];
    if (distM <= next.dist) {
      const span = next.dist - prev.dist;
      const t = span === 0 ? 0 : (distM - prev.dist) / span;
      return prev.elev + (next.elev - prev.elev) * t;
    }
  }

  return null;
}

export const ElevationProfile = memo(function ElevationProfile({ data, gradesPct, positionM, ghostDistM }: Props) {
  const chart = useMemo(() => {
    const hasRoute = data !== null && data.length >= 2;
    const empty = { pathD: `M0,100 L1000,100`, baseLabels: [] as Array<{ xPct: number; label: string }>, posXPct: null, ghostXPct: null, posPoint: null, ghostPoint: null, hasRoute: false, elevMin: null, elevMax: null, terrainRects: [] as Array<{ x: number; w: number; type: TerrainType }> };
    if (!hasRoute) return empty;

    const smoothedElevations = smoothValuesByDistance(
      data!,
      (d) => d.elev,
      ELEVATION_PROFILE_SMOOTHING_WINDOW_M,
    );
    const displayData = data!.map((d, i) => ({ ...d, elev: smoothedElevations[i] }));
    const totalDistM = displayData[displayData.length - 1].dist;
    const posM = positionM ?? 0;
    let xMin = Math.max(0, posM - WINDOW_M / 2);
    let xMax = xMin + WINDOW_M;
    if (xMax > totalDistM) {
      xMax = totalDistM;
      xMin = Math.max(0, xMax - WINDOW_M);
    }

    const visible = displayData.filter(d => d.dist >= xMin && d.dist <= xMax);
    if (visible.length < 2) return { ...empty, hasRoute: true };

    const rawElevMin = Math.min(...visible.map(d => d.elev));
    const rawElevMax = Math.max(...visible.map(d => d.elev));
    const elevMin = roundDownToStep(
      rawElevMin - ELEVATION_PROFILE_BOUNDS_PADDING_M,
      ELEVATION_PROFILE_LABEL_ROUNDING_M,
    );
    const elevMax = roundUpToStep(
      rawElevMax + ELEVATION_PROFILE_BOUNDS_PADDING_M,
      ELEVATION_PROFILE_LABEL_ROUNDING_M,
    );
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
    const posElev = positionM !== null ? interpolateElevationAt(displayData, positionM) : null;
    const posPoint =
      posXPct !== null && posElev !== null
        ? { x: posXPct * 10, y: toY(posElev) }
        : null;

    const ghostXPct =
      ghostDistM != null && ghostDistM >= xMin && ghostDistM <= xMax
        ? ((ghostDistM - xMin) / span) * 100
        : null;
    const ghostElev = ghostDistM != null ? interpolateElevationAt(displayData, ghostDistM) : null;
    const ghostPoint =
      ghostXPct !== null && ghostElev !== null
        ? { x: ghostXPct * 10, y: toY(ghostElev) }
        : null;

    // Terrain highlight rects at the bottom strip
    const terrainRects: Array<{ x: number; w: number; type: TerrainType }> = [];
    if (gradesPct && gradesPct.length === data!.length) {
      const smoothedGrades = smoothValuesByDistance(
        data!,
        (_, i) => gradesPct[i],
        ELEVATION_TERRAIN_GRADE_SMOOTHING_WINDOW_M,
      );
      const visibleWithGrades = data!
        .map((d, i) => ({ dist: d.dist, grade: gradesPct[i] }))
        .map((d, i) => ({ ...d, grade: smoothedGrades[i] }))
        .filter(d => d.dist >= xMin && d.dist <= xMax);

      if (visibleWithGrades.length >= 2) {
        let curType: TerrainType = terrainType(visibleWithGrades[0].grade);
        let segX = toX(visibleWithGrades[0].dist);

        for (let i = 1; i < visibleWithGrades.length; i++) {
          const t = terrainType(visibleWithGrades[i].grade);
          if (t !== curType) {
            const endX = toX(visibleWithGrades[i].dist);
            if (curType !== "flat" && endX > segX) {
              terrainRects.push({ x: segX, w: endX - segX, type: curType });
            }
            curType = t;
            segX = endX;
          }
        }
        const lastX = toX(visibleWithGrades[visibleWithGrades.length - 1].dist);
        if (curType !== "flat" && lastX > segX) {
          terrainRects.push({ x: segX, w: lastX - segX, type: curType });
        }
      }
    }

    return { pathD, baseLabels, posXPct, ghostXPct, posPoint, ghostPoint, hasRoute: true, elevMin, elevMax, terrainRects };
  }, [data, gradesPct, positionM, ghostDistM]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent">
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

          {/* Terrain highlight strip */}
          {chart.terrainRects.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={93}
              width={r.w}
              height={7}
              fill={r.type === "climb" ? "#E58B4A" : "#74AFCB"}
              fillOpacity={r.type === "climb" ? 0.8 : 0.6}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Ghost position marker */}
          {chart.ghostXPct !== null && (
            <>
              <rect
                x={Math.min(984, Math.max(0, chart.ghostXPct * 10 - 8))}
                y={0}
                width={16}
                height={100}
                fill={GHOST_COLOR}
                fillOpacity="0.12"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={chart.ghostXPct * 10} y1={0}
                x2={chart.ghostXPct * 10} y2={96}
                stroke={GHOST_COLOR}
                strokeWidth="2"
                strokeOpacity="0.95"
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
              />
              {chart.ghostPoint !== null && (
                <>
                  <circle
                    cx={chart.ghostPoint.x} cy={chart.ghostPoint.y}
                    r={9}
                    fill={GHOST_COLOR}
                    fillOpacity="0.22"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={chart.ghostPoint.x} cy={chart.ghostPoint.y}
                    r={4.5}
                    fill={GHOST_COLOR}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </>
          )}

          {/* Rider position marker */}
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
              {chart.posPoint !== null && (
                <circle
                  cx={chart.posPoint.x} cy={chart.posPoint.y}
                  r={3}
                  fill="#74AFCB"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </>
          )}
        </svg>
        {chart.hasRoute && chart.elevMax !== null && (
          <>
            <span className="absolute top-1 left-2 text-[11px] font-medium text-[var(--text-muted)] select-none leading-none pointer-events-none tabular-nums">
              {chart.elevMax} m
            </span>
            <span className="absolute bottom-1 left-2 text-[11px] font-medium text-[var(--text-muted)] select-none leading-none pointer-events-none tabular-nums">
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
      <div className="h-7 border-t border-[var(--border)] relative shrink-0 flex items-center">
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
