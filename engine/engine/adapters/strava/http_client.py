"""StravaHttpAdapter — StravaPort backed by StravaAuth + StravaClient."""
from __future__ import annotations

import logging
from typing import Optional

from engine.strava.auth import StravaAuth
from engine.strava.client import StravaClient

_log = logging.getLogger("rideos.adapters.strava")


class StravaHttpAdapter:
    """StravaPort implemented over urllib — delegates to StravaAuth and StravaClient."""

    def __init__(self, auth: StravaAuth) -> None:
        self._auth = auth
        self._client = StravaClient(auth)

    @property
    def is_configured(self) -> bool:
        return self._auth.is_configured

    @property
    def is_connected(self) -> bool:
        return self._auth.is_connected

    @property
    def athlete_name(self) -> Optional[str]:
        return self._auth.athlete_name

    def get_auth_url(self) -> str:
        return self._auth.get_auth_url()

    def exchange_code(self, code: str) -> None:
        self._auth.exchange_code(code)

    def get_access_token(self) -> str:
        return self._auth.get_access_token()

    def disconnect(self) -> None:
        self._auth.disconnect()

    def fetch_activities(self, limit: int = 50) -> list[dict]:
        return self._client.fetch_activities(limit=limit)

    def fetch_streams(self, activity_id: int) -> Optional[dict]:
        return self._client.fetch_streams(activity_id)
