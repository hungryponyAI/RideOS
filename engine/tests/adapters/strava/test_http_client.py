"""Tests for StravaHttpAdapter delegation to StravaAuth + StravaClient."""
from unittest.mock import MagicMock, patch

from engine.adapters.strava.http_client import StravaHttpAdapter
from engine.ports.strava import StravaPort


def _make_auth(*, configured=True, connected=True, athlete="Alice"):
    auth = MagicMock()
    auth.is_configured = configured
    auth.is_connected = connected
    auth.athlete_name = athlete
    auth.get_auth_url.return_value = "https://strava.com/oauth?client_id=1"
    auth.get_access_token.return_value = "tok_123"
    return auth


def test_implements_strava_port():
    assert isinstance(StravaHttpAdapter(_make_auth()), StravaPort)


def test_is_configured_delegates():
    assert StravaHttpAdapter(_make_auth(configured=True)).is_configured is True
    assert StravaHttpAdapter(_make_auth(configured=False)).is_configured is False


def test_is_connected_delegates():
    assert StravaHttpAdapter(_make_auth(connected=True)).is_connected is True
    assert StravaHttpAdapter(_make_auth(connected=False)).is_connected is False


def test_athlete_name_delegates():
    assert StravaHttpAdapter(_make_auth(athlete="Bob")).athlete_name == "Bob"
    assert StravaHttpAdapter(_make_auth(athlete=None)).athlete_name is None


def test_get_auth_url_delegates():
    adapter = StravaHttpAdapter(_make_auth())
    url = adapter.get_auth_url()
    assert url == "https://strava.com/oauth?client_id=1"


def test_exchange_code_delegates():
    auth = _make_auth()
    StravaHttpAdapter(auth).exchange_code("code_abc")
    auth.exchange_code.assert_called_once_with("code_abc")


def test_disconnect_delegates():
    auth = _make_auth()
    StravaHttpAdapter(auth).disconnect()
    auth.disconnect.assert_called_once()


def test_get_access_token_delegates():
    auth = _make_auth()
    token = StravaHttpAdapter(auth).get_access_token()
    assert token == "tok_123"


def test_fetch_activities_delegates():
    auth = _make_auth()
    adapter = StravaHttpAdapter(auth)
    with patch.object(adapter._client, "fetch_activities", return_value=[{"id": 99}]) as m:
        result = adapter.fetch_activities(limit=5)
        m.assert_called_once_with(limit=5)
        assert result == [{"id": 99}]


def test_fetch_streams_delegates():
    auth = _make_auth()
    adapter = StravaHttpAdapter(auth)
    with patch.object(adapter._client, "fetch_streams", return_value={"altitude": {}}) as m:
        result = adapter.fetch_streams(42)
        m.assert_called_once_with(42)
        assert result == {"altitude": {}}


def test_fetch_streams_returns_none_on_error():
    auth = _make_auth()
    adapter = StravaHttpAdapter(auth)
    with patch.object(adapter._client, "fetch_streams", return_value=None):
        assert adapter.fetch_streams(999) is None
