"""WebSocket broadcast server for RideOS telemetry (INFRA-01).

Pattern: asyncio fan-out via a module-level client registry.
- broadcast_loop runs as a sibling asyncio.Task to reconnect_loop in main.py.
- BLE notification callback is a plain def; it posts to broadcast_queue via
  put_nowait (non-blocking). This coroutine drains the queue and fans out JSON
  to all connected clients.
- Inbound messages from browser clients are handled inside _handler (the
  asyncio WS task), never in the BLE callback path.
- Uses websockets 16.x asyncio API (NOT the legacy websockets.serve API).

References:
- RESEARCH.md Pattern 1: Asyncio Fan-out Broadcast Server
- RESEARCH.md Pitfall 1: websockets 16.x renamed API
- RESEARCH.md Pitfall 3: WS server blocks stop_event shutdown
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from websockets.asyncio.server import ServerConnection, serve

from engine.route.library import RouteLibrary

if TYPE_CHECKING:
    from engine.application.ride_service import RideService
    from engine.application.route_service import RouteService
    from engine.application.strava_service import StravaService
    from engine.domain.projection import RideStateProjection
    from engine.gears.engine import GearEngine
    from engine.route.ghost import GhostTracker
    from engine.route.model import RouteData
    from engine.route.tracker import RouteTracker
    from engine.strava.auth import StravaAuth
    from engine.strava.importer import StravaImporter

_log = logging.getLogger("rideos.ws")


@dataclass
class RouteContext:
    """Mutable container shared between main.py and _handler for route lifecycle."""
    broadcast_queue: "asyncio.Queue[dict]"
    stop_event: asyncio.Event
    tracker: "RouteTracker | None" = None
    tracker_task: "asyncio.Task | None" = None  # used by legacy load_route_content path
    phase_task: "asyncio.Task | None" = None     # used by start_ride path
    library: "RouteLibrary | None" = None
    current_route_id: "str | None" = None
    current_route: "RouteData | None" = None
    strava_auth: "StravaAuth | None" = None
    strava_importer: "StravaImporter | None" = None
    strava_syncing: bool = False
    ghost_tracker: "GhostTracker | None" = None
    pending_ghost: "dict | None" = None  # only used by legacy load_route_content path
    streams_dir: "Path | None" = None
    ride_service: "RideService | None" = None
    route_service: "RouteService | None" = None
    strava_service: "StravaService | None" = None
    projection: "RideStateProjection | None" = None

# Module-level client registry — mutated by _handler coroutines.
CLIENTS: set[ServerConnection] = set()


def _put(queue: asyncio.Queue, msg: dict) -> None:
    """Drop-oldest non-blocking queue put."""
    try:
        queue.put_nowait(msg)
    except asyncio.QueueFull:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        queue.put_nowait(msg)


async def _load_route(ctx: RouteContext, path: str) -> None:
    """Delegate path-based load to RouteService."""
    if ctx.route_service is None:
        _log.warning("load_route ignored: no route_service wired")
        return
    await ctx.route_service.load_route(ctx, path)


async def _load_route_content(ctx: RouteContext, content: str) -> None:
    """Delegate browser-upload load to RouteService."""
    if ctx.route_service is None:
        _log.warning("load_route_content ignored: no route_service wired")
        return
    await ctx.route_service.load_route_content(ctx, content)


async def _start_ride(ctx: RouteContext, msg: dict) -> None:
    """Delegate start_ride to RideService (transport-thin wrapper)."""
    if ctx.ride_service is None:
        _log.warning("start_ride ignored: no ride_service wired")
        return
    await ctx.ride_service.start_ride(ctx, msg)


async def _handler(
    ws: ServerConnection,
    gear_engine: GearEngine | None = None,
    route_context: RouteContext | None = None,
) -> None:
    """Register a connected client, process inbound messages, then remove it."""
    CLIENTS.add(ws)
    _log.debug("WS client connected; total=%d", len(CLIENTS))

    # Send Strava connection status immediately on connect.
    if route_context is not None and route_context.strava_service is not None:
        try:
            await ws.send(json.dumps(route_context.strava_service.status_message(route_context)))
        except Exception:
            pass

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            mtype = msg.get("type")

            if mtype == "gear_shift":
                if route_context is None or route_context.ride_service is None:
                    continue
                direction = msg.get("direction")
                if direction in ("up", "down"):
                    new = route_context.ride_service.shift(direction)
                    _log.info("WS gear shift %s -> gear %d", direction.upper(), new)

            elif mtype == "load_route":
                if route_context is None:
                    _log.warning("load_route ignored: no route_context wired")
                    continue
                path = msg.get("path")
                if not isinstance(path, str) or not path:
                    _log.warning("load_route ignored: invalid/missing path")
                    continue
                asyncio.create_task(_load_route(route_context, path), name="load_route")

            elif mtype == "load_route_content":
                if route_context is None:
                    _log.warning("load_route_content ignored: no route_context wired")
                    continue
                content = msg.get("content")
                if not isinstance(content, str) or not content:
                    _log.warning("load_route_content ignored: invalid/missing content")
                    continue
                _log.info("load_route_content received (%d bytes), spawning task", len(content))
                asyncio.create_task(
                    _load_route_content(route_context, content), name="load_route_content",
                )

            elif mtype == "athlete_settings":
                if route_context is None or route_context.ride_service is None:
                    continue
                route_context.ride_service.update_athlete_settings(
                    weight_kg=msg.get("weight_kg"),
                    height_cm=msg.get("height_cm"),
                    ftp_w=msg.get("ftp_w"),
                )

            elif mtype == "list_routes":
                if route_context is None:
                    continue
                if route_context.route_service is not None:
                    snap = route_context.route_service.library_snapshot(route_context)
                    if snap is not None:
                        await ws.send(json.dumps(snap))
                if route_context.strava_service is not None:
                    await ws.send(json.dumps(route_context.strava_service.status_message(route_context)))

            elif mtype == "start_ride":
                if route_context is None:
                    continue
                asyncio.create_task(_start_ride(route_context, msg), name="start_ride")

            elif mtype == "delete_route":
                if route_context is None or route_context.route_service is None:
                    continue
                rid = msg.get("route_id")
                if isinstance(rid, str) and rid:
                    route_context.route_service.delete_route(route_context, rid)
                    snap = route_context.route_service.library_snapshot(route_context)
                    if snap is not None:
                        await ws.send(json.dumps(snap))

            elif mtype == "rename_route":
                if route_context is None or route_context.route_service is None:
                    continue
                rid = msg.get("route_id")
                name = msg.get("name")
                if isinstance(rid, str) and rid and isinstance(name, str) and name.strip():
                    route_context.route_service.rename_route(route_context, rid, name.strip())
                    snap = route_context.route_service.library_snapshot(route_context)
                    if snap is not None:
                        await ws.send(json.dumps(snap))

            # ------------------------------------------------------------------
            # Strava handlers

            elif mtype == "strava_get_auth_url":
                if route_context is None or route_context.strava_service is None:
                    continue
                url = route_context.strava_service.get_auth_url(route_context)
                await ws.send(json.dumps({"type": "strava_auth_url", "url": url}))

            elif mtype == "strava_submit_code":
                if route_context is None or route_context.strava_service is None:
                    continue
                code = msg.get("code", "")
                if not isinstance(code, str) or not code.strip():
                    await ws.send(json.dumps({
                        "type": "strava_error", "message": "Kein Code angegeben",
                    }))
                    continue
                asyncio.create_task(
                    route_context.strava_service.exchange_code_and_sync(route_context, code),
                    name="strava_auth",
                )

            elif mtype == "strava_sync":
                if route_context is None or route_context.strava_service is None:
                    continue
                asyncio.create_task(
                    route_context.strava_service.sync(route_context),
                    name="strava_sync",
                )

            elif mtype == "set_paused":
                if route_context is None or route_context.ride_service is None:
                    continue
                route_context.ride_service.set_paused(bool(msg.get("paused", False)))

            elif mtype == "strava_disconnect":
                if route_context is not None and route_context.strava_service is not None:
                    route_context.strava_service.disconnect(route_context)

    except Exception:
        pass
    finally:
        CLIENTS.discard(ws)
        _log.debug("WS client disconnected; total=%d", len(CLIENTS))


async def broadcast_loop(
    broadcast_queue: asyncio.Queue[dict],
    stop_event: asyncio.Event,
    gear_engine: GearEngine | None = None,
    host: str = "localhost",
    port: int = 8765,
    route_context: RouteContext | None = None,
) -> None:
    """Run the WebSocket server and fan-out telemetry JSON to all clients.

    Drains broadcast_queue at up to BLE notification rate (~4-10 Hz).
    Handles inbound gear_shift messages from browser clients via _handler.
    Exits cleanly when stop_event is set.

    Args:
        broadcast_queue: Queue of telemetry snapshot dicts posted by _on_reading.
        stop_event: Shutdown signal; checked on every timeout iteration.
        gear_engine: GearEngine instance for inbound gear shift commands (optional).
        host: Bind address (default "localhost").
        port: Listen port (default 8765).
    """
    handler = partial(_handler, gear_engine=gear_engine, route_context=route_context)
    async with serve(handler, host, port, max_size=16 * 1024 * 1024):
        _log.info("WS server listening on ws://%s:%d", host, port)
        while not stop_event.is_set():
            try:
                payload = await asyncio.wait_for(
                    broadcast_queue.get(), timeout=0.1
                )
            except asyncio.TimeoutError:
                continue

            if not CLIENTS:
                continue

            data = json.dumps(payload)
            await asyncio.gather(
                *(c.send(data) for c in list(CLIENTS)),
                return_exceptions=True,
            )

    _log.info("WS server stopped")
