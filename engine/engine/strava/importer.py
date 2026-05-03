"""Convert Strava activities into route library entries + persist streams for ghost ride."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import gpxpy.gpx

from engine.route.library import RouteEntry, RouteLibrary
from engine.route.loader import load_gpx_content

_log = logging.getLogger("rideos.strava.importer")


def _build_gpx(activity: dict, streams: dict) -> Optional[str]:
    """Reconstruct a GPX XML string from Strava streams. Returns None if no GPS data."""
    latlng_data = streams.get("latlng", {}).get("data")
    if not latlng_data:
        return None

    altitude_data = streams.get("altitude", {}).get("data", [])
    time_data = streams.get("time", {}).get("data", [])

    start_iso = activity.get("start_date", "2000-01-01T00:00:00Z")
    try:
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    except Exception:
        start_dt = datetime.now(timezone.utc)

    gpx = gpxpy.gpx.GPX()
    gpx.name = activity.get("name", f"Strava {activity.get('id', '')}")
    track = gpxpy.gpx.GPXTrack()
    gpx.tracks.append(track)
    segment = gpxpy.gpx.GPXTrackSegment()
    track.segments.append(segment)

    for i, (lat, lon) in enumerate(latlng_data):
        ele = (
            altitude_data[i]
            if i < len(altitude_data) and altitude_data[i] is not None
            else 0.0
        )
        t_offset = time_data[i] if i < len(time_data) else i
        pt_time = start_dt + timedelta(seconds=int(t_offset))
        segment.points.append(
            gpxpy.gpx.GPXTrackPoint(lat, lon, elevation=float(ele), time=pt_time)
        )

    return gpx.to_xml()


class StravaImporter:
    def __init__(self, library: RouteLibrary, streams_dir: Path) -> None:
        self._library = library
        self._streams_dir = streams_dir
        self._streams_dir.mkdir(parents=True, exist_ok=True)

    def already_imported(self, strava_id: str) -> bool:
        return any(e.strava_id == strava_id for e in self._library.list_routes())

    def save_streams(self, strava_id: str, streams: dict) -> None:
        path = self._streams_dir / f"{strava_id}.json"
        path.write_text(json.dumps(streams, separators=(",", ":")), encoding="utf-8")

    def import_activity(
        self, activity: dict, streams: Optional[dict]
    ) -> Optional[RouteEntry]:
        strava_id = str(activity["id"])

        if self.already_imported(strava_id):
            return None

        if not streams:
            _log.warning("Strava: no streams for activity %s, skipping", strava_id)
            return None

        gpx_xml = _build_gpx(activity, streams)
        if gpx_xml is None:
            _log.warning("Strava: no GPS data for activity %s, skipping", strava_id)
            return None

        try:
            route = load_gpx_content(gpx_xml)
        except Exception as exc:
            _log.warning("Strava: GPX parse failed for %s: %s", strava_id, exc)
            return None

        entry = self._library.add_strava_route(
            name=activity.get("name", f"Strava {strava_id}"),
            gpx_content=gpx_xml,
            route=route,
            strava_id=strava_id,
            sport_type=activity.get("sport_type"),
            activity_date=activity.get("start_date"),
            moving_time_s=activity.get("moving_time"),
        )
        self.save_streams(strava_id, streams)
        _log.info(
            "Strava: imported %r (%s, %.1f km)", entry.name, strava_id, entry.distance_km
        )
        return entry
