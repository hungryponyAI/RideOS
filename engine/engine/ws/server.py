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
from typing import Optional, TYPE_CHECKING

from websockets.asyncio.server import serve, ServerConnection

from engine.route.library import RouteLibrary

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
    library: "RouteLibrary | None" = None
    current_route_id: "str | None" = None

# Module-level client registry — mutated by _handler coroutines.
CLIENTS: set[ServerConnection] = set()


async def _load_route(ctx: RouteContext, path: str) -> None:
    """Handle inbound load_route (path-based): parse GPX, broadcast route_data, start RouteTracker."""
    from engine.route.loader import load_gpx
    await _do_load_route(ctx, lambda: load_gpx(path), label=repr(path))


async def _load_route_content(ctx: RouteContext, content: str) -> None:
    """Handle inbound load_route_content (browser file upload): parse GPX string."""
    from engine.route.loader import load_gpx_content, extract_gpx_name
    name = await asyncio.to_thread(extract_gpx_name, content)
    await _do_load_route(ctx, lambda: load_gpx_content(content), label="<browser upload>",
                         gpx_content=content, route_name=name)


async def _do_load_route(
    ctx: RouteContext,
    loader_fn,
    label: str,
    *,
    gpx_content: Optional[str] = None,
    route_name: Optional[str] = None,
    route_id: Optional[str] = None,
) -> None:
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

    # Determine route_id for this session
    ctx.current_route_id = None
    active_route_id: Optional[str] = route_id

    if ctx.library is not None and gpx_content is not None:
        name = route_name or "Route"
        try:
            entry = await asyncio.to_thread(ctx.library.add_route, name, gpx_content, route)
            active_route_id = entry.id
            # Broadcast updated library
            lib_msg = ctx.library.to_ws_message()
            try:
                ctx.broadcast_queue.put_nowait(lib_msg)
            except asyncio.QueueFull:
                ctx.broadcast_queue.get_nowait()
                ctx.broadcast_queue.put_nowait(lib_msg)
        except Exception as exc:
            _log.warning("Library: could not save route: %s", exc)

    ctx.current_route_id = active_route_id

    # Build on_complete closure capturing current route_id
    rid_snapshot = active_route_id

    def _on_complete(elapsed_s: int) -> None:
        if ctx.library is not None and rid_snapshot is not None:
            ctx.library.update_best_time(rid_snapshot, elapsed_s)
            lib_msg = ctx.library.to_ws_message()
            try:
                ctx.broadcast_queue.put_nowait(lib_msg)
            except asyncio.QueueFull:
                try:
                    ctx.broadcast_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                ctx.broadcast_queue.put_nowait(lib_msg)

    # Spawn the tracker as a sibling task.
    tracker = RouteTracker(route, on_complete=_on_complete)
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
            elif msg.get("type") == "athlete_settings":
                if route_context is not None:
                    s = route_context.state
                    w = msg.get("weight_kg")
                    h = msg.get("height_cm")
                    f = msg.get("ftp_w")
                    if isinstance(w, (int, float)) and w > 0:
                        s.athlete_weight_kg = float(w)
                    if isinstance(h, (int, float)) and h > 0:
                        s.athlete_height_cm = float(h)
                    if isinstance(f, (int, float)) and f > 0:
                        s.athlete_ftp_w = float(f)
                    _log.info(
                        "Athlete settings: %.1f kg  %.0f cm  FTP %.0f W",
                        s.athlete_weight_kg, s.athlete_height_cm, s.athlete_ftp_w,
                    )
            elif msg.get("type") == "list_routes":
                if route_context is not None and route_context.library is not None:
                    lib_msg = route_context.library.to_ws_message()
                    await ws.send(json.dumps(lib_msg))

            elif msg.get("type") == "load_saved_route":
                if route_context is None or route_context.library is None:
                    continue
                rid = msg.get("route_id")
                if not isinstance(rid, str) or not rid:
                    continue
                gpx_path = route_context.library.get_gpx_path(rid)
                if gpx_path is None or not gpx_path.exists():
                    await ws.send(json.dumps({"type": "route_error", "message": "Strecke nicht gefunden"}))
                    continue
                from engine.route.loader import load_gpx as _load_gpx
                asyncio.create_task(
                    _do_load_route(route_context, lambda p=gpx_path: _load_gpx(str(p)),
                                   label=repr(str(gpx_path)), route_id=rid),
                    name="load_saved_route",
                )

            elif msg.get("type") == "delete_route":
                if route_context is None or route_context.library is None:
                    continue
                rid = msg.get("route_id")
                if isinstance(rid, str) and rid:
                    route_context.library.delete_route(rid)
                    lib_msg = route_context.library.to_ws_message()
                    await ws.send(json.dumps(lib_msg))

            elif msg.get("type") == "rename_route":
                if route_context is None or route_context.library is None:
                    continue
                rid = msg.get("route_id")
                name = msg.get("name")
                if isinstance(rid, str) and rid and isinstance(name, str) and name.strip():
                    route_context.library.rename_route(rid, name.strip())
                    lib_msg = route_context.library.to_ws_message()
                    await ws.send(json.dumps(lib_msg))
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
