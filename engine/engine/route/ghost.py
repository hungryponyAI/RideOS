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
from dataclasses import dataclass
from typing import NamedTuple

_log = logging.getLogger("rideos.ghost")

_EARTH_R = 6_371_000.0


@dataclass(frozen=True)
class GhostPreprocessingConfig:
    preprocessing_version: str = "ghost_preprocessing_v1"
    resample_hz: float = 1.0
    stop_min_duration_s: float = 5.0
    stop_speed_threshold_mps: float = 0.28
    stop_distance_window_m: float = 3.0
    stop_window_s: float = 5.0
    max_progress_during_stop_m: float = 5.0
    gps_spike_speed_mps: float = 20.0
    gps_spike_distance_m: float = 80.0
    min_moving_speed_mps: float = 0.5
    max_reasonable_speed_mps: float = 25.0


@dataclass(frozen=True)
class RemovedStopSegment:
    raw_start_time_s: float
    raw_end_time_s: float
    duration_s: float
    start_distance_m: float
    end_distance_m: float
    reason: str


@dataclass(frozen=True)
class GhostPreprocessingSummary:
    raw_duration_s: float
    corrected_duration_s: float
    removed_stop_time_s: float
    removed_stop_count: int
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class PreprocessedGhostProfile:
    times_s: list[float]
    lats: list[float]
    lons: list[float]
    cum_dist_m: list[float]
    removed_stops: tuple[RemovedStopSegment, ...]
    summary: GhostPreprocessingSummary


@dataclass
class _GhostSample:
    index: int
    lat: float
    lon: float
    raw_time_s: float
    raw_distance_m: float = 0.0
    elevation_m: float | None = None
    raw_speed_mps: float | None = None
    quality_flags: set[str] | None = None

    def flag(self, value: str) -> None:
        if self.quality_flags is None:
            self.quality_flags = set()
        self.quality_flags.add(value)


@dataclass
class _MergedStopCandidate:
    start_i: int
    end_i: int
    reasons: set[str]


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
    dist_m: float  # ghost's position along route in metres


class GhostTracker:
    """Replays a past ride as a ghost opponent driven by elapsed non-paused wall time."""

    _MIN_DT: float = 0.01

    def __init__(
        self,
        times_s: list[float],
        lats: list[float],
        lons: list[float],
        cum_dist_m: list[float],
        preprocessing_summary: GhostPreprocessingSummary | None = None,
    ) -> None:
        assert len(times_s) == len(lats) == len(lons) == len(cum_dist_m)
        self._times = times_s
        self._lats = lats
        self._lons = lons
        self._cum_dist = cum_dist_m
        self._elapsed_s: float = 0.0
        self._last_wall: float = time.monotonic()
        self.preprocessing_summary = preprocessing_summary or GhostPreprocessingSummary(
            raw_duration_s=times_s[-1] if times_s else 0.0,
            corrected_duration_s=times_s[-1] if times_s else 0.0,
            removed_stop_time_s=0.0,
            removed_stop_count=0,
        )

    @classmethod
    def from_strava_streams(cls, streams: dict) -> "GhostTracker":
        """Build from raw Strava streams JSON ({time: {data: [...]}, latlng: {data: [...]}})."""
        profile = preprocess_strava_streams(streams)
        return cls(
            profile.times_s,
            profile.lats,
            profile.lons,
            profile.cum_dist_m,
            profile.summary,
        )

    @classmethod
    def from_strava_streams_clipped(
        cls, streams: dict, start_m: float, end_m: float
    ) -> "GhostTracker":
        """Build from Strava streams, clipped to [start_m, end_m] of the ghost's own cum-dist."""
        clipped = _clip_streams_by_distance(streams, start_m, end_m)
        return cls.from_strava_streams(clipped)

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
            return GhostSnapshot(0.0, 0.0, 0.0, 0.0, 0.0)

        ghost_total = self._times[-1] if self._times[-1] > 0 else 1.0
        elapsed_mod = self._elapsed_s % ghost_total

        lat, lng = self._coord_at_time(elapsed_mod)
        next_lat, next_lng = self._coord_at_time(min(elapsed_mod + 0.5, ghost_total))
        bearing = (
            _bearing_deg(lat, lng, next_lat, next_lng)
            if (lat, lng) != (next_lat, next_lng)
            else 0.0
        )

        # time_gap within current lap
        ghost_time_at_rider = self._time_at_dist(rider_position_m)
        time_gap_s = elapsed_mod - ghost_time_at_rider
        ghost_dist_m = self._dist_at_time(elapsed_mod)

        return GhostSnapshot(lat, lng, bearing, time_gap_s, ghost_dist_m)

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

    def _dist_at_time(self, elapsed_s: float) -> float:
        if not self._times:
            return 0.0
        idx = max(0, min(bisect.bisect_right(self._times, elapsed_s) - 1, len(self._cum_dist) - 1))
        next_idx = min(idx + 1, len(self._cum_dist) - 1)
        if next_idx == idx:
            return self._cum_dist[idx]
        t0, t1 = self._times[idx], self._times[next_idx]
        d0, d1 = self._cum_dist[idx], self._cum_dist[next_idx]
        if t1 == t0:
            return d0
        return d0 + (elapsed_s - t0) / (t1 - t0) * (d1 - d0)

    def _coord_at_time(self, elapsed_s: float) -> tuple[float, float]:
        if not self._times:
            return 0.0, 0.0
        idx = max(0, min(bisect.bisect_right(self._times, elapsed_s) - 1, len(self._times) - 1))
        next_idx = min(idx + 1, len(self._times) - 1)
        if next_idx == idx:
            return self._lats[idx], self._lons[idx]
        t0, t1 = self._times[idx], self._times[next_idx]
        if t1 == t0:
            return self._lats[idx], self._lons[idx]
        t = (elapsed_s - t0) / (t1 - t0)
        lat = self._lats[idx] + (self._lats[next_idx] - self._lats[idx]) * t
        lon = self._lons[idx] + (self._lons[next_idx] - self._lons[idx]) * t
        return lat, lon


def preprocess_strava_streams(
    streams: dict,
    config: GhostPreprocessingConfig | None = None,
) -> PreprocessedGhostProfile:
    """Normalize and clean Strava streams into a corrected moving-time profile."""
    cfg = config or GhostPreprocessingConfig()
    warnings: list[str] = []
    samples = _normalize_strava_streams(streams, cfg, warnings)
    if not samples:
        raise ValueError("Strava streams missing time or latlng data")

    removed_stops = _detect_stops(samples, cfg)
    times, lats, lons, cum = _compress_timeline(samples, removed_stops)
    _enforce_monotonic_reasonable_timing(times, cum, cfg, warnings)

    raw_duration_s = samples[-1].raw_time_s if samples else 0.0
    corrected_duration_s = times[-1] if times else 0.0
    removed_stop_time_s = sum(stop.duration_s for stop in removed_stops)
    summary = GhostPreprocessingSummary(
        raw_duration_s=raw_duration_s,
        corrected_duration_s=corrected_duration_s,
        removed_stop_time_s=removed_stop_time_s,
        removed_stop_count=len(removed_stops),
        warnings=tuple(warnings),
    )
    return PreprocessedGhostProfile(
        times_s=times,
        lats=lats,
        lons=lons,
        cum_dist_m=cum,
        removed_stops=tuple(removed_stops),
        summary=summary,
    )


def _normalize_strava_streams(
    streams: dict,
    config: GhostPreprocessingConfig,
    warnings: list[str],
) -> list[_GhostSample]:
    latlng_data = streams.get("latlng", {}).get("data", [])
    if not latlng_data:
        return []

    time_data = streams.get("time", {}).get("data", [])
    distance_data = streams.get("distance", {}).get("data", [])
    altitude_data = streams.get("altitude", {}).get("data", [])
    speed_data = streams.get("velocity_smooth", {}).get("data", [])

    samples: list[_GhostSample] = []
    first_time: float | None = None
    prev_time = -math.inf
    invalid_coords = 0
    duplicate_times = 0

    for i, pair in enumerate(latlng_data):
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            invalid_coords += 1
            continue
        lat = float(pair[0])
        lon = float(pair[1])
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            invalid_coords += 1
            continue

        raw_t = float(time_data[i]) if i < len(time_data) else float(len(samples))
        if first_time is None:
            first_time = raw_t
        raw_time_s = raw_t - first_time
        if raw_time_s <= prev_time:
            duplicate_times += 1
            raw_time_s = prev_time + (1.0 / max(config.resample_hz, 0.1))
        prev_time = raw_time_s

        elevation_m = float(altitude_data[i]) if i < len(altitude_data) and altitude_data[i] is not None else None
        raw_speed_mps = float(speed_data[i]) if i < len(speed_data) and speed_data[i] is not None else None
        samples.append(_GhostSample(
            index=i,
            lat=lat,
            lon=lon,
            raw_time_s=raw_time_s,
            elevation_m=elevation_m,
            raw_speed_mps=raw_speed_mps,
        ))

    if invalid_coords:
        warnings.append(f"ignored_invalid_gps_points={invalid_coords}")
    if duplicate_times:
        warnings.append(f"repaired_duplicate_timestamps={duplicate_times}")
    if not time_data:
        warnings.append("synthetic_timeline_used")

    _interpolate_single_point_gps_spikes(samples, config, warnings)
    gps_cum = _calculate_cumulative_distance(samples)
    _assign_distances(samples, gps_cum, distance_data, warnings)
    _assign_fallback_speeds(samples)
    _flag_gps_gaps(samples, config, warnings)
    return samples


def _interpolate_single_point_gps_spikes(
    samples: list[_GhostSample],
    config: GhostPreprocessingConfig,
    warnings: list[str],
) -> None:
    interpolated = 0
    for i in range(1, len(samples) - 1):
        prev = samples[i - 1]
        cur = samples[i]
        nxt = samples[i + 1]
        dt_prev = max(0.01, cur.raw_time_s - prev.raw_time_s)
        dt_next = max(0.01, nxt.raw_time_s - cur.raw_time_s)
        prev_to_cur = _haversine_m(prev.lat, prev.lon, cur.lat, cur.lon)
        cur_to_next = _haversine_m(cur.lat, cur.lon, nxt.lat, nxt.lon)
        prev_to_next = _haversine_m(prev.lat, prev.lon, nxt.lat, nxt.lon)
        is_spike = (
            prev_to_cur / dt_prev > config.gps_spike_speed_mps
            and cur_to_next / dt_next > config.gps_spike_speed_mps
            and prev_to_next < config.gps_spike_distance_m
        )
        if not is_spike:
            continue
        span = max(0.01, nxt.raw_time_s - prev.raw_time_s)
        t = (cur.raw_time_s - prev.raw_time_s) / span
        cur.lat = prev.lat + (nxt.lat - prev.lat) * t
        cur.lon = prev.lon + (nxt.lon - prev.lon) * t
        cur.flag("GPS_SPIKE")
        cur.flag("INTERPOLATED")
        interpolated += 1

    if interpolated:
        warnings.append(f"interpolated_gps_spikes={interpolated}")


def _calculate_cumulative_distance(samples: list[_GhostSample]) -> list[float]:
    if not samples:
        return []
    cum = [0.0]
    for i in range(1, len(samples)):
        cum.append(cum[-1] + _haversine_m(
            samples[i - 1].lat,
            samples[i - 1].lon,
            samples[i].lat,
            samples[i].lon,
        ))
    return cum


def _assign_distances(
    samples: list[_GhostSample],
    gps_cum: list[float],
    distance_data: list,
    warnings: list[str],
) -> None:
    has_stream_distance = bool(distance_data)
    first_stream_distance: float | None = None
    repaired_decreases = 0
    prev_distance = 0.0

    for seq_i, sample in enumerate(samples):
        stream_distance: float | None = None
        if has_stream_distance and sample.index < len(distance_data) and distance_data[sample.index] is not None:
            if first_stream_distance is None:
                first_stream_distance = float(distance_data[sample.index])
            stream_distance = max(0.0, float(distance_data[sample.index]) - first_stream_distance)

        if stream_distance is None:
            distance = gps_cum[seq_i]
        elif stream_distance < prev_distance:
            repaired_decreases += 1
            gps_delta = gps_cum[seq_i] - gps_cum[seq_i - 1] if seq_i > 0 else 0.0
            distance = prev_distance + max(0.0, gps_delta)
        else:
            distance = stream_distance

        sample.raw_distance_m = distance
        prev_distance = distance

    if repaired_decreases:
        warnings.append(f"repaired_distance_decreases={repaired_decreases}")
    if not has_stream_distance:
        warnings.append("gps_distance_fallback_used")


def _assign_fallback_speeds(samples: list[_GhostSample]) -> None:
    for i, sample in enumerate(samples):
        if sample.raw_speed_mps is not None:
            continue
        if i == 0:
            sample.raw_speed_mps = 0.0
            continue
        dt = max(0.01, sample.raw_time_s - samples[i - 1].raw_time_s)
        sample.raw_speed_mps = max(0.0, (sample.raw_distance_m - samples[i - 1].raw_distance_m) / dt)


def _flag_gps_gaps(
    samples: list[_GhostSample],
    config: GhostPreprocessingConfig,
    warnings: list[str],
) -> None:
    gaps = 0
    for i in range(1, len(samples)):
        prev = samples[i - 1]
        cur = samples[i]
        dt = max(0.01, cur.raw_time_s - prev.raw_time_s)
        segment_m = _haversine_m(prev.lat, prev.lon, cur.lat, cur.lon)
        if segment_m / dt > config.gps_spike_speed_mps or (
            segment_m > config.gps_spike_distance_m and dt <= 2.0
        ):
            cur.flag("GPS_GAP")
            gaps += 1
    if gaps:
        warnings.append(f"gps_gap_segments={gaps}")


def _detect_stops(
    samples: list[_GhostSample],
    config: GhostPreprocessingConfig,
) -> list[RemovedStopSegment]:
    candidate_ranges: list[tuple[int, int, str]] = []
    times = [s.raw_time_s for s in samples]
    for i, start in enumerate(samples):
        target_t = start.raw_time_s + config.stop_window_s
        j = bisect.bisect_left(times, target_t, i + 1)
        if j >= len(samples):
            continue
        end = samples[j]
        duration = end.raw_time_s - start.raw_time_s
        if duration <= 0.0:
            continue
        distance_progress = end.raw_distance_m - start.raw_distance_m
        avg_speed = distance_progress / duration
        gps_movement = _haversine_m(start.lat, start.lon, end.lat, end.lon)
        stationary = gps_movement < config.stop_distance_window_m
        low_speed = avg_speed < config.stop_speed_threshold_mps
        is_candidate = (low_speed or stationary) and distance_progress < config.max_progress_during_stop_m
        if is_candidate:
            reason = "GPS_STATIONARY" if stationary else "LOW_SPEED_NO_DISTANCE"
            candidate_ranges.append((i, j, reason))

    if not candidate_ranges:
        return []

    merged: list[_MergedStopCandidate] = []
    for start_i, end_i, reason in candidate_ranges:
        if not merged or start_i > merged[-1].end_i + 1:
            merged.append(_MergedStopCandidate(start_i=start_i, end_i=end_i, reasons={reason}))
            continue
        merged[-1].end_i = max(merged[-1].end_i, end_i)
        merged[-1].reasons.add(reason)

    stops: list[RemovedStopSegment] = []
    for candidate in merged:
        start = samples[candidate.start_i]
        end = samples[candidate.end_i]
        duration = end.raw_time_s - start.raw_time_s
        if duration <= config.stop_min_duration_s:
            continue
        stops.append(RemovedStopSegment(
            raw_start_time_s=start.raw_time_s,
            raw_end_time_s=end.raw_time_s,
            duration_s=duration,
            start_distance_m=start.raw_distance_m,
            end_distance_m=end.raw_distance_m,
            reason=(
                "GPS_STATIONARY"
                if "GPS_STATIONARY" in candidate.reasons
                else "LOW_SPEED_NO_DISTANCE"
            ),
        ))
    return stops


def _compress_timeline(
    samples: list[_GhostSample],
    stops: list[RemovedStopSegment],
) -> tuple[list[float], list[float], list[float], list[float]]:
    if not samples:
        return [], [], [], []
    times: list[float] = []
    lats: list[float] = []
    lons: list[float] = []
    cum: list[float] = []
    stop_idx = 0
    removed_before = 0.0

    for sample in samples:
        while stop_idx < len(stops) and sample.raw_time_s > stops[stop_idx].raw_end_time_s:
            removed_before += stops[stop_idx].duration_s
            stop_idx += 1
        if (
            stop_idx < len(stops)
            and stops[stop_idx].raw_start_time_s < sample.raw_time_s <= stops[stop_idx].raw_end_time_s
        ):
            continue
        corrected_time = sample.raw_time_s - removed_before
        if times and corrected_time <= times[-1]:
            corrected_time = times[-1] + 0.01
        times.append(corrected_time)
        lats.append(sample.lat)
        lons.append(sample.lon)
        cum.append(sample.raw_distance_m)

    if not times:
        first = samples[0]
        times = [0.0]
        lats = [first.lat]
        lons = [first.lon]
        cum = [first.raw_distance_m]
    return times, lats, lons, cum


def _enforce_monotonic_reasonable_timing(
    times: list[float],
    cum: list[float],
    config: GhostPreprocessingConfig,
    warnings: list[str],
) -> None:
    stretched_segments = 0
    for i in range(1, len(times)):
        if times[i] <= times[i - 1]:
            delta = times[i - 1] + 0.01 - times[i]
            for j in range(i, len(times)):
                times[j] += delta
        distance_delta = max(0.0, cum[i] - cum[i - 1])
        min_dt = distance_delta / config.max_reasonable_speed_mps if distance_delta > 0.0 else 0.01
        actual_dt = times[i] - times[i - 1]
        if actual_dt < min_dt:
            delta = min_dt - actual_dt
            for j in range(i, len(times)):
                times[j] += delta
            stretched_segments += 1
    if stretched_segments:
        warnings.append(f"stretched_unreasonable_speed_segments={stretched_segments}")


def _clip_streams_by_distance(streams: dict, start_m: float, end_m: float) -> dict:
    latlng_data = streams.get("latlng", {}).get("data", [])
    if not latlng_data:
        raise ValueError("Strava streams missing latlng data")
    n = len(latlng_data)
    distance_data = streams.get("distance", {}).get("data", [])
    if distance_data:
        first_distance = float(distance_data[0])
        cum = [max(0.0, float(d) - first_distance) for d in distance_data[:n]]
    else:
        cum = [0.0]
        for i in range(1, n):
            cum.append(cum[-1] + _haversine_m(
                float(latlng_data[i - 1][0]),
                float(latlng_data[i - 1][1]),
                float(latlng_data[i][0]),
                float(latlng_data[i][1]),
            ))

    i_start = max(0, bisect.bisect_right(cum, start_m) - 1)
    i_end = min(n, bisect.bisect_left(cum, end_m) + 1)
    if i_end <= i_start + 1:
        raise ValueError("Ghost stream clip range is too narrow")

    clipped: dict = {}
    for key, value in streams.items():
        if not isinstance(value, dict) or "data" not in value:
            clipped[key] = value
            continue
        data = value.get("data", [])
        sliced = data[i_start:min(i_end, len(data))]
        entry = dict(value)
        if key == "time" and sliced:
            t0 = float(sliced[0])
            sliced = [float(v) - t0 for v in sliced]
        elif key == "distance" and sliced:
            d0 = float(sliced[0])
            sliced = [float(v) - d0 for v in sliced]
        entry["data"] = sliced
        clipped[key] = entry
    return clipped
