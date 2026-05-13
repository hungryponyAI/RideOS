"""StravaService unit tests — status, OAuth exchange, sync, disconnect."""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.application.strava_service import StravaService
from engine.ws.server import RouteContext


class FakeStravaAuth:
    def __init__(self, *, connected: bool = False, athlete: str = "Pat") -> None:
        self.is_connected = connected
        self.athlete_name = athlete if connected else None
        self.exchanged_code: str | None = None
        self.raise_on_exchange: Exception | None = None
        self.disconnected = False

    def get_auth_url(self) -> str:
        return "https://strava.test/oauth?x"

    def exchange_code(self, code: str) -> None:
        if self.raise_on_exchange is not None:
            raise self.raise_on_exchange
        self.exchanged_code = code
        self.is_connected = True
        self.athlete_name = "Pat"

    def disconnect(self) -> None:
        self.disconnected = True
        self.is_connected = False
        self.athlete_name = None


class FakeImporter:
    def __init__(self) -> None:
        self.imported: list[dict] = []
        self.already_seen: set[str] = set()

    def already_imported(self, strava_id: str) -> bool:
        return strava_id in self.already_seen

    def import_activity(self, act: dict, streams: dict) -> Any:
        self.imported.append(act)
        self.already_seen.add(str(act["id"]))
        # Truthy return means "imported successfully"
        return object()


class FakeStravaClient:
    def __init__(self, _auth: Any) -> None:
        pass

    def fetch_activities(self, limit: int) -> list[dict]:
        return [{"id": 1, "name": "Ride"}, {"id": 2, "name": "Ride"}]

    def fetch_streams(self, activity_id: int) -> dict:
        return {"latlng": {"data": []}}


def _ctx(*, auth: FakeStravaAuth | None = None, importer: FakeImporter | None = None) -> RouteContext:
    return RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=20),
        stop_event=asyncio.Event(),
        strava_auth=auth,  # type: ignore[arg-type]
        strava_importer=importer,  # type: ignore[arg-type]
    )


def _drain(queue: "asyncio.Queue[dict]") -> list[dict]:
    out: list[dict] = []
    while not queue.empty():
        out.append(queue.get_nowait())
    return out


# ── status_message / get_auth_url / disconnect ────────────────────────────────

def test_status_message_when_disconnected():
    ctx = _ctx(auth=FakeStravaAuth(connected=False))
    svc = StravaService(AsyncioEventBus())

    msg = svc.status_message(ctx)
    assert msg == {
        "type": "strava_status",
        "connected": False,
        "athlete_name": None,
        "syncing": False,
    }


def test_status_message_uses_ctx_syncing_flag_when_unspecified():
    ctx = _ctx(auth=FakeStravaAuth(connected=True))
    ctx.strava_syncing = True
    svc = StravaService(AsyncioEventBus())

    assert svc.status_message(ctx)["syncing"] is True


def test_status_message_explicit_syncing_overrides_ctx():
    ctx = _ctx(auth=FakeStravaAuth(connected=True))
    ctx.strava_syncing = True
    svc = StravaService(AsyncioEventBus())

    assert svc.status_message(ctx, syncing=False)["syncing"] is False


def test_get_auth_url_returns_url_when_auth_present():
    ctx = _ctx(auth=FakeStravaAuth())
    svc = StravaService(AsyncioEventBus())
    assert svc.get_auth_url(ctx) == "https://strava.test/oauth?x"


def test_get_auth_url_returns_none_when_no_auth():
    ctx = _ctx()
    svc = StravaService(AsyncioEventBus())
    assert svc.get_auth_url(ctx) is None


def test_disconnect_broadcasts_status():
    auth = FakeStravaAuth(connected=True)
    ctx = _ctx(auth=auth)
    svc = StravaService(AsyncioEventBus())

    svc.disconnect(ctx)

    assert auth.disconnected is True
    msgs = _drain(ctx.broadcast_queue)
    assert any(m.get("type") == "strava_status" and m["connected"] is False for m in msgs)


# ── exchange_code_and_sync ────────────────────────────────────────────────────

async def test_exchange_code_success_broadcasts_status_and_runs_sync(monkeypatch):
    auth = FakeStravaAuth(connected=False)
    importer = FakeImporter()
    ctx = _ctx(auth=auth, importer=importer)
    svc = StravaService(AsyncioEventBus())
    monkeypatch.setattr("engine.strava.client.StravaClient", FakeStravaClient)

    await svc.exchange_code_and_sync(ctx, "abc123")

    assert auth.exchanged_code == "abc123"
    assert auth.is_connected is True
    # Sync ran: 2 activities imported
    assert len(importer.imported) == 2
    msgs = _drain(ctx.broadcast_queue)
    # At least one connected=true status was broadcast
    assert any(m.get("type") == "strava_status" and m["connected"] for m in msgs)


async def test_exchange_code_failure_publishes_error():
    auth = FakeStravaAuth(connected=False)
    auth.raise_on_exchange = RuntimeError("bad code")
    ctx = _ctx(auth=auth)
    svc = StravaService(AsyncioEventBus())

    await svc.exchange_code_and_sync(ctx, "abc")

    msgs = _drain(ctx.broadcast_queue)
    errors = [m for m in msgs if m.get("type") == "strava_error"]
    assert len(errors) == 1
    assert "bad code" in errors[0]["message"]
    # No sync-success status broadcasts on the queue
    assert not any(m.get("type") == "strava_status" and m["connected"] for m in msgs)


# ── sync ──────────────────────────────────────────────────────────────────────

async def test_sync_imports_new_activities(monkeypatch):
    auth = FakeStravaAuth(connected=True)
    importer = FakeImporter()
    ctx = _ctx(auth=auth, importer=importer)
    svc = StravaService(AsyncioEventBus())
    monkeypatch.setattr("engine.strava.client.StravaClient", FakeStravaClient)

    await svc.sync(ctx)

    assert len(importer.imported) == 2
    assert ctx.strava_syncing is False


async def test_sync_skips_already_imported(monkeypatch):
    auth = FakeStravaAuth(connected=True)
    importer = FakeImporter()
    importer.already_seen = {"1"}  # activity 1 already in library
    ctx = _ctx(auth=auth, importer=importer)
    svc = StravaService(AsyncioEventBus())
    monkeypatch.setattr("engine.strava.client.StravaClient", FakeStravaClient)

    await svc.sync(ctx)

    # Only activity 2 imported
    assert [a["id"] for a in importer.imported] == [2]


async def test_sync_no_op_when_not_connected():
    auth = FakeStravaAuth(connected=False)
    importer = FakeImporter()
    ctx = _ctx(auth=auth, importer=importer)
    svc = StravaService(AsyncioEventBus())

    await svc.sync(ctx)

    assert importer.imported == []
    assert _drain(ctx.broadcast_queue) == []


async def test_sync_no_op_when_already_syncing():
    ctx = _ctx(auth=FakeStravaAuth(connected=True), importer=FakeImporter())
    ctx.strava_syncing = True
    svc = StravaService(AsyncioEventBus())

    await svc.sync(ctx)
    assert ctx.strava_syncing is True  # unchanged


async def test_sync_failure_publishes_error(monkeypatch):
    auth = FakeStravaAuth(connected=True)
    importer = FakeImporter()
    ctx = _ctx(auth=auth, importer=importer)
    svc = StravaService(AsyncioEventBus())

    class ExplodingClient:
        def __init__(self, _auth: Any) -> None:
            pass

        def fetch_activities(self, _limit: int) -> list[dict]:
            raise RuntimeError("net down")

    monkeypatch.setattr("engine.strava.client.StravaClient", ExplodingClient)

    await svc.sync(ctx)

    msgs = _drain(ctx.broadcast_queue)
    errors = [m for m in msgs if m.get("type") == "strava_error"]
    assert len(errors) == 1
    assert "net down" in errors[0]["message"]
    assert ctx.strava_syncing is False  # released even on failure
