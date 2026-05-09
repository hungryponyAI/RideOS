"""StravaPort — interface for Strava OAuth and activity data access."""
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class StravaPort(Protocol):
    """Authenticate with Strava and read athlete activities."""

    @property
    def is_configured(self) -> bool:
        """True if client_id and client_secret are available."""
        ...

    @property
    def is_connected(self) -> bool:
        """True if valid OAuth tokens are stored."""
        ...

    @property
    def athlete_name(self) -> Optional[str]:
        """Display name of the authenticated athlete, or None."""
        ...

    def get_auth_url(self) -> str:
        """Return the Strava OAuth authorization URL."""
        ...

    def exchange_code(self, code: str) -> None:
        """Exchange an authorization code for tokens. Raises RuntimeError on failure."""
        ...

    def get_access_token(self) -> str:
        """Return a valid access token, refreshing if needed."""
        ...

    def disconnect(self) -> None:
        """Remove stored tokens."""
        ...

    def fetch_activities(self, limit: int = 50) -> list[dict]:
        """Return up to limit recent cycling activities."""
        ...

    def fetch_streams(self, activity_id: int) -> Optional[dict]:
        """Return stream data for an activity, or None on error."""
        ...
