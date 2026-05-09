"""SqliteTokenRepo — TokenRepoPort backed by SQLite with Fernet encryption.

The Fernet key is loaded from the RIDEOS_FERNET_KEY environment variable
(base64-url-encoded 32-byte key) or from a .key file adjacent to the database.
If neither exists a new key is generated and written to the .key file.
"""
from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Optional

_log = logging.getLogger("rideos.adapters.persistence.token_repo")


def _load_fernet(db_path: Path):  # type: ignore[return]
    """Load or generate a Fernet key, returning a Fernet instance."""
    from cryptography.fernet import Fernet

    env_key = os.environ.get("RIDEOS_FERNET_KEY")
    if env_key:
        return Fernet(env_key.encode())

    key_path = db_path.with_suffix(".key")
    if key_path.exists():
        return Fernet(key_path.read_bytes().strip())

    key = Fernet.generate_key()
    key_path.write_bytes(key)
    key_path.chmod(0o600)
    _log.info("Generated new Fernet key at %s", key_path)
    return Fernet(key)


class SqliteTokenRepo:
    """TokenRepoPort — stores Strava tokens encrypted with Fernet in SQLite."""

    def __init__(self, conn: sqlite3.Connection, db_path: Path) -> None:
        self._conn = conn
        self._fernet = _load_fernet(db_path)

    def get_strava_tokens(self) -> Optional[dict]:
        """Return decrypted Strava tokens dict, or None if not stored."""
        row = self._conn.execute(
            "SELECT access_token_enc, refresh_token_enc, expires_at, athlete_id, athlete_name "
            "FROM strava_tokens WHERE id = 1"
        ).fetchone()
        if row is None:
            return None
        try:
            access = self._fernet.decrypt(row["access_token_enc"]).decode()
            refresh = self._fernet.decrypt(row["refresh_token_enc"]).decode()
        except Exception as exc:
            _log.error("Failed to decrypt Strava tokens: %s", exc)
            return None
        return {
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": row["expires_at"],
            "athlete_id": row["athlete_id"],
            "athlete_name": row["athlete_name"],
        }

    def save_strava_tokens(self, tokens: dict) -> None:
        """Persist Strava tokens, encrypted at rest."""
        access_enc = self._fernet.encrypt(tokens["access_token"].encode())
        refresh_enc = self._fernet.encrypt(tokens["refresh_token"].encode())
        self._conn.execute(
            """
            INSERT INTO strava_tokens
                (id, access_token_enc, refresh_token_enc, expires_at, athlete_id, athlete_name)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                access_token_enc  = excluded.access_token_enc,
                refresh_token_enc = excluded.refresh_token_enc,
                expires_at        = excluded.expires_at,
                athlete_id        = excluded.athlete_id,
                athlete_name      = excluded.athlete_name
            """,
            (
                access_enc,
                refresh_enc,
                int(tokens["expires_at"]),
                tokens.get("athlete_id"),
                tokens.get("athlete_name"),
            ),
        )
        self._conn.commit()
        _log.info("SqliteTokenRepo: Strava tokens saved")

    def delete_strava_tokens(self) -> None:
        """Remove stored Strava tokens."""
        self._conn.execute("DELETE FROM strava_tokens WHERE id = 1")
        self._conn.commit()
        _log.info("SqliteTokenRepo: Strava tokens deleted")
