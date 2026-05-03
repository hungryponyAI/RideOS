"""Persistent route library: metadata index + GPX file management.

Stores GPX files in a `routes/` directory alongside library.json.
All mutations are synchronous (JSON file writes are fast; no async needed here).
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional

from engine.route.model import RouteData

_log = logging.getLogger("rideos.library")

_THUMB_SIZE = 60  # elevation thumbnail data points


@dataclass
class RouteEntry:
    id: str
    name: str
    filename: str
    added_at: str
    distance_km: float
    elevation_gain_m: int
    elevation_loss_m: int
    elevation_thumbnail: List[float]
    best_time_s: Optional[int]
    ride_count: int
    # Strava-sourced fields — None for locally uploaded GPX routes
    strava_id: Optional[str] = None
    sport_type: Optional[str] = None
    activity_date: Optional[str] = None
    moving_time_s: Optional[int] = None

    @classmethod
    def from_dict(cls, d: dict) -> "RouteEntry":
        return cls(
            id=d["id"],
            name=d["name"],
            filename=d["filename"],
            added_at=d["added_at"],
            distance_km=d["distance_km"],
            elevation_gain_m=d["elevation_gain_m"],
            elevation_loss_m=d["elevation_loss_m"],
            elevation_thumbnail=d.get("elevation_thumbnail", []),
            best_time_s=d.get("best_time_s"),
            ride_count=d.get("ride_count", 0),
            strava_id=d.get("strava_id"),
            sport_type=d.get("sport_type"),
            activity_date=d.get("activity_date"),
            moving_time_s=d.get("moving_time_s"),
        )


def _compute_stats(route: RouteData) -> dict:
    eles = route.elevations_m
    gain = sum(max(0.0, eles[i] - eles[i - 1]) for i in range(1, len(eles)))
    loss = sum(max(0.0, eles[i - 1] - eles[i]) for i in range(1, len(eles)))
    n = len(eles)
    if n <= _THUMB_SIZE:
        thumb = list(eles)
    else:
        thumb = [eles[round(i * (n - 1) / (_THUMB_SIZE - 1))] for i in range(_THUMB_SIZE)]
    return {
        "distance_km": round(route.total_dist_m / 1000, 2),
        "elevation_gain_m": round(gain),
        "elevation_loss_m": round(loss),
        "elevation_thumbnail": [round(e, 1) for e in thumb],
    }


class RouteLibrary:
    _LIBRARY_FILE = "library.json"

    def __init__(self, routes_dir: Path) -> None:
        self._dir = routes_dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._lib_path = self._dir / self._LIBRARY_FILE
        self._routes: dict[str, RouteEntry] = {}
        self._load()

    # ------------------------------------------------------------------
    # Persistence

    def _load(self) -> None:
        if not self._lib_path.exists():
            return
        try:
            data = json.loads(self._lib_path.read_text(encoding="utf-8"))
            for r in data.get("routes", []):
                try:
                    entry = RouteEntry.from_dict(r)
                    self._routes[entry.id] = entry
                except Exception as exc:
                    _log.warning("Skipping malformed library entry: %s", exc)
        except Exception as exc:
            _log.warning("Could not load route library: %s", exc)

    def _save(self) -> None:
        data = {"version": 1, "routes": [asdict(r) for r in self._routes.values()]}
        self._lib_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # ------------------------------------------------------------------
    # Mutations

    def add_route(self, name: str, gpx_content: str, route: RouteData) -> RouteEntry:
        route_id = uuid.uuid4().hex[:8]
        safe = re.sub(r"[^\w\-]", "_", name)[:40]
        filename = f"{safe}_{route_id}.gpx"
        (self._dir / filename).write_text(gpx_content, encoding="utf-8")
        stats = _compute_stats(route)
        entry = RouteEntry(
            id=route_id,
            name=name,
            filename=filename,
            added_at=datetime.now(timezone.utc).isoformat(),
            distance_km=stats["distance_km"],
            elevation_gain_m=stats["elevation_gain_m"],
            elevation_loss_m=stats["elevation_loss_m"],
            elevation_thumbnail=stats["elevation_thumbnail"],
            best_time_s=None,
            ride_count=0,
        )
        self._routes[route_id] = entry
        self._save()
        _log.info("Library: added %r (%s, %.1f km)", name, route_id, entry.distance_km)
        return entry

    def add_strava_route(
        self,
        name: str,
        gpx_content: str,
        route: RouteData,
        strava_id: str,
        sport_type: Optional[str] = None,
        activity_date: Optional[str] = None,
        moving_time_s: Optional[int] = None,
    ) -> RouteEntry:
        route_id = uuid.uuid4().hex[:8]
        safe = re.sub(r"[^\w\-]", "_", name)[:40]
        filename = f"{safe}_{route_id}.gpx"
        (self._dir / filename).write_text(gpx_content, encoding="utf-8")
        stats = _compute_stats(route)
        entry = RouteEntry(
            id=route_id,
            name=name,
            filename=filename,
            added_at=datetime.now(timezone.utc).isoformat(),
            distance_km=stats["distance_km"],
            elevation_gain_m=stats["elevation_gain_m"],
            elevation_loss_m=stats["elevation_loss_m"],
            elevation_thumbnail=stats["elevation_thumbnail"],
            best_time_s=None,
            ride_count=0,
            strava_id=strava_id,
            sport_type=sport_type,
            activity_date=activity_date,
            moving_time_s=moving_time_s,
        )
        self._routes[route_id] = entry
        self._save()
        _log.info(
            "Library: added Strava route %r (%s, strava_id=%s, %.1f km)",
            name, route_id, strava_id, entry.distance_km,
        )
        return entry

    def delete_route(self, route_id: str) -> bool:
        entry = self._routes.pop(route_id, None)
        if entry is None:
            return False
        gpx = self._dir / entry.filename
        if gpx.exists():
            gpx.unlink()
        self._save()
        _log.info("Library: deleted %r (%s)", entry.name, route_id)
        return True

    def rename_route(self, route_id: str, name: str) -> bool:
        entry = self._routes.get(route_id)
        if entry is None:
            return False
        entry.name = name
        self._save()
        return True

    def update_best_time(self, route_id: str, time_s: int) -> None:
        entry = self._routes.get(route_id)
        if entry is None:
            return
        if entry.best_time_s is None or time_s < entry.best_time_s:
            entry.best_time_s = time_s
        entry.ride_count += 1
        self._save()
        _log.info("Library: best time for %r -> %ds", entry.name, entry.best_time_s)

    # ------------------------------------------------------------------
    # Queries

    def get_gpx_path(self, route_id: str) -> Optional[Path]:
        entry = self._routes.get(route_id)
        return (self._dir / entry.filename) if entry else None

    def list_routes(self) -> List[RouteEntry]:
        return sorted(self._routes.values(), key=lambda r: r.added_at, reverse=True)

    def to_ws_message(self) -> dict:
        return {"type": "route_library", "routes": [asdict(r) for r in self.list_routes()]}
