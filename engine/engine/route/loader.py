"""GPX loader: parse a file into a pre-computed RouteData (ROUTE-01).

Responsibilities:
- Parse GPX (1.0/1.1) via gpxpy
- Flatten all tracks/segments into parallel arrays
- Compute cumulative 2D haversine distance
- Compute per-segment raw grade, smooth with 5-point rolling mean
- Clamp smoothed grades to KICKR Core safe range ±20%
- Raise ValueError on empty GPX; log warning for missing elevations
"""
from __future__ import annotations

import logging
from typing import List

import gpxpy
import gpxpy.geo

from engine.route.model import RouteData

_log = logging.getLogger("rideos.route")

# KICKR Core safe range per FTMS simulation parameters (also protects trainer).
_GRADE_CLAMP_PCT: float = 20.0
# 5-point rolling mean = ~10-50 m window at typical GPS point spacing;
# matches real road grade perception (see 04-RESEARCH.md Pattern 3).
_SMOOTH_WINDOW: int = 5


def load_gpx(path: str) -> RouteData:
    """Parse a GPX file into a RouteData with pre-computed cum distances + smoothed grades."""
    with open(path) as fh:
        gpx = gpxpy.parse(fh)
    points = [
        pt
        for track in gpx.tracks
        for seg in track.segments
        for pt in seg.points
    ]
    if not points:
        raise ValueError(f"GPX file {path!r} contains no track points")

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

    # Cumulative 2D haversine distance (metres).
    cum: List[float] = [0.0]
    for i in range(1, len(points)):
        d = gpxpy.geo.haversine_distance(
            lats[i - 1], lons[i - 1], lats[i], lons[i]
        )
        cum.append(cum[-1] + d)

    # Per-segment raw grade: slope between point i-1 and i.
    # Guard against zero-distance duplicates (< 0.1 m) to avoid /0.
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
    # Clamp to hardware-safe range.
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
