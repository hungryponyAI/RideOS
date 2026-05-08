"""Strava API v3 read-only client — activities and streams."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from engine.strava.auth import CYCLING_SPORT_TYPES, StravaAuth

_log = logging.getLogger("rideos.strava.client")

_BASE = "https://www.strava.com/api/v3"
_STREAM_KEYS = (
    "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,grade_smooth"
)


class StravaClient:
    def __init__(self, auth: StravaAuth) -> None:
        self._auth = auth

    def _get(self, path: str, **params: Any) -> Any:
        token = self._auth.get_access_token()
        qs = urllib.parse.urlencode(params) if params else ""
        url = f"{_BASE}{path}{'?' + qs if qs else ''}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def fetch_activities(self, limit: int = 50) -> list[dict]:
        """Return the latest `limit` cycling activities, filtered by sport type."""
        raw: list[dict] = self._get(
            "/athlete/activities", per_page=min(limit, 200), page=1
        )
        return [a for a in raw if a.get("sport_type") in CYCLING_SPORT_TYPES][:limit]

    def fetch_streams(self, activity_id: int) -> Optional[dict]:
        """Fetch all available streams for an activity, keyed by type. Returns None on error."""
        try:
            return self._get(
                f"/activities/{activity_id}/streams",
                keys=_STREAM_KEYS,
                key_by_type="true",
            )
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                _log.debug("No streams for activity %d (404)", activity_id)
            else:
                _log.warning("Stream fetch failed for activity %d: HTTP %s", activity_id, exc.code)
            return None
        except Exception as exc:
            _log.warning("Stream fetch failed for activity %d: %s", activity_id, exc)
            return None
