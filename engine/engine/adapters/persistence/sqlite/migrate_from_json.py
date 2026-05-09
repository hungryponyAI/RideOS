"""One-shot migration: JSON route library → SqliteRouteRepo.

Called on first startup when the SQLite DB doesn't contain any routes but
a legacy library.json exists alongside GPX files.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from engine.adapters.persistence.sqlite.route_repo import SqliteRouteRepo
from engine.domain.route import load_gpx_content

_log = logging.getLogger("rideos.adapters.persistence.migrate")


def migrate_library_if_needed(routes_dir: Path, repo: SqliteRouteRepo) -> None:
    """Import routes from legacy library.json into SQLite if the DB is empty."""
    if repo.list_ids():
        return  # already populated

    lib_path = routes_dir / "library.json"
    if not lib_path.exists():
        return

    try:
        data = json.loads(lib_path.read_text(encoding="utf-8"))
    except Exception as exc:
        _log.warning("migrate_library_if_needed: cannot read library.json: %s", exc)
        return

    imported = 0
    for entry in data.get("routes", []):
        route_id = entry.get("id")
        filename = entry.get("filename")
        if not route_id or not filename:
            continue
        gpx_path = routes_dir / filename
        if not gpx_path.exists():
            _log.warning("GPX file missing for route %s (%s), skipping", route_id, filename)
            continue
        try:
            gpx_content = gpx_path.read_text(encoding="utf-8")
            route_data = load_gpx_content(gpx_content, source_label=filename)
            repo.save(route_id, route_data, gpx_content)
            imported += 1
        except Exception as exc:
            _log.warning("Failed to migrate route %s: %s", route_id, exc)

    if imported:
        _log.info("Migrated %d routes from library.json to SQLite", imported)
