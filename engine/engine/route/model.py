"""RouteData — immutable, pre-computed GPX route container.

Parsed once by engine.route.loader.load_gpx at startup. Consumed by
engine.route.tracker.RouteTracker at 4 Hz. All distance/grade arithmetic
is done upfront; the hot path only does O(log n) bisect lookups.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class RouteData:
    lats: Tuple[float, ...]
    lons: Tuple[float, ...]
    elevations_m: Tuple[float, ...]
    cum_dist_m: Tuple[float, ...]
    grades_pct: Tuple[float, ...]
    total_dist_m: float
