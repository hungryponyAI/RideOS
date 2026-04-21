import { memo, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  coords: Array<[number, number]> | null;
  cumDist: number[] | null;
  positionM: number | null;
}

const CARTO_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const DEFAULT_CENTER: [number, number] = [50.0, 10.0];
const DEFAULT_ZOOM = 5;

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
  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords);
    }
    // Depend on length, not identity — prevents re-fit on every render (UI-SPEC Pitfall 6 guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length]);

  const idx =
    positionM === null
      ? 0
      : Math.min(Math.max(bisectRight(cumDist, positionM) - 1, 0), coords.length - 1);
  const markerPos = coords[idx];

  return (
    <>
      <Polyline
        positions={coords}
        pathOptions={{ color: "#4B5563", weight: 2 }}
      />
      {markerPos && (
        <CircleMarker
          center={markerPos}
          radius={6}
          pathOptions={{
            color: "#F59E0B",
            fillColor: "#F59E0B",
            fillOpacity: 1,
            weight: 2,
          }}
        />
      )}
    </>
  );
}

export const MiniMap = memo(function MiniMap({
  coords,
  cumDist,
  positionM,
}: MiniMapProps) {
  const hasRoute = coords !== null && coords.length > 0 && cumDist !== null;
  return (
    <div className="relative w-[160px] h-[160px] rounded-lg overflow-hidden bg-[#111111] shrink-0">
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
        <TileLayer url={CARTO_DARK} attribution={ATTRIBUTION} />
        {hasRoute && (
          <RouteLayer
            coords={coords}
            cumDist={cumDist}
            positionM={positionM}
          />
        )}
      </MapContainer>
      {!hasRoute && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6B7280] pointer-events-none z-[1000]">
          Keine Strecke
        </span>
      )}
    </div>
  );
});
