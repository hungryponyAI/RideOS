import { useCallback, useRef } from "react";

interface Props {
  thumbnail: number[];
  totalDistM: number;
  startM: number;
  endM: number;
  onChange: (startM: number, endM: number) => void;
}

const SVG_W = 1000, SVG_H = 80, MIN_SPAN_M = 500;

function buildPath(thumbnail: number[]): string {
  const n = thumbnail.length;
  if (n < 2) return `M0,${SVG_H} L${SVG_W},${SVG_H} Z`;
  const min = Math.min(...thumbnail), max = Math.max(...thumbnail);
  const range = Math.max(max - min, 1);
  const pts = thumbnail.map((e, i) => {
    const x = (i / (n - 1)) * SVG_W;
    const y = SVG_H - ((e - min) / range) * (SVG_H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M0,${SVG_H} L${pts.join(" ")} L${SVG_W},${SVG_H} Z`;
}

export function RouteTrimSlider({ thumbnail, totalDistM, startM, endM, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ handle: "start" | "end" } | null>(null);
  const distToX = (m: number) => (m / totalDistM) * SVG_W;
  const xToDist = (x: number) => Math.max(0, Math.min(totalDistM, (x / SVG_W) * totalDistM));
  const snap = (m: number) => Math.round(m / 100) * 100;

  const getSvgX = useCallback((clientX: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * SVG_W;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, handle: "start" | "end") => {
    e.preventDefault();
    dragRef.current = { handle };
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const svgX = getSvgX(e.clientX), rawM = xToDist(svgX);
    if (dragRef.current.handle === "start") onChange(snap(Math.min(rawM, endM - MIN_SPAN_M)), endM);
    else onChange(startM, snap(Math.max(rawM, startM + MIN_SPAN_M)));
  }, [getSvgX, xToDist, startM, endM, onChange]);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const pathD = buildPath(thumbnail);
  const xStart = distToX(startM), xEnd = distToX(endM);

  return (
    <div className="flex flex-col gap-1.5 select-none">
      <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none" className="w-full cursor-crosshair" style={{ height: 72 }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <path d={pathD} fill="#74AFCB" fillOpacity="0.12" stroke="none" />
        <clipPath id="trim-clip"><rect x={xStart} y={0} width={xEnd - xStart} height={SVG_H} /></clipPath>
        <path d={pathD} fill="#74AFCB" fillOpacity="0.28" stroke="#74AFCB" strokeWidth="1.5" vectorEffect="non-scaling-stroke" clipPath="url(#trim-clip)" />
        <rect x={0} y={0} width={xStart} height={SVG_H} fill="var(--bg)" fillOpacity="0.70" />
        <rect x={xEnd} y={0} width={SVG_W - xEnd} height={SVG_H} fill="var(--bg)" fillOpacity="0.70" />
        <rect x={xStart - 3} y={0} width={6} height={SVG_H} fill="#74AFCB" className="cursor-ew-resize" onPointerDown={e => onPointerDown(e, "start")} />
        <rect x={xEnd - 3} y={0} width={6} height={SVG_H} fill="#74AFCB" className="cursor-ew-resize" onPointerDown={e => onPointerDown(e, "end")} />
      </svg>
      <div className="flex justify-between px-0.5">
        <span className="text-[9px] font-medium tabular-nums text-[var(--accent)]">{(startM / 1000).toFixed(1)} km</span>
        <span className="text-[9px] font-medium tabular-nums text-[var(--text-muted)]">{((endM - startM) / 1000).toFixed(1)} km ausgewählt</span>
        <span className="text-[9px] font-medium tabular-nums text-[var(--accent)]">{(endM / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
