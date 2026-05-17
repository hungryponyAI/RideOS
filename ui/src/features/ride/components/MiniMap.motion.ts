export const TAU_POSITION_MS = 180;
export const TAU_GHOST_MS = 220;
export const TAU_CAMERA_CENTER_MS = 250;
export const TAU_CAMERA_BEARING_MS = 400;
export const TAU_CAMERA_PITCH_ZOOM_MS = 600;

export const SAMPLE_PERIOD_MS = 250;
export const EXTRAPOLATION_HORIZON_MS = 500;
export const STALE_FREEZE_MS = 1000;
export const STALE_FADE_MS = 3000;
export const RECONNECT_SNAP_MS = 5000;

export const ROUTE_PROJECTION_TOLERANCE_M = 6;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function springAlpha(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  if (dtMs <= 0) return 0;
  return 1 - Math.exp(-dtMs / tauMs);
}

export function lerpAngleDeg(from: number, to: number, alpha: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * alpha + 360) % 360;
}

export function clampExtrapolationM(
  speedMPerS: number,
  sampleAgeMs: number,
  horizonMs: number = EXTRAPOLATION_HORIZON_MS,
): number {
  if (!Number.isFinite(speedMPerS) || speedMPerS <= 0) return 0;
  if (!Number.isFinite(sampleAgeMs) || sampleAgeMs <= 0) return 0;
  const capped = Math.min(sampleAgeMs, horizonMs);
  return speedMPerS * (capped / 1000);
}

const EARTH_R_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface ProjectionResult {
  distM: number;
  lat: number;
  lng: number;
  crossTrackM: number;
}

export function projectOntoRoute(
  lat: number,
  lng: number,
  coords: Array<[number, number]>,
  cumDist: number[],
  toleranceM: number = ROUTE_PROJECTION_TOLERANCE_M,
): ProjectionResult | null {
  if (coords.length < 2 || cumDist.length !== coords.length) return null;
  let bestCross = Infinity;
  let bestDistM = 0;
  let bestLat = lat;
  let bestLng = lng;
  const cosLat = Math.cos(toRad(lat));
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[i + 1];
    const ax = (lng2 - lng1) * cosLat;
    const ay = lat2 - lat1;
    const bx = (lng - lng1) * cosLat;
    const by = lat - lat1;
    const denom = ax * ax + ay * ay;
    if (denom <= 0) continue;
    const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / denom));
    const projLat = lat1 + ay * t;
    const projLng = lng1 + (lng2 - lng1) * t;
    const cross = haversineM(lat, lng, projLat, projLng);
    if (cross < bestCross) {
      bestCross = cross;
      bestLat = projLat;
      bestLng = projLng;
      const segLen = cumDist[i + 1] - cumDist[i];
      bestDistM = cumDist[i] + segLen * t;
    }
  }
  if (bestCross > toleranceM) return null;
  return { distM: bestDistM, lat: bestLat, lng: bestLng, crossTrackM: bestCross };
}
