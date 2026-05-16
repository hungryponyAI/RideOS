"""SqliteRideRepo — RideRepoPort backed by SQLite."""
from __future__ import annotations

import logging
import sqlite3
from typing import Optional

_log = logging.getLogger("rideos.adapters.persistence.ride_repo")


class SqliteRideRepo:
    """RideRepoPort backed by an open sqlite3 connection."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def start_ride(
        self,
        ride_id: str,
        started_at: str,
        route_id: Optional[str],
        laps: int,
        warmup_s: int,
        cooldown_s: int,
        erg_mode: bool,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO rides (id, route_id, started_at, laps, warmup_s, cooldown_s, erg_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (ride_id, route_id, started_at, laps, warmup_s, cooldown_s, int(erg_mode)),
        )
        self._conn.commit()
        _log.info("SqliteRideRepo: opened ride %s route=%s", ride_id, route_id)

    def record_event(
        self,
        ride_id: str,
        seq: int,
        t_ms: int,
        event_type: str,
        payload: str,
    ) -> None:
        self._conn.execute(
            "INSERT INTO ride_events (ride_id, seq, t_ms, event_type, payload) VALUES (?, ?, ?, ?, ?)",
            (ride_id, seq, t_ms, event_type, payload),
        )
        self._conn.commit()

    def finish_ride(
        self,
        ride_id: str,
        finished_at: str,
        duration_s: float,
        distance_m: float,
        avg_power_w: Optional[float],
        max_power_w: Optional[float],
    ) -> None:
        self._conn.execute(
            """
            UPDATE rides
            SET finished_at = ?, duration_s = ?, distance_m = ?,
                avg_power_w = ?, max_power_w = ?
            WHERE id = ?
            """,
            (finished_at, duration_s, distance_m, avg_power_w, max_power_w, ride_id),
        )
        self._conn.commit()
        _log.info(
            "SqliteRideRepo: closed ride %s  duration=%.0fs  dist=%.0fm  avg_pwr=%s W",
            ride_id, duration_s, distance_m,
            f"{avg_power_w:.0f}" if avg_power_w is not None else "--",
        )

    # ── query helpers (used by tests and future training-history feature) ──

    def get_ride(self, ride_id: str) -> Optional[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM rides WHERE id = ?", (ride_id,)
        ).fetchone()

    def get_ride_events(
        self, ride_id: str, event_type: Optional[str] = None
    ) -> list[sqlite3.Row]:
        if event_type is None:
            return self._conn.execute(
                "SELECT * FROM ride_events WHERE ride_id = ? ORDER BY seq",
                (ride_id,),
            ).fetchall()
        return self._conn.execute(
            "SELECT * FROM ride_events WHERE ride_id = ? AND event_type = ? ORDER BY seq",
            (ride_id, event_type),
        ).fetchall()

    def list_rides(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM rides ORDER BY started_at DESC"
        ).fetchall()

    def delete_ride(self, ride_id: str) -> bool:
        """Delete one ride and its event log."""
        with self._conn:
            self._conn.execute("DELETE FROM ride_events WHERE ride_id = ?", (ride_id,))
            cur = self._conn.execute("DELETE FROM rides WHERE id = ?", (ride_id,))
        deleted = cur.rowcount > 0
        if deleted:
            _log.info("SqliteRideRepo: deleted ride %s", ride_id)
        return deleted

    def delete_all_rides(self) -> int:
        """Delete all rides and event logs, returning the number of ride rows removed."""
        with self._conn:
            count = self._conn.execute("SELECT COUNT(*) FROM rides").fetchone()[0]
            self._conn.execute("DELETE FROM ride_events")
            self._conn.execute("DELETE FROM rides")
        if count:
            _log.info("SqliteRideRepo: deleted all rides count=%d", count)
        return int(count)
