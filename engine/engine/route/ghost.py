"""GhostTracker: replay a past ride as a moving ghost marker on the map.

Two modes:
- from_strava_streams: exact time-based playback from Strava time/latlng streams
- from_fallback: uniform pace derived from total_time_s estimate

time_gap_s convention (GhostSnapshot):
  > 0: ghost is ahead of rider
  < 0: rider is ahead of ghost
"""
from __future__ import annotations

import bisect
import logging
import math
import time
from typing import NamedTuple

_log = logging.getLogger("rideos.ghost")

_EARTH_R = 6_371_000.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    dlat = r(lat2 - lat1)
    dlon = r(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(a))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    dlon = r(lon2 - lon1)
    y = math.sin(dlon) * math.cos(r(lat2))
    x = math.cos(r(lat1)) * math.sin(r(lat2)) - math.sin(r(lat1)) * math.cos(r(lat2)) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


class GhostSnapshot(NamedTuple):
    lat: float
    lng: float
    bearing_deg: float
    time_gap_s: float  # >0 ghost leads, <0 rider leads


class GhostTracker:
    """Replays a past ride as a ghost opponent driven by elapsed non-paused wall time."""

    _MIN_DT: float = 0.01

    def __init__(
        self,
        times_s: list[float],
        lats: list[float],
        lons: list[float],
        cum_dist_m: list[float],
    ) -> None:
        assert len(times_s) == len(lats) == len(lons) == len(cum_dist_m)
        self._times = times_s
        self._lats = lats
        self._lons = lons
        self._cum_dist = cum_dist_m
        self._elapsed_s: float = 0.0
        self._last_wall: float = time.monotonic()

    @classmethod
    def from_strava_streams(cls, streams: dict) -> "GhostTracker":
        """Build from raw Strava streams JSON ({time: {data: [...]}, latlng: {data: [...]}})."""
        time_data = streams.get("time", {}).get("data", [])
        latlng_data = streams.get("latlng", {}).get("data", [])
        if not time_data or not latlng_data:
            raise ValueError("Strava streams missing time or latlng data")
        n = min(len(time_data), len(latlng_data))
        times = [float(time_data[i]) for i in range(n)]
        lats = [float(latlng_data[i][0]) for i in range(n)]
        lons = [float(latlng_data[i][1]) for i in range(n)]
        cum: list[float] = [0.0]
        for i in range(1, n):
            cum.append(cum[-1] + _haversine_m(lats[i - 1], lons[i - 1], lats[i], lons[i]))
        return cls(times, lats, lons, cum)

    @classmethod
    def from_strava_streams_clipped(
        cls, streams: dict, start_m: float, end_m: float
    ) -> "GhostTracker":
        """Build from Strava streams, clipped to [start_m, end_m] of the ghost's own cum-dist."""
        time_data = streams.get("time", {}).get("data", [])
        latlng_data = streams.get("latlng", {}).get("data", [])
        if not time_data or not latlng_data:
            raise ValueError("Strava streams missing time or latlng data")
        n = min(len(time_data), len(latlng_data))
        times = [float(time_data[i]) for i in range(n)]
        lats = [float(latlng_data[i][0]) for i in range(n)]
        lons = [float(latlng_data[i][1]) for i in range(n)]
        cum: list[float] = [0.0]
        for i in range(1, n):
            cum.append(cum[-1] + _haversine_m(lats[i - 1], lons[i - 1], lats[i], lons[i]))
        # Find slice indices within ghost's own cum-dist
        import bisect as _bisect
        i_start = max(0, _bisect.bisect_right(cum, start_m) - 1)
        i_end = min(n, _bisect.bisect_left(cum, end_m) + 1)
        if i_end <= i_start + 1:
            raise ValueError("Ghost stream clip range is too narrow")
        times = times[i_start:i_end]
        lats = lats[i_start:i_end]
        lons = lons[i_start:i_end]
        cum = cum[i_start:i_end]
        t0 = times[0]
        c0 = cum[0]
        times = [t - t0 for t in times]
        cum = [c - c0 for c in cum]
        return cls(times, lats, lons, cum)

    @classmethod
    def from_fallback(
        cls,
        lats: list[float],
        lons: list[float],
        cum_dist_m: list[float],
        total_time_s: float,
    ) -> "GhostTracker":
        """Build a uniform-pace ghost from route coords and an estimated total time."""
        total_dist = cum_dist_m[-1] if cum_dist_m else 1.0
        if total_dist <= 0:
            total_dist = 1.0
        times = [d / total_dist * total_time_s for d in cum_dist_m]
        return cls(times, lats, lons, list(cum_dist_m))

    # ------------------------------------------------------------------

    def tick(self, paused: bool) -> None:
        """Advance ghost clock by wall time elapsed since last tick. Skips when paused."""
        now = time.monotonic()
        dt = now - self._last_wall
        self._last_wall = now
        if not paused and dt >= self._MIN_DT:
            self._elapsed_s += dt

    def snapshot(self, rider_position_m: float, lap_index: int = 0) -> GhostSnapshot:
        """Return ghost position + time gap for current elapsed time.

        With laps the ghost loops using modulo on ghost_total. time_gap_s is
        computed within the current lap for both ghost and rider.
        """
        n = len(self._times)
        if n == 0:
            return GhostSnapshot(0.0, 0.0, 0.0, 0.0)

        ghost_total = self._times[-1] if self._times[-1] > 0 else 1.0
        elapsed_mod = self._elapsed_s % ghost_total

        idx = max(0, min(bisect.bisect_right(self._times, elapsed_mod) - 1, n - 1))
        lat, lng = self._lats[idx], self._lons[idx]

        next_idx = min(idx + 1, n - 1)
        bearing = (
            _bearing_deg(lat, lng, self._lats[next_idx], self._lons[next_idx])
            if next_idx != idx
            else 0.0
        )

        # time_gap within current lap
        ghost_time_at_rider = self._time_at_dist(rider_position_m)
        time_gap_s = elapsed_mod - ghost_time_at_rider

        return GhostSnapshot(lat, lng, bearing, time_gap_s)

    def _time_at_dist(self, dist_m: float) -> float:
        if not self._cum_dist:
            return 0.0
        idx = max(0, min(bisect.bisect_right(self._cum_dist, dist_m) - 1, len(self._times) - 1))
        next_idx = min(idx + 1, len(self._times) - 1)
        if next_idx == idx:
            return self._times[idx]
        d0, d1 = self._cum_dist[idx], self._cum_dist[next_idx]
        t0, t1 = self._times[idx], self._times[next_idx]
        if d1 == d0:
            return t0
        return t0 + (dist_m - d0) / (d1 - d0) * (t1 - t0)
