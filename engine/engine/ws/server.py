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
    from engine.control.state import RideState
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
    state: "RideState"
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

# Module-level client registry — mutated by _handler coroutines.
CLIENTS: set[ServerConnection] = set()


def _apply_ghost(ctx: RouteContext, route: "RouteData") -> None:
    """Create GhostTracker from ctx.pending_ghost config and the loaded route."""
    from engine.route.ghost import GhostTracker

    pg = ctx.pending_ghost
    if pg is None:
        return
    mode = pg.get("mode", "none")
    ctx.ghost_tracker = None

    if mode == "strava":
        strava_id = pg.get("strava_id")
        if strava_id and ctx.streams_dir:
            path = ctx.streams_dir / f"{strava_id}.json"
            if path.exists():
                try:
                    streams = json.loads(path.read_text(encoding="utf-8"))
                    ctx.ghost_tracker = GhostTracker.from_strava_streams(streams)
                    _log.info("Ghost: strava %s loaded", strava_id)
                except Exception as exc:
                    _log.warning("Ghost: strava load failed for %s: %s", strava_id, exc)
            else:
                _log.warning("Ghost: streams file not found for strava_id %s", strava_id)

    elif mode == "estimated":
        total_time_s: Optional[float] = None
        if ctx.current_route_id and ctx.library:
            entry = next(
                (e for e in ctx.library.list_routes() if e.id == ctx.current_route_id), None
            )
            if entry:
                total_time_s = float(entry.moving_time_s or entry.best_time_s or 0) or None
        if not total_time_s:
            # Fallback: 20 km/h average speed estimate
            total_time_s = (route.total_dist_m / 1000.0 / 20.0) * 3600.0
        ctx.ghost_tracker = GhostTracker.from_fallback(
            list(route.lats), list(route.lons), list(route.cum_dist_m), total_time_s
        )
        _log.info("Ghost: estimated pace %.0fs loaded", total_time_s)
    # mode == "none": ghost_tracker stays None


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


def _broadcast_strava_status(ctx: RouteContext, syncing: bool = False) -> None:
    _put(ctx.broadcast_queue, {
        "type": "strava_status",
        "connected": ctx.strava_auth.is_connected if ctx.strava_auth else False,
        "athlete_name": ctx.strava_auth.athlete_name if ctx.strava_auth else None,
        "syncing": syncing,
    })


async def _strava_exchange_and_sync(
    ctx: RouteContext, code: str, ws: ServerConnection
) -> None:
    assert ctx.strava_auth is not None
    try:
        await asyncio.to_thread(ctx.strava_auth.exchange_code, code)
    except Exception as exc:
        _log.warning("Strava code exchange failed: %s", exc)
        try:
            await ws.send(json.dumps({"type": "strava_error", "message": str(exc)}))
        except Exception:
            pass
        return
    _broadcast_strava_status(ctx)
    await _strava_sync(ctx)


async def _strava_sync(ctx: RouteContext) -> None:
    assert ctx.strava_auth is not None
    assert ctx.strava_importer is not None
    if ctx.strava_syncing:
        _log.info("Strava sync already in progress, ignoring duplicate request")
        return
    ctx.strava_syncing = True
    _broadcast_strava_status(ctx, syncing=True)

    imported = 0
    try:
        from engine.strava.client import StravaClient
        client = StravaClient(ctx.strava_auth)
        activities = await asyncio.to_thread(client.fetch_activities, 50)

        for act in activities:
            strava_id = str(act["id"])
            if ctx.strava_importer.already_imported(strava_id):
                continue
            streams = await asyncio.to_thread(client.fetch_streams, act["id"])
            entry = await asyncio.to_thread(
                ctx.strava_importer.import_activity, act, streams
            )
            if entry is not None:
                imported += 1
                if ctx.library:
                    _put(ctx.broadcast_queue, ctx.library.to_ws_message())
    except Exception as exc:
        _log.error("Strava sync error: %s", exc)
        _put(ctx.broadcast_queue, {
            "type": "strava_error",
            "message": f"Sync fehlgeschlagen: {exc}",
        })
    finally:
        ctx.strava_syncing = False

    _broadcast_strava_status(ctx, syncing=False)
    if ctx.library:
        _put(ctx.broadcast_queue, ctx.library.to_ws_message())
    _log.info("Strava sync complete: %d new activities imported", imported)


async def _load_route(ctx: RouteContext, path: str) -> None:
    """Handle inbound load_route (path-based): parse GPX, broadcast route_data, start RouteTracker."""
    from engine.route.loader import load_gpx
    await _do_load_route(ctx, lambda: load_gpx(path), label=repr(path))


async def _load_route_content(ctx: RouteContext, content: str) -> None:
    """Handle inbound load_route_content (browser file upload): parse GPX string."""
    from engine.route.loader import extract_gpx_name, load_gpx_content
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
    ctx.ghost_tracker = None
    ctx.current_route = None

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
    ctx.current_route = route

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

    # Apply ghost config that arrived via set_ghost before route loading finished.
    if ctx.pending_ghost is not None:
        _apply_ghost(ctx, route)
        ctx.pending_ghost = None


def _resolve_auto_ghost(
    ctx: RouteContext, route_id: Optional[str]
) -> tuple[str, Optional[str]]:
    """Resolve 'auto' ghost mode → ('strava', strava_id) or ('estimated', None)."""
    if ctx.streams_dir and ctx.library and route_id:
        entry = next((e for e in ctx.library.list_routes() if e.id == route_id), None)
        if entry and entry.strava_id:
            path = ctx.streams_dir / f"{entry.strava_id}.json"
            if path.exists():
                return "strava", entry.strava_id
    return "estimated", None


async def _cancel_active_ride(ctx: RouteContext) -> None:
    """Cancel any running phase_task or legacy tracker_task."""
    for task_attr in ("phase_task", "tracker_task"):
        task = getattr(ctx, task_attr)
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        setattr(ctx, task_attr, None)
    ctx.tracker = None
    ctx.ghost_tracker = None
    ctx.current_route = None
    # Reset erg state
    ctx.state.erg_mode = False
    ctx.state.erg_power_table = None
    ctx.state.erg_cadence_table = None
    ctx.state.target_power_w = None
    ctx.state.erg_committed_power_w = None
    ctx.state.erg_committed_cadence = None
    ctx.state.erg_pending_power_w = None
    ctx.state.erg_pending_cadence = None
    ctx.state.erg_commit_at_monotonic = 0.0
    ctx.state.ride_phase = "route"
    ctx.state.lap_index = 0
    ctx.state.lap_count = 1
    ctx.state.phase_end_monotonic = None
    ctx.state.ride_start_monotonic = None


async def _start_ride(ctx: RouteContext, msg: dict) -> None:
    """Handle start_ride message: load, transform, configure, spawn phase machine."""
    from engine.control.phases import run_phases
    from engine.route.erg import compute_cadence_table, compute_target_power_table
    from engine.route.ghost import GhostTracker
    from engine.route.loader import load_gpx, reverse_route, slice_route

    route_id = msg.get("route_id")
    if not isinstance(route_id, str) or not route_id or ctx.library is None:
        return

    gpx_path = ctx.library.get_gpx_path(route_id)
    if gpx_path is None or not gpx_path.exists():
        _put(ctx.broadcast_queue, {"type": "route_error", "message": "Strecke nicht gefunden"})
        return

    await _cancel_active_ride(ctx)

    try:
        route = await asyncio.to_thread(load_gpx, str(gpx_path))
    except Exception as exc:
        _put(ctx.broadcast_queue, {"type": "route_error", "message": f"{type(exc).__name__}: {exc}"})
        ctx.state.real_grade_percent = 0.0
        return

    if msg.get("reverse", False):
        route = reverse_route(route)

    cut_start = msg.get("cutout_start_m")
    cut_end = msg.get("cutout_end_m")
    if cut_start is not None or cut_end is not None:
        try:
            route = slice_route(
                route,
                float(cut_start or 0.0),
                float(cut_end or route.total_dist_m),
            )
        except ValueError as exc:
            _put(ctx.broadcast_queue, {"type": "route_error", "message": str(exc)})
            return

    ctx.current_route = route
    ctx.current_route_id = route_id

    _put(ctx.broadcast_queue, {
        "type": "route_data",
        "lats": list(route.lats),
        "lons": list(route.lons),
        "elevations_m": list(route.elevations_m),
        "cum_dist_m": list(route.cum_dist_m),
        "grades_pct": list(route.grades_pct),
        "total_dist_m": route.total_dist_m,
    })

    erg_mode = bool(msg.get("erg_mode", False))
    ctx.state.erg_mode = erg_mode
    if erg_mode:
        ctx.state.erg_power_table = compute_target_power_table(
            route.grades_pct, ctx.state.athlete_ftp_w
        )
        ctx.state.erg_cadence_table = compute_cadence_table(route.grades_pct)
    else:
        ctx.state.erg_power_table = None
        ctx.state.erg_cadence_table = None

    # Ghost (disabled in erg mode)
    use_ghost = bool(msg.get("ghost", False)) and not erg_mode
    if use_ghost:
        ghost_mode, strava_id = _resolve_auto_ghost(ctx, route_id)
        if ghost_mode == "strava" and strava_id and ctx.streams_dir:
            path = ctx.streams_dir / f"{strava_id}.json"
            try:
                streams = json.loads(path.read_text(encoding="utf-8"))
                if cut_start is not None or cut_end is not None:
                    s = float(cut_start or 0.0)
                    e = float(cut_end or route.total_dist_m)
                    try:
                        ctx.ghost_tracker = GhostTracker.from_strava_streams_clipped(streams, s, e)
                    except Exception as exc2:
                        _log.warning("Ghost: stream clip failed, using unclipped: %s", exc2)
                        ctx.ghost_tracker = GhostTracker.from_strava_streams(streams)
                else:
                    ctx.ghost_tracker = GhostTracker.from_strava_streams(streams)
                _log.info("Ghost: strava %s loaded", strava_id)
            except Exception as exc:
                _log.warning("Ghost: strava load failed: %s", exc)
                ghost_mode = "estimated"

        if ghost_mode == "estimated":
            entry = next((e for e in ctx.library.list_routes() if e.id == route_id), None)
            total_time_s: Optional[float] = None
            if entry:
                total_time_s = float(entry.moving_time_s or entry.best_time_s or 0) or None
            if not total_time_s:
                total_time_s = (route.total_dist_m / 1000.0 / 20.0) * 3600.0
            ctx.ghost_tracker = GhostTracker.from_fallback(
                list(route.lats), list(route.lons), list(route.cum_dist_m), total_time_s
            )
            _log.info("Ghost: estimated pace %.0fs loaded", total_time_s)

    laps = max(1, int(msg.get("laps", 1)))
    warmup_s = max(0, int(msg.get("warmup_s", 0)))
    cooldown_s = max(0, int(msg.get("cooldown_s", 0)))
    rid_snapshot = route_id

    def _on_complete(elapsed_s: int) -> None:
        if ctx.library and rid_snapshot:
            ctx.library.update_best_time(rid_snapshot, elapsed_s)
            _put(ctx.broadcast_queue, ctx.library.to_ws_message())

    ctx.phase_task = asyncio.create_task(
        run_phases(
            ctx.state,
            route,
            ctx.stop_event,
            warmup_s=warmup_s,
            cooldown_s=cooldown_s,
            laps=laps,
            on_tracker_ready=lambda t: setattr(ctx, "tracker", t),
            on_tracker_done=lambda: setattr(ctx, "tracker", None),
            on_complete=_on_complete,
        ),
        name="ride_phases",
    )
    _log.info(
        "start_ride: route=%s reverse=%s laps=%d warmup=%ds cooldown=%ds erg=%s ghost=%s",
        route_id, msg.get("reverse", False), laps, warmup_s, cooldown_s, erg_mode, use_ghost,
    )


async def _handler(
    ws: ServerConnection,
    gear_engine: GearEngine | None = None,
    route_context: RouteContext | None = None,
) -> None:
    """Register a connected client, process inbound messages, then remove it."""
    CLIENTS.add(ws)
    _log.debug("WS client connected; total=%d", len(CLIENTS))

    # Send Strava connection status immediately on connect.
    if route_context is not None and route_context.strava_auth is not None:
        try:
            await ws.send(json.dumps({
                "type": "strava_status",
                "connected": route_context.strava_auth.is_connected,
                "athlete_name": route_context.strava_auth.athlete_name,
                "syncing": route_context.strava_syncing,
            }))
        except Exception:
            pass

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
                if route_context is not None and route_context.strava_auth is not None:
                    await ws.send(json.dumps({
                        "type": "strava_status",
                        "connected": route_context.strava_auth.is_connected,
                        "athlete_name": route_context.strava_auth.athlete_name,
                        "syncing": route_context.strava_syncing,
                    }))

            elif msg.get("type") == "start_ride":
                if route_context is None:
                    continue
                asyncio.create_task(_start_ride(route_context, msg), name="start_ride")

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

            # ------------------------------------------------------------------
            # Strava handlers

            elif msg.get("type") == "strava_get_auth_url":
                if route_context is None or route_context.strava_auth is None:
                    continue
                url = route_context.strava_auth.get_auth_url()
                await ws.send(json.dumps({"type": "strava_auth_url", "url": url}))

            elif msg.get("type") == "strava_submit_code":
                if route_context is None or route_context.strava_auth is None:
                    continue
                code = msg.get("code", "")
                if not isinstance(code, str) or not code.strip():
                    await ws.send(json.dumps({
                        "type": "strava_error", "message": "Kein Code angegeben"
                    }))
                    continue
                asyncio.create_task(
                    _strava_exchange_and_sync(route_context, code, ws),
                    name="strava_auth",
                )

            elif msg.get("type") == "strava_sync":
                if (
                    route_context is None
                    or route_context.strava_auth is None
                    or not route_context.strava_auth.is_connected
                ):
                    continue
                asyncio.create_task(_strava_sync(route_context), name="strava_sync")

            elif msg.get("type") == "set_paused":
                if route_context is not None:
                    route_context.state.paused = bool(msg.get("paused", False))

            elif msg.get("type") == "strava_disconnect":
                if route_context is not None and route_context.strava_auth is not None:
                    route_context.strava_auth.disconnect()
                    _broadcast_strava_status(route_context)

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
