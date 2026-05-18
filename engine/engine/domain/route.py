"""RouteData and pure GPX transformations — no file I/O, no asyncio.

RouteData is parsed once from GPX content and consumed by the tracker at 4 Hz.
All distance/grade arithmetic is done upfront; the hot path only does O(log n)
bisect lookups.

File I/O (open + read) stays in adapters/; this module only processes strings.
"""
from __future__ import annotations

import bisect
import logging
import math
from dataclasses import dataclass
from datetime import datetime as _dt
from typing import List, Tuple

import gpxpy
import gpxpy.geo

_log = logging.getLogger("rideos.route")

# KICKR Core safe range per FTMS simulation parameters (also protects trainer).
_GRADE_CLAMP_PCT: float = 20.0
# 5-point rolling mean = ~10-50 m window at typical GPS point spacing.
_SMOOTH_WINDOW: int = 5


@dataclass(frozen=True)
class RouteData:
    lats: Tuple[float, ...]
    lons: Tuple[float, ...]
    elevations_m: Tuple[float, ...]
    cum_dist_m: Tuple[float, ...]
    grades_pct: Tuple[float, ...]
    total_dist_m: float
    curve_radius_m: Tuple[float | None, ...] = ()
    curve_speed_limit_mps: Tuple[float | None, ...] = ()


@dataclass(frozen=True)
class CurveProfileConfig:
    """Offline curve realism defaults for route progress limiting."""

    curve_resample_distance_m: float = 3.0
    curve_lookahead_window_m: float = 15.0
    curve_smoothing_window_m: float = 12.0
    geometry_smoothing_points: int = 7
    max_reasonable_speed_mps: float = 25.0
    max_virtual_accel_mps2: float = 1.0
    max_virtual_decel_mps2: float = 1.5
    straight_radius_threshold_m: float = 600.0


# ---------------------------------------------------------------------------
# GPX parsing
# ---------------------------------------------------------------------------

def load_gpx_content(content: str, source_label: str = "<string>") -> RouteData:
    """Parse GPX XML string into a RouteData — pure, no file I/O."""
    return _parse_gpx(content, source_label=source_label)


def _parse_gpx(content: str, source_label: str) -> RouteData:
    gpx = gpxpy.parse(content)
    points = [
        pt
        for track in gpx.tracks
        for seg in track.segments
        for pt in seg.points
    ]
    if not points:
        points = [pt for route in gpx.routes for pt in route.points]  # type: ignore[misc]
    if not points:
        raise ValueError(
            f"GPX {source_label} contains no track points or route points"
        )

    lats = [pt.latitude for pt in points]
    lons = [pt.longitude for pt in points]
    eles_raw = [pt.elevation for pt in points]
    missing = sum(1 for e in eles_raw if e is None)
    if missing:
        _log.warning(
            "GPX: %d/%d points have no elevation; treating as 0.0 m",
            missing, len(points),
        )
    eles = [e if e is not None else 0.0 for e in eles_raw]

    cum: List[float] = [0.0]
    for i in range(1, len(points)):
        d = gpxpy.geo.haversine_distance(
            lats[i - 1], lons[i - 1], lats[i], lons[i]
        )
        cum.append(cum[-1] + d)

    raw_grades: List[float] = []
    for i in range(len(points)):
        if i == 0:
            raw_grades.append(0.0)
        else:
            d_seg = cum[i] - cum[i - 1]
            if d_seg < 0.1:
                raw_grades.append(0.0)
            else:
                raw_grades.append((eles[i] - eles[i - 1]) / d_seg * 100.0)

    smooth_grades = _rolling_mean(raw_grades, window=_SMOOTH_WINDOW)
    clamped = [
        max(-_GRADE_CLAMP_PCT, min(_GRADE_CLAMP_PCT, g))
        for g in smooth_grades
    ]

    return RouteData(
        lats=tuple(lats),
        lons=tuple(lons),
        elevations_m=tuple(eles),
        cum_dist_m=tuple(cum),
        grades_pct=tuple(clamped),
        total_dist_m=cum[-1],
    )


# ---------------------------------------------------------------------------
# Curve profile preprocessing
# ---------------------------------------------------------------------------

def with_curve_profile(
    route: RouteData,
    config: CurveProfileConfig | None = None,
) -> RouteData:
    """Return `route` with precomputed curve radii and route-speed caps.

    The profile is derived offline from smoothed route geometry and stored per
    original route point. Runtime code only interpolates these fields.
    """
    cfg = config or CurveProfileConfig()
    n = len(route.cum_dist_m)
    empty_profile = tuple(None for _ in route.cum_dist_m)
    if n < 3 or route.total_dist_m <= 0.0:
        return RouteData(
            lats=route.lats,
            lons=route.lons,
            elevations_m=route.elevations_m,
            cum_dist_m=route.cum_dist_m,
            grades_pct=route.grades_pct,
            total_dist_m=route.total_dist_m,
            curve_radius_m=empty_profile,
            curve_speed_limit_mps=empty_profile,
        )

    step_m = max(1.0, cfg.curve_resample_distance_m)
    resampled_dist = [0.0]
    while resampled_dist[-1] + step_m < route.total_dist_m:
        resampled_dist.append(resampled_dist[-1] + step_m)
    if resampled_dist[-1] < route.total_dist_m:
        resampled_dist.append(route.total_dist_m)

    resampled = [_sample_route_at(route, d) for d in resampled_dist]
    lats = [p[0] for p in resampled]
    lons = [p[1] for p in resampled]
    grades = [p[3] for p in resampled]

    xs, ys = _project_to_local_xy(lats, lons)
    geom_window = max(3, cfg.geometry_smoothing_points)
    xs = _rolling_mean(xs, window=geom_window)
    ys = _rolling_mean(ys, window=geom_window)

    curvatures = _calculate_curvatures(resampled_dist, xs, ys, cfg.curve_lookahead_window_m)
    curvature_window = max(3, round(cfg.curve_smoothing_window_m / step_m))
    curvatures = _rolling_mean(curvatures, window=curvature_window)

    radii = [
        None
        if c <= 0.0 or (1.0 / c) >= cfg.straight_radius_threshold_m
        else 1.0 / c
        for c in curvatures
    ]
    raw_caps = [
        _apply_downhill_curve_correction(_base_curve_speed_limit(radius), grade)
        for radius, grade in zip(radii, grades)
    ]
    speed_caps = _smooth_speed_caps(resampled_dist, raw_caps, cfg)

    original_radii: list[float | None] = []
    original_caps: list[float | None] = []
    for distance_m in route.cum_dist_m:
        curvature = _interpolate_numeric(resampled_dist, curvatures, distance_m)
        radius = (
            None
            if curvature <= 0.0 or (1.0 / curvature) >= cfg.straight_radius_threshold_m
            else 1.0 / curvature
        )
        cap = _interpolate_numeric(resampled_dist, speed_caps, distance_m)
        original_radii.append(radius)
        original_caps.append(
            None
            if cap >= cfg.max_reasonable_speed_mps - 0.05
            else max(0.0, min(cfg.max_reasonable_speed_mps, cap))
        )

    return RouteData(
        lats=route.lats,
        lons=route.lons,
        elevations_m=route.elevations_m,
        cum_dist_m=route.cum_dist_m,
        grades_pct=route.grades_pct,
        total_dist_m=route.total_dist_m,
        curve_radius_m=tuple(original_radii),
        curve_speed_limit_mps=tuple(original_caps),
    )


def extract_gpx_name(content: str) -> str:
    """Extract a human-readable name from GPX content. Falls back to a timestamp."""
    try:
        gpx = gpxpy.parse(content)
        if gpx.name and gpx.name.strip():
            return gpx.name.strip()
        for track in gpx.tracks:
            if track.name and track.name.strip():
                return track.name.strip()
        for route in gpx.routes:
            if route.name and route.name.strip():
                return route.name.strip()
    except Exception:
        pass
    return f"Route {_dt.now().strftime('%d.%m.%Y %H:%M')}"


# ---------------------------------------------------------------------------
# Route transformations
# ---------------------------------------------------------------------------

def reverse_route(route: RouteData) -> RouteData:
    """Return a new RouteData with direction reversed.

    Distances are symmetric (haversine is commutative), so cum_dist_m can be
    derived without recomputing haversine. Grades flip sign and reverse index.
    """
    n = len(route.lats)
    if n < 2:
        return route
    total = route.total_dist_m
    rev_lats = tuple(reversed(route.lats))
    rev_lons = tuple(reversed(route.lons))
    rev_eles = tuple(reversed(route.elevations_m))
    rev_cum = tuple(total - route.cum_dist_m[n - 1 - i] for i in range(n))
    grades = route.grades_pct
    rev_grades: List[float] = [0.0]
    for j in range(1, n):
        rev_grades.append(-grades[n - j])
    return RouteData(
        lats=rev_lats,
        lons=rev_lons,
        elevations_m=rev_eles,
        cum_dist_m=rev_cum,
        grades_pct=tuple(rev_grades),
        total_dist_m=total,
        curve_radius_m=tuple(reversed(route.curve_radius_m)) if len(route.curve_radius_m) == n else (),
        curve_speed_limit_mps=(
            tuple(reversed(route.curve_speed_limit_mps))
            if len(route.curve_speed_limit_mps) == n
            else ()
        ),
    )


def slice_route(route: RouteData, start_m: float, end_m: float) -> RouteData:
    """Return a new RouteData cut to [start_m, end_m] with rebased cum_dist_m."""
    cum = route.cum_dist_m
    n = len(cum)
    if n < 2:
        return route
    end_m = min(end_m, cum[-1])
    start_m = max(0.0, start_m)
    if start_m >= end_m:
        raise ValueError(f"slice_route: start_m ({start_m:.1f}) >= end_m ({end_m:.1f})")

    def interpolate_at(distance_m: float) -> tuple[float, float, float, float]:
        idx = min(max(bisect.bisect_right(cum, distance_m) - 1, 0), n - 2)
        d0 = cum[idx]
        d1 = cum[idx + 1]
        t = 0.0 if d1 == d0 else (distance_m - d0) / (d1 - d0)
        lat = route.lats[idx] + (route.lats[idx + 1] - route.lats[idx]) * t
        lon = route.lons[idx] + (route.lons[idx + 1] - route.lons[idx]) * t
        ele = route.elevations_m[idx] + (route.elevations_m[idx + 1] - route.elevations_m[idx]) * t
        grade = route.grades_pct[idx] + (route.grades_pct[idx + 1] - route.grades_pct[idx]) * t
        return lat, lon, ele, grade

    points: list[tuple[float, float, float, float, float]] = []
    start_lat, start_lon, start_ele, start_grade = interpolate_at(start_m)
    points.append((start_m, start_lat, start_lon, start_ele, start_grade))

    i_first_inside = bisect.bisect_right(cum, start_m)
    i_end_inside = bisect.bisect_left(cum, end_m)
    for i in range(i_first_inside, i_end_inside):
        points.append((
            cum[i],
            route.lats[i],
            route.lons[i],
            route.elevations_m[i],
            route.grades_pct[i],
        ))

    end_lat, end_lon, end_ele, end_grade = interpolate_at(end_m)
    if not points or end_m > points[-1][0]:
        points.append((end_m, end_lat, end_lon, end_ele, end_grade))

    if len(points) < 2:
        raise ValueError("slice_route: resulting route has fewer than 2 points")

    new_cum = tuple(d - start_m for d, *_ in points)
    return RouteData(
        lats=tuple(lat for _, lat, _, _, _ in points),
        lons=tuple(lon for _, _, lon, _, _ in points),
        elevations_m=tuple(ele for _, _, _, ele, _ in points),
        cum_dist_m=new_cum,
        grades_pct=tuple(grade for _, _, _, _, grade in points),
        total_dist_m=new_cum[-1],
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _rolling_mean(values: List[float], window: int = 5) -> List[float]:
    """Centered rolling mean. Edges use shrinking window; length preserved."""
    if not values:
        return []
    out: List[float] = []
    half = window // 2
    n = len(values)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, lo + window)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def _sample_route_at(route: RouteData, distance_m: float) -> tuple[float, float, float, float]:
    """Interpolate lat, lon, elevation, and grade at a route distance."""
    cum = route.cum_dist_m
    n = len(cum)
    if n == 0:
        return 0.0, 0.0, 0.0, 0.0
    if n == 1 or distance_m <= cum[0]:
        return route.lats[0], route.lons[0], route.elevations_m[0], route.grades_pct[0]
    if distance_m >= cum[-1]:
        return route.lats[-1], route.lons[-1], route.elevations_m[-1], route.grades_pct[-1]

    idx = min(max(bisect.bisect_right(cum, distance_m) - 1, 0), n - 2)
    d0, d1 = cum[idx], cum[idx + 1]
    t = 0.0 if d1 == d0 else (distance_m - d0) / (d1 - d0)
    lat = route.lats[idx] + (route.lats[idx + 1] - route.lats[idx]) * t
    lon = route.lons[idx] + (route.lons[idx + 1] - route.lons[idx]) * t
    ele = route.elevations_m[idx] + (route.elevations_m[idx + 1] - route.elevations_m[idx]) * t
    grade = route.grades_pct[idx] + (route.grades_pct[idx + 1] - route.grades_pct[idx]) * t
    return lat, lon, ele, grade


def _project_to_local_xy(lats: list[float], lons: list[float]) -> tuple[list[float], list[float]]:
    """Project lat/lon to local metres using an equirectangular approximation."""
    if not lats:
        return [], []
    earth_r_m = 6_371_000.0
    lat0 = math.radians(lats[0])
    lon0 = math.radians(lons[0])
    cos_lat0 = math.cos(lat0)
    xs: list[float] = []
    ys: list[float] = []
    for lat, lon in zip(lats, lons):
        xs.append((math.radians(lon) - lon0) * earth_r_m * cos_lat0)
        ys.append((math.radians(lat) - lat0) * earth_r_m)
    return xs, ys


def _calculate_curvatures(
    distances_m: list[float],
    xs: list[float],
    ys: list[float],
    lookahead_m: float,
) -> list[float]:
    curvatures: list[float] = []
    n = len(distances_m)
    for i, distance_m in enumerate(distances_m):
        prev_i = max(0, bisect.bisect_left(distances_m, distance_m - lookahead_m))
        next_i = min(n - 1, bisect.bisect_right(distances_m, distance_m + lookahead_m) - 1)
        if prev_i == i or next_i == i or prev_i == next_i:
            curvatures.append(0.0)
            continue

        v1x = xs[i] - xs[prev_i]
        v1y = ys[i] - ys[prev_i]
        v2x = xs[next_i] - xs[i]
        v2y = ys[next_i] - ys[i]
        if math.hypot(v1x, v1y) < 0.5 or math.hypot(v2x, v2y) < 0.5:
            curvatures.append(0.0)
            continue

        heading_1 = math.atan2(v1y, v1x)
        heading_2 = math.atan2(v2y, v2x)
        heading_delta = abs((heading_2 - heading_1 + math.pi) % (2.0 * math.pi) - math.pi)
        distance_window = max(0.1, distances_m[next_i] - distances_m[prev_i])
        curvatures.append(heading_delta / distance_window)
    return curvatures


def _base_curve_speed_limit(radius_m: float | None) -> float | None:
    if radius_m is None:
        return None
    if radius_m < 10.0:
        return 3.0
    if radius_m < 25.0:
        return 5.0
    if radius_m < 60.0:
        return 8.0
    return None


def _apply_downhill_curve_correction(
    speed_limit_mps: float | None,
    grade_pct: float | None,
) -> float | None:
    if speed_limit_mps is None or grade_pct is None:
        return speed_limit_mps
    if grade_pct < -8.0:
        return speed_limit_mps * 0.75
    if grade_pct < -5.0:
        return speed_limit_mps * 0.85
    if grade_pct < -3.0:
        return speed_limit_mps * 0.93
    return speed_limit_mps


def _smooth_speed_caps(
    distances_m: list[float],
    raw_caps: list[float | None],
    config: CurveProfileConfig,
) -> list[float]:
    max_speed = config.max_reasonable_speed_mps
    caps = [max_speed if cap is None else min(max_speed, max(0.0, cap)) for cap in raw_caps]

    # Backward pass creates a gradual slow-in before a constrained curve.
    for i in range(len(caps) - 2, -1, -1):
        ds = max(0.0, distances_m[i + 1] - distances_m[i])
        reachable = math.sqrt(caps[i + 1] ** 2 + 2.0 * config.max_virtual_decel_mps2 * ds)
        caps[i] = min(caps[i], reachable)

    # Forward pass creates a natural acceleration-out transition.
    for i in range(1, len(caps)):
        ds = max(0.0, distances_m[i] - distances_m[i - 1])
        reachable = math.sqrt(caps[i - 1] ** 2 + 2.0 * config.max_virtual_accel_mps2 * ds)
        caps[i] = min(caps[i], reachable)

    smooth_window = max(3, round(config.curve_smoothing_window_m / max(1.0, config.curve_resample_distance_m)))
    averaged = _rolling_mean(caps, window=smooth_window)
    return [min(cap, avg) for cap, avg in zip(caps, averaged)]


def _interpolate_numeric(xs: list[float], ys: list[float], x: float) -> float:
    if not xs or not ys:
        return 0.0
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    idx = min(max(bisect.bisect_right(xs, x) - 1, 0), len(xs) - 2)
    x0, x1 = xs[idx], xs[idx + 1]
    y0, y1 = ys[idx], ys[idx + 1]
    t = 0.0 if x1 == x0 else (x - x0) / (x1 - x0)
    return y0 + (y1 - y0) * t
