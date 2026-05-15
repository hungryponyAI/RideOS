"""RouteService unit tests — load_route, load_route_content, library CRUD."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.application.route_service import RouteService
from engine.domain.events import RouteLoaded
from engine.route.library import RouteLibrary
from engine.ws.server import RouteContext

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _ctx(tmp_path: Path) -> tuple[RouteContext, RouteLibrary]:
    lib = RouteLibrary(tmp_path / "routes")
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
        library=lib,
    )
    return ctx, lib


async def _drain_until_type(queue: "asyncio.Queue[dict]", msg_type: str, *, timeout: float = 1.0) -> dict:
    """Pull messages off the queue until one matches msg_type."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            msg = queue.get_nowait()
        except asyncio.QueueEmpty:
            await asyncio.sleep(0.01)
            continue
        if msg.get("type") == msg_type:
            return msg
    raise TimeoutError(f"No {msg_type!r} message within {timeout}s")


async def _cleanup(ctx: RouteContext) -> None:
    ctx.stop_event.set()
    if ctx.tracker_task is not None:
        try:
            await asyncio.wait_for(ctx.tracker_task, timeout=2.0)
        except asyncio.TimeoutError:
            ctx.tracker_task.cancel()


# ── load_route (path-based) ───────────────────────────────────────────────────

async def test_load_route_broadcasts_route_data(tmp_path):
    ctx, _ = _ctx(tmp_path)
    bus = AsyncioEventBus()
    svc = RouteService(bus)

    await svc.load_route(ctx, str(FIXTURES / "route_simple.gpx"))
    msg = await _drain_until_type(ctx.broadcast_queue, "route_data")

    assert len(msg["lats"]) == 3
    assert ctx.tracker is not None
    assert ctx.current_route is not None
    await _cleanup(ctx)


async def test_load_route_failure_publishes_route_error(tmp_path):
    ctx, _ = _ctx(tmp_path)
    svc = RouteService(AsyncioEventBus())

    await svc.load_route(ctx, "/does/not/exist.gpx")
    msg = await _drain_until_type(ctx.broadcast_queue, "route_error")

    assert msg["type"] == "route_error"
    assert ctx.tracker is None


# ── load_route_content (browser upload) ───────────────────────────────────────

async def test_load_route_content_saves_to_library_and_publishes_event(tmp_path):
    ctx, lib = _ctx(tmp_path)
    bus = AsyncioEventBus()
    captured: list[RouteLoaded] = []
    bus.subscribe(RouteLoaded, captured.append)
    svc = RouteService(bus, clock=lambda: 12.5)

    content = (FIXTURES / "route_simple.gpx").read_text()
    await svc.load_route_content(ctx, content)

    # Library now holds the new route
    assert len(lib.list_routes()) == 1
    new_id = lib.list_routes()[0].id

    # RouteLoaded fired with the new route_id
    assert len(captured) == 1
    assert captured[0].route_id == new_id
    assert captured[0].t_mono == 12.5
    assert captured[0].total_dist_m > 0
    await _cleanup(ctx)


async def test_load_route_content_broadcasts_route_data_and_library(tmp_path):
    ctx, _ = _ctx(tmp_path)
    svc = RouteService(AsyncioEventBus())

    content = (FIXTURES / "route_simple.gpx").read_text()
    await svc.load_route_content(ctx, content)

    # Both route_data and route_library messages enqueued.
    messages: list[dict] = []
    while not ctx.broadcast_queue.empty():
        messages.append(ctx.broadcast_queue.get_nowait())
    types = [m.get("type") for m in messages]
    assert "route_data" in types
    assert "route_library" in types
    await _cleanup(ctx)


# ── library CRUD ──────────────────────────────────────────────────────────────

def test_delete_route_returns_true_when_present(tmp_path):
    ctx, lib = _ctx(tmp_path)
    content = (FIXTURES / "route_simple.gpx").read_text()
    from engine.route.loader import load_gpx_content
    entry = lib.add_route("x", content, load_gpx_content(content))
    svc = RouteService(AsyncioEventBus())

    assert svc.delete_route(ctx, entry.id) is True
    assert lib.list_routes() == []


def test_delete_route_missing_returns_false(tmp_path):
    ctx, _ = _ctx(tmp_path)
    svc = RouteService(AsyncioEventBus())
    assert svc.delete_route(ctx, "nope") is False


def test_rename_route_updates_library(tmp_path):
    ctx, lib = _ctx(tmp_path)
    content = (FIXTURES / "route_simple.gpx").read_text()
    from engine.route.loader import load_gpx_content
    entry = lib.add_route("old", content, load_gpx_content(content))
    svc = RouteService(AsyncioEventBus())

    assert svc.rename_route(ctx, entry.id, "new") is True
    assert lib.list_routes()[0].name == "new"


def test_library_snapshot_returns_ws_message(tmp_path):
    ctx, lib = _ctx(tmp_path)
    content = (FIXTURES / "route_simple.gpx").read_text()
    from engine.route.loader import load_gpx_content
    lib.add_route("x", content, load_gpx_content(content))
    svc = RouteService(AsyncioEventBus())

    snap = svc.library_snapshot(ctx)
    assert snap is not None
    assert snap["type"] == "route_library"
    assert len(snap["routes"]) == 1


def test_library_snapshot_without_library_returns_none():
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
    )
    svc = RouteService(AsyncioEventBus())
    assert svc.library_snapshot(ctx) is None


# ── preview_route ─────────────────────────────────────────────────────────────

async def test_preview_route_returns_decimated_coords(tmp_path):
    ctx, lib = _ctx(tmp_path)
    content = (FIXTURES / "route_simple.gpx").read_text()
    from engine.route.loader import load_gpx_content
    entry = lib.add_route("preview-test", content, load_gpx_content(content))
    svc = RouteService(AsyncioEventBus())

    result = await svc.preview_route(ctx, entry.id)

    assert result is not None
    assert result["type"] == "route_preview"
    assert result["route_id"] == entry.id
    assert len(result["lats"]) >= 1
    assert len(result["lons"]) >= 1
    # No side effects: tracker should not be spawned
    assert ctx.tracker is None
    assert ctx.current_route is None


async def test_preview_route_unknown_id_returns_none(tmp_path):
    ctx, _ = _ctx(tmp_path)
    svc = RouteService(AsyncioEventBus())
    result = await svc.preview_route(ctx, "nonexistent")
    assert result is None


async def test_preview_route_without_library_returns_none():
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
    )
    svc = RouteService(AsyncioEventBus())
    result = await svc.preview_route(ctx, "any")
    assert result is None
