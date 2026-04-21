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
from dataclasses import dataclass, field
from functools import partial
from typing import TYPE_CHECKING

from websockets.asyncio.server import serve, ServerConnection

if TYPE_CHECKING:
    from engine.control.state import RideState
    from engine.gears.engine import GearEngine
    from engine.route.tracker import RouteTracker

_log = logging.getLogger("rideos.ws")


@dataclass
class RouteContext:
    """Mutable container shared between main.py and _handler for route lifecycle.

    Created in main.py, passed to broadcast_loop via kwarg, then to _handler via partial.
    Inbound load_route messages mutate tracker / tracker_task.
    """
    state: "RideState"                     # forward ref; import inside TYPE_CHECKING below
    broadcast_queue: "asyncio.Queue[dict]"
    stop_event: asyncio.Event
    tracker: "RouteTracker | None" = None
    tracker_task: "asyncio.Task | None" = None

# Module-level client registry — mutated by _handler coroutines.
CLIENTS: set[ServerConnection] = set()


async def _load_route(ctx: RouteContext, path: str) -> None:
    """Handle inbound load_route (path-based): parse GPX, broadcast route_data, start RouteTracker."""
    from engine.route.loader import load_gpx
    await _do_load_route(ctx, lambda: load_gpx(path), label=repr(path))


async def _load_route_content(ctx: RouteContext, content: str) -> None:
    """Handle inbound load_route_content (browser file upload): parse GPX string."""
    from engine.route.loader import load_gpx_content
    await _do_load_route(ctx, lambda: load_gpx_content(content), label="<browser upload>")


async def _do_load_route(ctx: RouteContext, loader_fn, label: str) -> None:
    """Shared route loading logic: cancel previous tracker, parse, broadcast, spawn tracker.

    Exceptions during load do NOT propagate — they produce a route_error WS
    message and leave any previously-cancelled tracker cancelled.
    """
    from engine.route.tracker import RouteTracker

    # Cancel any previous tracker task before starting a new one.
    if ctx.tracker_task is not None and not ctx.tracker_task.done():
        _log.info("Cancelling previous route tracker before loading new route")
        ctx.tracker_task.cancel()
        try:
            await ctx.tracker_task
        except (asyncio.CancelledError, Exception):
            pass
    ctx.tracker = None
    ctx.tracker_task = None

    # Parse GPX off the event loop to avoid blocking the 4 Hz tick path.
    try:
        route = await asyncio.to_thread(loader_fn)
    except Exception as exc:  # noqa: BLE001 — we want to report any load failure
        _log.warning("load_route failed for %s: %s", label, exc)
        try:
            ctx.broadcast_queue.put_nowait({
                "type": "route_error",
                "message": f"{type(exc).__name__}: {exc}",
            })
        except asyncio.QueueFull:
            ctx.broadcast_queue.get_nowait()
            ctx.broadcast_queue.put_nowait({
                "type": "route_error",
                "message": f"{type(exc).__name__}: {exc}",
            })
        # Route stays unloaded; grade stays at whatever the last writer set.
        ctx.state.real_grade_percent = 0.0
        return

    # Broadcast the one-shot route_data message before telemetry ticks resume.
    route_msg = {
        "type": "route_data",
        "lats": list(route.lats),
        "lons": list(route.lons),
        "elevations_m": list(route.elevations_m),
        "cum_dist_m": list(route.cum_dist_m),
        "grades_pct": list(route.grades_pct),
        "total_dist_m": route.total_dist_m,
    }
    try:
        ctx.broadcast_queue.put_nowait(route_msg)
    except asyncio.QueueFull:
        ctx.broadcast_queue.get_nowait()
        ctx.broadcast_queue.put_nowait(route_msg)

    # Spawn the tracker as a sibling task.
    tracker = RouteTracker(route)
    ctx.tracker = tracker
    ctx.tracker_task = asyncio.create_task(
        tracker.run(ctx.state, ctx.stop_event),
        name="route_tracker",
    )
    _log.info("Route loaded from %s: %d points, %.0f m total",
              label, len(route.lats), route.total_dist_m)


async def _handler(
    ws: ServerConnection,
    gear_engine: GearEngine | None = None,
    route_context: RouteContext | None = None,
) -> None:
    """Register a connected client, process inbound messages, then remove it."""
    CLIENTS.add(ws)
    _log.debug("WS client connected; total=%d", len(CLIENTS))
    try:
        async for raw in ws:
            if gear_engine is None:
                continue
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if msg.get("type") == "gear_shift":
                direction = msg.get("direction")
                if direction == "up":
                    new = gear_engine.shift_up()
                    _log.info("WS gear shift UP -> gear %d", new)
                elif direction == "down":
                    new = gear_engine.shift_down()
                    _log.info("WS gear shift DOWN -> gear %d", new)
            elif msg.get("type") == "load_route":
                if route_context is None:
                    _log.warning("load_route ignored: no route_context wired")
                    continue
                path = msg.get("path")
                if not isinstance(path, str) or not path:
                    _log.warning("load_route ignored: invalid/missing path")
                    continue
                asyncio.create_task(_load_route(route_context, path), name="load_route")
            elif msg.get("type") == "load_route_content":
                if route_context is None:
                    _log.warning("load_route_content ignored: no route_context wired")
                    continue
                content = msg.get("content")
                if not isinstance(content, str) or not content:
                    _log.warning("load_route_content ignored: invalid/missing content")
                    continue
                _log.info("load_route_content received (%d bytes), spawning task", len(content))
                asyncio.create_task(
                    _load_route_content(route_context, content), name="load_route_content"
                )
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
    async with serve(handler, host, port):
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
