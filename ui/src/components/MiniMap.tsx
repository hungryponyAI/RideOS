import { memo, useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;
  isDark: boolean;
  ghostLat: number | null;
  ghostLng: number | null;
  ghostBearingDeg: number | null;
  ghostTimeGapS: number | null;
}

const CARTO_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const DEFAULT_CENTER: [number, number] = [50.0, 10.0];
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

// RouteLayer: pans map to keep current position centred. No marker — ego is an HTML overlay.
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

  const idx = positionM === null
    ? 0
    : Math.min(Math.max(bisectRight(cumDist, positionM) - 1, 0), coords.length - 1);
  const pos = coords[idx];
  const lat = pos?.[0];
  const lng = pos?.[1];

  // Fit overview when route first loads.
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords, { animate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length]);

  // Keep ego centred by panning the map — no animation; CSS rotation handles smoothness.
  useEffect(() => {
    if (positionM === null || lat == null || lng == null) return;
    map.setView([lat, lng], RIDING_ZOOM, { animate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <Polyline
      positions={coords}
      pathOptions={{ color: "#FFF200", weight: 2 }}
    />
  );
}

function GhostLayer({ lat, lng, bearingDeg }: { lat: number; lng: number; bearingDeg: number }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: `<svg width="18" height="18" viewBox="0 0 24 24" style="transform:rotate(${bearingDeg}deg);transform-origin:50% 50%"><polygon points="12,2 21,20 12,15 3,20" fill="rgba(210,210,210,0.85)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
        className: "",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [bearingDeg],
  );
  return <Marker position={[lat, lng]} icon={icon} />;
}

export const MiniMap = memo(function MiniMap({
  coords,
  cumDist,
  positionM,
  isDark,
  ghostLat,
  ghostLng,
  ghostBearingDeg,
  ghostTimeGapS,
}: MiniMapProps) {
  const hasRoute = coords !== null && coords.length > 0 && cumDist !== null;
  const tileUrl = isDark ? CARTO_DARK : CARTO_LIGHT;

  // Bearing: heading from current position towards a lookahead point on the route.
  // Used to rotate the map so the direction of travel always points up.
  const bearingDeg = useMemo(() => {
    if (!hasRoute || coords!.length < 2) return 0;
    const posM = positionM ?? 0;
    const curIdx = Math.min(
      Math.max(bisectRight(cumDist!, posM) - 1, 0),
      coords!.length - 1,
    );
    const aheadIdx = Math.min(
      Math.max(bisectRight(cumDist!, posM + BEARING_LOOKAHEAD_M) - 1, curIdx + 1),
      coords!.length - 1,
    );
    if (curIdx === aheadIdx) return 0;
    return calcBearing(
      coords![curIdx][0], coords![curIdx][1],
      coords![aheadIdx][0], coords![aheadIdx][1],
    );
  }, [hasRoute, positionM, coords, cumDist]);

  const showEgo = hasRoute && positionM !== null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--map-bg)]">

      {/*
        The map container is 150% of the visible area and centred via negative offsets.
        This ensures tile coverage in all corners as the map rotates.
        The entire block rotates around its own centre (= the visible area's centre),
        so the rider's position — which the map always pans to centre — stays fixed on screen.
      */}
      <div
        className="absolute w-[150%] h-[150%] -top-[25%] -left-[25%] transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${-bearingDeg}deg)`, transformOrigin: "50% 50%" }}
      >
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
        >
          <TileLayer key={tileUrl} url={tileUrl} attribution={ATTRIBUTION} />
          {hasRoute && (
            <RouteLayer
              coords={coords!}
              cumDist={cumDist!}
              positionM={positionM}
            />
          )}
          {ghostLat !== null && ghostLng !== null && ghostBearingDeg !== null && (
            <GhostLayer lat={ghostLat} lng={ghostLng} bearingDeg={ghostBearingDeg} />
          )}
        </MapContainer>
      </div>

      {/* Ghost gap indicator: top-left corner, outside rotating layer. */}
      {ghostTimeGapS !== null && ghostLat !== null && (
        <div className="absolute top-2 left-2 z-[1000] pointer-events-none">
          <div
            className={`flex items-center gap-1 bg-black/75 px-2 py-1 text-[10px] font-condensed font-bold tracking-widest uppercase ${
              ghostTimeGapS > 0 ? "text-red-400" : "text-[#22C55E]"
            }`}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="12,2 21,20 12,15 3,20" fill="currentColor" opacity="0.8" />
            </svg>
            {ghostTimeGapS > 0
              ? `+${Math.round(Math.abs(ghostTimeGapS))}s`
              : `−${Math.round(Math.abs(ghostTimeGapS))}s`}
          </div>
        </div>
      )}

      {/* Ego marker: fixed at screen centre, outside the rotating layer. */}
      {showEgo && (
        <div
          className="absolute inset-0 pointer-events-none z-[1000] flex items-center justify-center"
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            {/* Arrowhead pointing up = direction of travel */}
            <polygon
              points="12,2 21,20 12,15 3,20"
              fill="#E10600"
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {!hasRoute && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)] pointer-events-none z-[1000]">
          KEINE STRECKE
        </span>
      )}
    </div>
  );
});
