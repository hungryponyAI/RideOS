import { memo, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;

  // ✅ BOTH supported now
  ghostPositionM?: number | null;
  ghostLat?: number | null;
  ghostLng?: number | null;

  isDark: boolean;
  ghostBearingDeg: number | null;
  ghostTimeGapS: number | null;
}

const CARTO_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const DEFAULT_CENTER: [number, number] = [50, 10];
const DEFAULT_ZOOM = 5;
const RIDING_ZOOM = 16;
const BEARING_LOOKAHEAD_M = 300;

function bisectRight(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function interpolatePosition(
  coords: Array<[number, number]>,
  cumDist: number[],
  targetM: number
): [number, number] | null {
  if (!coords.length) return null;

  const idx = Math.min(
    Math.max(bisectRight(cumDist, targetM) - 1, 0),
    coords.length - 2
  );

  const d0 = cumDist[idx];
  const d1 = cumDist[idx + 1];
  const t = d1 === d0 ? 0 : (targetM - d0) / (d1 - d0);

  const [lat0, lng0] = coords[idx];
  const [lat1, lng1] = coords[idx + 1];

  return [
    lat0 + (lat1 - lat0) * t,
    lng0 + (lng1 - lng0) * t,
  ];
}

/* ========================= */
function RouteLayer({
  coords,
  cumDist,
  positionM,
}: {
  coords: Array<[number, number]>;
  cumDist: number[];
  positionM: number | null;
}) {
  const map = useMap();

  const pos = positionM !== null
    ? interpolatePosition(coords, cumDist, positionM)
    : coords[0];

  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords, { animate: false });
    }
  }, [coords.length]);

  useEffect(() => {
    if (!pos) return;
    map.setView(pos, RIDING_ZOOM, { animate: false });
  }, [pos]);

  return <Polyline positions={coords} pathOptions={{ color: "#FFF200", weight: 2 }} />;
}

/* ========================= */
function GhostProjector({
  lat,
  lng,
  onUpdate,
}: {
  lat: number;
  lng: number;
  onUpdate: (p: { x: number; y: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const update = () => {
      const p = map.latLngToContainerPoint([lat, lng]);
      const size = map.getSize();

      onUpdate({
        x: p.x - size.x / 2,
        y: p.y - size.y / 2,
      });
    };

    update();
    map.on("move", update);
    map.on("zoom", update);

    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [lat, lng, map, onUpdate]);

  return null;
}

/* ========================= */
export const MiniMap = memo(function MiniMap({
  coords,
  cumDist,
  positionM,
  ghostPositionM,
  ghostLat,
  ghostLng,
  isDark,
  ghostBearingDeg,
  ghostTimeGapS,
}: MiniMapProps) {
  const hasRoute = !!(coords && cumDist && coords.length > 1);
  const tileUrl = isDark ? CARTO_DARK : CARTO_LIGHT;

  const [ghostScreen, setGhostScreen] = useState<{ x: number; y: number } | null>(null);

  // Ego
  const ego = useMemo(() => {
    if (!hasRoute || positionM === null) return null;
    return interpolatePosition(coords!, cumDist!, positionM);
  }, [coords, cumDist, positionM, hasRoute]);

  // Ghost (distance OR lat/lng fallback)
  const ghost = useMemo(() => {
    if (ghostPositionM !== null && ghostPositionM !== undefined && hasRoute) {
      return interpolatePosition(coords!, cumDist!, ghostPositionM);
    }
    if (ghostLat != null && ghostLng != null) {
      return [ghostLat, ghostLng] as [number, number];
    }
    return null;
  }, [ghostPositionM, ghostLat, ghostLng, coords, cumDist, hasRoute]);

  const bearingDeg = useMemo(() => {
    if (!hasRoute || !ego || positionM === null) return 0;

    const ahead = interpolatePosition(
      coords!,
      cumDist!,
      positionM + BEARING_LOOKAHEAD_M
    );

    if (!ahead) return 0;

    return calcBearing(ego[0], ego[1], ahead[0], ahead[1]);
  }, [coords, cumDist, positionM, ego, hasRoute]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--map-bg)]">

      <div
        className="absolute w-[150%] h-[150%] -top-[25%] -left-[25%]"
        style={{ transform: `rotate(${-bearingDeg}deg)` }}
      >
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
          dragging={false}
        >
          <TileLayer url={tileUrl} attribution={ATTRIBUTION} />

          {hasRoute && (
            <RouteLayer
              coords={coords!}
              cumDist={cumDist!}
              positionM={positionM}
            />
          )}

          {ghost && (
            <GhostProjector
              lat={ghost[0]}
              lng={ghost[1]}
              onUpdate={setGhostScreen}
            />
          )}
        </MapContainer>
      </div>

      {/* Ghost */}
      {ghostScreen && (
        (() => {
          const theta = (-bearingDeg * Math.PI) / 180;

          const x =
            ghostScreen.x * Math.cos(theta) -
            ghostScreen.y * Math.sin(theta);

          const y =
            ghostScreen.x * Math.sin(theta) +
            ghostScreen.y * Math.cos(theta);

          return (
            <div
              className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none"
              style={{
                transform: `translate(${x}px, ${y}px)`
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{
                  transform: `rotate(${(ghostBearingDeg ?? 0) - bearingDeg}deg)`
                }}
              >
                <polygon
                  points="12,2 21,20 12,15 3,20"
                  fill="rgba(210,210,210,0.9)"
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          );
        })()
      )}

      {/* Ego */}
      {ego && (
        <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <polygon
              points="12,2 21,20 12,15 3,20"
              fill="#E10600"
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}

      {/* Gap (ALWAYS visible now) */}
      {ghostTimeGapS !== null && (
        <div className="absolute top-2 left-2 z-[1000] text-[10px] font-bold bg-black/70 px-2 py-1 text-white">
          {ghostTimeGapS > 0
            ? `+${Math.round(ghostTimeGapS)}s`
            : `${Math.round(ghostTimeGapS)}s`}
        </div>
      )}

      {!hasRoute && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400">
          KEINE STRECKE
        </span>
      )}
    </div>
  );
});