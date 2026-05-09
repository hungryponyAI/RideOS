"""SQLite connection factory with schema migration runner.

Migrations live in migrations/*.sql numbered as NNN_description.sql.
user_version pragma tracks which migrations have run.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

_log = logging.getLogger("rideos.adapters.persistence.sqlite")

_MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def get_connection(db_path: Path) -> sqlite3.Connection:
    """Open (or create) the SQLite database and run pending migrations."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _run_migrations(conn)
    return conn


def _run_migrations(conn: sqlite3.Connection) -> None:
    current: int = conn.execute("PRAGMA user_version").fetchone()[0]
    migration_files = sorted(_MIGRATIONS_DIR.glob("*.sql"))
    for path in migration_files:
        number = int(path.stem.split("_")[0])
        if number <= current:
            continue
        _log.info("Running migration %s", path.name)
        sql = path.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute(f"PRAGMA user_version = {number}")
        conn.commit()
        _log.info("Migration %s applied", path.name)
