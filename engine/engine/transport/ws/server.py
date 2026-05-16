"""WebSocket server lifecycle: accept connections, dispatch inbound, fan-out outbound.

RouteContext is the composition-root state carrier shared between transport
handlers and application services (via TYPE_CHECKING imports).
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from websockets.asyncio.server import ServerConnection, serve

from engine.transport.ws.inbound import WSInbound

if TYPE_CHECKING:
    from engine.adapters.persistence.sqlite.ride_repo import SqliteRideRepo
    from engine.application.ride_service import RideService
    from engine.application.route_service import RouteService
    from engine.application.strava_service import StravaService
    from engine.domain.projection import RideStateProjection
    from engine.gears.engine import GearEngine
    from engine.route.ghost import GhostTracker
    from engine.route.library import RouteLibrary
    from engine.route.model import RouteData
    from engine.route.tracker import RouteTracker
    from engine.strava.auth import StravaAuth
    from engine.strava.importer import StravaImporter

_log = logging.getLogger("rideos.transport.ws.server")

CLIENTS: set[ServerConnection] = set()


@dataclass
class RouteContext:
    """Mutable state carrier: shared between composition root, inbound, and outbound."""
    broadcast_queue: "asyncio.Queue[dict]"
    stop_event: asyncio.Event
    tracker: "RouteTracker | None" = None
    tracker_task: "asyncio.Task | None" = None
    phase_task: "asyncio.Task | None" = None
    library: "RouteLibrary | None" = None
    current_route_id: "str | None" = None
    current_ride_session_id: "str | None" = None
    current_route: "RouteData | None" = None
    strava_auth: "StravaAuth | None" = None
    strava_importer: "StravaImporter | None" = None
    strava_syncing: bool = False
    ghost_tracker: "GhostTracker | None" = None
    pending_ghost: "dict | None" = None
    streams_dir: "Path | None" = None
    ride_service: "RideService | None" = None
    route_service: "RouteService | None" = None
    strava_service: "StravaService | None" = None
    projection: "RideStateProjection | None" = None
    ride_repo: "SqliteRideRepo | None" = None


async def broadcast_loop(
    broadcast_queue: asyncio.Queue[dict],
    stop_event: asyncio.Event,
    gear_engine: "GearEngine | None" = None,
    host: str = "localhost",
    port: int = 8765,
    route_context: "RouteContext | None" = None,
) -> None:
    """Run the WebSocket server and fan-out broadcast_queue messages to all clients.

    Args:
        broadcast_queue: Shared queue; outbound loop and adapters put messages here.
        stop_event: Fires on shutdown.
        gear_engine: Accepted for API compatibility; routing goes via ride_service.
        host: Bind address.
        port: Listen port.
        route_context: Wires inbound dispatch to application services.
    """
    if route_context is None:
        route_context = RouteContext(
            broadcast_queue=broadcast_queue,
            stop_event=stop_event,
        )

    inbound = WSInbound(route_context)

    async def _handler(ws: ServerConnection) -> None:
        CLIENTS.add(ws)
        _log.debug("WS client connected; total=%d", len(CLIENTS))

        # Push Strava status immediately on connect.
        ctx = inbound._ctx
        if ctx.strava_service is not None:
            try:
                await ws.send(json.dumps(ctx.strava_service.status_message(ctx)))
            except Exception:
                pass

        try:
            async for raw in ws:
                await inbound.handle(ws, raw)
        except Exception:
            pass
        finally:
            CLIENTS.discard(ws)
            _log.debug("WS client disconnected; total=%d", len(CLIENTS))

    async with serve(_handler, host, port, max_size=16 * 1024 * 1024):
        _log.info("WS server listening on ws://%s:%d", host, port)
        while not stop_event.is_set():
            try:
                payload = await asyncio.wait_for(broadcast_queue.get(), timeout=0.1)
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
