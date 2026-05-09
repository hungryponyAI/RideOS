"""Tests for SqliteTokenRepo — encrypted Strava token storage."""
import pytest

from engine.adapters.persistence.sqlite.connection import get_connection
from engine.adapters.persistence.sqlite.token_repo import SqliteTokenRepo

_TOKENS = {
    "access_token": "acc_abc123",
    "refresh_token": "ref_xyz789",
    "expires_at": 9_999_999_999,
    "athlete_id": "42",
    "athlete_name": "Alice Test",
}


@pytest.fixture
def repo(tmp_path):
    db_path = tmp_path / "test.db"
    conn = get_connection(db_path)
    return SqliteTokenRepo(conn, db_path)


def test_get_returns_none_initially(repo):
    assert repo.get_strava_tokens() is None


def test_save_and_get_roundtrip(repo):
    repo.save_strava_tokens(_TOKENS)
    result = repo.get_strava_tokens()

    assert result is not None
    assert result["access_token"] == "acc_abc123"
    assert result["refresh_token"] == "ref_xyz789"
    assert result["expires_at"] == 9_999_999_999
    assert result["athlete_name"] == "Alice Test"


def test_tokens_are_encrypted_at_rest(repo, tmp_path):
    repo.save_strava_tokens(_TOKENS)
    db_bytes = (tmp_path / "test.db").read_bytes()

    assert b"acc_abc123" not in db_bytes
    assert b"ref_xyz789" not in db_bytes


def test_overwrite_updates_tokens(repo):
    repo.save_strava_tokens(_TOKENS)
    updated = {**_TOKENS, "access_token": "new_acc", "refresh_token": "new_ref"}
    repo.save_strava_tokens(updated)

    result = repo.get_strava_tokens()
    assert result["access_token"] == "new_acc"
    assert result["refresh_token"] == "new_ref"


def test_delete_removes_tokens(repo):
    repo.save_strava_tokens(_TOKENS)
    repo.delete_strava_tokens()

    assert repo.get_strava_tokens() is None


def test_delete_when_empty_is_noop(repo):
    repo.delete_strava_tokens()  # must not raise


def test_key_file_created_on_first_use(tmp_path):
    db_path = tmp_path / "test.db"
    conn = get_connection(db_path)
    SqliteTokenRepo(conn, db_path)

    key_path = db_path.with_suffix(".key")
    assert key_path.exists()
    assert key_path.stat().st_mode & 0o777 == 0o600
