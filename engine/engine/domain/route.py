"""RouteData and pure GPX transformations — no file I/O, no asyncio.

RouteData is parsed once from GPX content and consumed by the tracker at 4 Hz.
All distance/grade arithmetic is done upfront; the hot path only does O(log n)
bisect lookups.

File I/O (open + read) stays in adapters/; this module only processes strings.
"""
from __future__ import annotations

import bisect
import logging
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
    i_start = max(0, bisect.bisect_right(cum, start_m) - 1)
    i_end = min(n, bisect.bisect_left(cum, end_m) + 1)
    if i_end <= i_start + 1:
        raise ValueError("slice_route: resulting route has fewer than 2 points")
    lats = route.lats[i_start:i_end]
    lons = route.lons[i_start:i_end]
    eles = route.elevations_m[i_start:i_end]
    orig_cum = route.cum_dist_m[i_start:i_end]
    grades = route.grades_pct[i_start:i_end]
    offset = orig_cum[0]
    new_cum = tuple(c - offset for c in orig_cum)
    return RouteData(
        lats=lats,
        lons=lons,
        elevations_m=eles,
        cum_dist_m=new_cum,
        grades_pct=grades,
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
