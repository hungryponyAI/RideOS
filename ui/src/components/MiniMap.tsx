import { memo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// Default center: roughly central Europe (doesn't matter for empty state)
const DEFAULT_CENTER: [number, number] = [50.0, 10.0];
const DEFAULT_ZOOM = 5;

export const MiniMap = memo(function MiniMap() {
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
      </MapContainer>
      <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6B7280] pointer-events-none z-[1000]">
        Keine Strecke
      </span>
    </div>
  );
});
