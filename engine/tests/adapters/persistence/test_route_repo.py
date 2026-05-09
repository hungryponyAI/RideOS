"""Tests for SqliteRouteRepo CRUD over SQLite."""
import pytest

from engine.adapters.persistence.sqlite.connection import get_connection
from engine.adapters.persistence.sqlite.route_repo import SqliteRouteRepo
from engine.domain.route import load_gpx_content

_MINIMAL_GPX = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
    <trkpt lat="47.001" lon="8.001"><ele>510</ele></trkpt>
    <trkpt lat="47.002" lon="8.002"><ele>520</ele></trkpt>
  </trkseg></trk>
</gpx>
"""


@pytest.fixture
def repo(tmp_path):
    conn = get_connection(tmp_path / "test.db")
    return SqliteRouteRepo(conn)


def test_list_ids_empty_initially(repo):
    assert repo.list_ids() == []


def test_get_returns_none_for_missing(repo):
    assert repo.get("no-such-id") is None


def test_save_and_get_roundtrip(repo):
    route = load_gpx_content(_MINIMAL_GPX)
    repo.save("r1", route, _MINIMAL_GPX)

    result = repo.get("r1")
    assert result is not None
    assert abs(result.total_dist_m - route.total_dist_m) < 1.0


def test_list_ids_after_save(repo):
    route = load_gpx_content(_MINIMAL_GPX)
    repo.save("r1", route, _MINIMAL_GPX)
    repo.save("r2", route, _MINIMAL_GPX)

    assert set(repo.list_ids()) == {"r1", "r2"}


def test_delete_removes_route(repo):
    route = load_gpx_content(_MINIMAL_GPX)
    repo.save("r1", route, _MINIMAL_GPX)
    repo.delete("r1")

    assert repo.get("r1") is None
    assert "r1" not in repo.list_ids()


def test_delete_nonexistent_is_noop(repo):
    repo.delete("ghost")  # must not raise


def test_save_overwrites_existing(repo):
    route = load_gpx_content(_MINIMAL_GPX)
    repo.save("r1", route, _MINIMAL_GPX)
    repo.save("r1", route, _MINIMAL_GPX)

    assert repo.list_ids() == ["r1"]


def test_get_returns_none_for_corrupt_gpx(repo):
    from engine.domain.route import load_gpx_content as _lc
    route = _lc(_MINIMAL_GPX)
    # Manually insert a bad blob
    repo._conn.execute(
        "INSERT INTO routes (id, added_at, total_dist_m, gpx_blob) VALUES (?, '2026-01-01', 1.0, ?)",
        ("bad", "not xml at all"),
    )
    repo._conn.commit()
    assert repo.get("bad") is None
