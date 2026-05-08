"""Repository ports — storage abstractions over route and token data.

Phase 3 implements these with SQLite adapters. For now they are Protocols so
services and domain code can reference them without touching I/O.
"""
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
