"""RouteService — application-level orchestration for GPX routes and library.

Owns: GPX parsing, library CRUD, route_data WS broadcast, ghost-tracker setup
on legacy "free ride" loads. Publishes RouteLoaded on every successful load.

The legacy `load_route` / `load_route_content` paths spawn their own
RouteTracker (free-ride mode). RideService.start_ride uses run_phases instead.
Both call into this service for parsing and library updates.

Coupling to RouteContext is intentional and temporary; library WS broadcasts
will move to a projection-driven subscriber in P4.6.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING, Any, Callable, Optional

from engine.domain.events import RouteLoaded
from engine.ports.eventbus import EventBusPort

if TYPE_CHECKING:
    from engine.route.model import RouteData
    from engine.ws.server import RouteContext

_log = logging.getLogger("rideos.application.route")


def _put(queue: "asyncio.Queue[dict]", msg: dict) -> None:
    """Drop-oldest non-blocking queue put — mirrors ws/server._put."""
    try:
        queue.put_nowait(msg)
    except asyncio.QueueFull:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        queue.put_nowait(msg)


def _route_data_msg(route: "RouteData") -> dict:
    return {
        "type": "route_data",
        "lats": list(route.lats),
        "lons": list(route.lons),
        "elevations_m": list(route.elevations_m),
        "cum_dist_m": list(route.cum_dist_m),
        "grades_pct": list(route.grades_pct),
        "total_dist_m": route.total_dist_m,
    }


class RouteService:
    """Owns GPX loading, library CRUD, and free-ride tracker spawning."""

    def __init__(
        self,
        bus: EventBusPort,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._bus = bus
        self._clock = clock

    # ── inbound load handlers ─────────────────────────────────────────────

    async def load_route(self, ctx: "RouteContext", path: str) -> None:
        """Path-based GPX load: parse, broadcast, spawn free-ride tracker."""
        from engine.route.loader import load_gpx
        await self._do_load(ctx, lambda: load_gpx(path), label=repr(path))

    async def load_route_content(self, ctx: "RouteContext", content: str) -> None:
        """Browser-upload GPX load: parse, persist to library, broadcast, spawn tracker."""
        from engine.route.loader import extract_gpx_name, load_gpx_content
        name = await asyncio.to_thread(extract_gpx_name, content)
        await self._do_load(
            ctx,
            lambda: load_gpx_content(content),
            label="<browser upload>",
            gpx_content=content,
            route_name=name,
        )

    # ── library CRUD ──────────────────────────────────────────────────────

    def delete_route(self, ctx: "RouteContext", route_id: str) -> bool:
        if ctx.library is None:
            return False
        return ctx.library.delete_route(route_id)

    def rename_route(self, ctx: "RouteContext", route_id: str, name: str) -> bool:
        if ctx.library is None:
            return False
        return ctx.library.rename_route(route_id, name)

    def library_snapshot(self, ctx: "RouteContext") -> Optional[dict]:
        return ctx.library.to_ws_message() if ctx.library is not None else None

    # ── internals ─────────────────────────────────────────────────────────

    async def _do_load(
        self,
        ctx: "RouteContext",
        loader_fn: Callable[[], "RouteData"],
        label: str,
        *,
        gpx_content: Optional[str] = None,
        route_name: Optional[str] = None,
        route_id: Optional[str] = None,
    ) -> None:
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

        # Parse off the event loop to avoid stalling the 4 Hz tick.
        try:
            route = await asyncio.to_thread(loader_fn)
        except Exception as exc:  # noqa: BLE001 — surface every load failure to the UI
            _log.warning("load_route failed for %s: %s", label, exc)
            _put(ctx.broadcast_queue, {
                "type": "route_error",
                "message": f"{type(exc).__name__}: {exc}",
            })
            ctx.state.real_grade_percent = 0.0
            return

        _put(ctx.broadcast_queue, _route_data_msg(route))

        ctx.current_route_id = None
        active_route_id: Optional[str] = route_id

        if ctx.library is not None and gpx_content is not None:
            name = route_name or "Route"
            try:
                entry = await asyncio.to_thread(ctx.library.add_route, name, gpx_content, route)
                active_route_id = entry.id
                _put(ctx.broadcast_queue, ctx.library.to_ws_message())
            except Exception as exc:
                _log.warning("Library: could not save route: %s", exc)

        ctx.current_route_id = active_route_id
        ctx.current_route = route

        rid_snapshot = active_route_id

        def _on_complete(elapsed_s: int) -> None:
            if ctx.library is not None and rid_snapshot is not None:
                ctx.library.update_best_time(rid_snapshot, elapsed_s)
                _put(ctx.broadcast_queue, ctx.library.to_ws_message())

        tracker = RouteTracker(route, on_complete=_on_complete)
        ctx.tracker = tracker
        ctx.tracker_task = asyncio.create_task(
            tracker.run(ctx.state, ctx.stop_event),
            name="route_tracker",
        )
        _log.info("Route loaded from %s: %d points, %.0f m total",
                  label, len(route.lats), route.total_dist_m)

        if active_route_id is not None:
            self._bus.publish(RouteLoaded(
                route_id=active_route_id,
                total_dist_m=route.total_dist_m,
                t_mono=self._clock(),
            ))

        # Apply ghost config that arrived via set_ghost before route loading finished.
        if ctx.pending_ghost is not None:
            self._apply_pending_ghost(ctx, route)
            ctx.pending_ghost = None

    @staticmethod
    def _apply_pending_ghost(ctx: "RouteContext", route: "RouteData") -> None:
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
            return

        if mode == "estimated":
            total_time_s: Optional[float] = None
            if ctx.current_route_id and ctx.library:
                entry = next(
                    (e for e in ctx.library.list_routes() if e.id == ctx.current_route_id), None,
                )
                if entry:
                    total_time_s = float(entry.moving_time_s or entry.best_time_s or 0) or None
            if not total_time_s:
                # Fallback: 20 km/h average speed estimate
                total_time_s = (route.total_dist_m / 1000.0 / 20.0) * 3600.0
            ctx.ghost_tracker = GhostTracker.from_fallback(
                list(route.lats), list(route.lons), list(route.cum_dist_m), total_time_s,
            )
            _log.info("Ghost: estimated pace %.0fs loaded", total_time_s)
