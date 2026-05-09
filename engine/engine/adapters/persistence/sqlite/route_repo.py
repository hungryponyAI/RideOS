"""SqliteRouteRepo — RouteRepoPort backed by SQLite.

GPX content is stored as a TEXT blob. RouteData is re-parsed on every get()
call (routes are read infrequently — at ride start, not in the 4 Hz loop).
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from engine.domain.route import RouteData, load_gpx_content

_log = logging.getLogger("rideos.adapters.persistence.route_repo")


class SqliteRouteRepo:
    """RouteRepoPort backed by an open sqlite3 connection."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, route_id: str) -> Optional[RouteData]:
        """Return parsed RouteData for route_id, or None if not found."""
        row = self._conn.execute(
            "SELECT gpx_blob FROM routes WHERE id = ?", (route_id,)
        ).fetchone()
        if row is None:
            return None
        try:
            return load_gpx_content(row["gpx_blob"], source_label=route_id)
        except Exception as exc:
            _log.warning("Failed to parse GPX for route %s: %s", route_id, exc)
            return None

    def list_ids(self) -> list[str]:
        """Return all stored route IDs, newest first."""
        rows = self._conn.execute(
            "SELECT id FROM routes ORDER BY added_at DESC"
        ).fetchall()
        return [r["id"] for r in rows]

    def save(self, route_id: str, route: RouteData, gpx_content: str) -> None:
        """Persist a route, replacing any existing entry with the same ID."""
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO routes (id, added_at, total_dist_m, gpx_blob)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                total_dist_m = excluded.total_dist_m,
                gpx_blob     = excluded.gpx_blob
            """,
            (route_id, now, route.total_dist_m, gpx_content),
        )
        self._conn.commit()
        _log.info("SqliteRouteRepo: saved route %s (%.1f m)", route_id, route.total_dist_m)

    def delete(self, route_id: str) -> None:
        """Remove a route by ID (no-op if not found)."""
        self._conn.execute("DELETE FROM routes WHERE id = ?", (route_id,))
        self._conn.commit()
        _log.info("SqliteRouteRepo: deleted route %s", route_id)
