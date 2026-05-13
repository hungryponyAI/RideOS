"""Repository ports — storage abstractions over route, ride, and token data."""
from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from engine.domain.route import RouteData


@runtime_checkable
class RouteRepoPort(Protocol):
    """CRUD for GPX routes."""

    def get(self, route_id: str) -> "RouteData | None":
        """Return the parsed RouteData for route_id, or None if not found."""
        ...

    def list_ids(self) -> list[str]:
        """Return all stored route IDs."""
        ...

    def save(self, route_id: str, route: "RouteData", gpx_content: str) -> None:
        """Persist a parsed route and its raw GPX source."""
        ...

    def delete(self, route_id: str) -> None:
        """Remove a route by ID."""
        ...


@runtime_checkable
class RideRepoPort(Protocol):
    """Append-only ride and event-log storage."""

    def start_ride(
        self,
        ride_id: str,
        started_at: str,
        route_id: str | None,
        laps: int,
        warmup_s: int,
        cooldown_s: int,
        erg_mode: bool,
    ) -> None:
        """Insert a new ride row (no finished_at yet)."""
        ...

    def record_event(
        self,
        ride_id: str,
        seq: int,
        t_ms: int,
        event_type: str,
        payload: str,
    ) -> None:
        """Append one event to ride_events."""
        ...

    def finish_ride(
        self,
        ride_id: str,
        finished_at: str,
        duration_s: float,
        distance_m: float,
        avg_power_w: float | None,
        max_power_w: float | None,
    ) -> None:
        """Finalise the ride row with summary stats."""
        ...


@runtime_checkable
class TokenRepoPort(Protocol):
    """Secure storage for Strava OAuth tokens (encrypted at rest)."""

    def get_strava_tokens(self) -> dict | None:
        """Return the stored Strava tokens dict, or None if not connected."""
        ...

    def save_strava_tokens(self, tokens: dict) -> None:
        """Persist the Strava tokens, overwriting any existing entry."""
        ...

    def delete_strava_tokens(self) -> None:
        """Remove stored Strava tokens (disconnect)."""
        ...
