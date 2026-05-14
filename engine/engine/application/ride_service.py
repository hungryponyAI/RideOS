"""RideService — application-level orchestration for the ride lifecycle.

Owns: phase-machine task, ride start/end, mid-ride pause toggle, gear shifts,
and the athlete profile.

Publishes domain events to the EventBus on every meaningful state change.
All read-model consumers should read from RideStateProjection, not from here.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING, Any, Callable, Literal, Optional

from engine.control.athlete import AthleteProfile
from engine.domain.events import (
    GearShifted,
    RideEnded,
    RidePauseToggled,
    RidePhaseChanged,
    RideStarted,
)
from engine.domain.physics import PhysicsConfig, estimate_cda
from engine.gears.engine import GearEngine
from engine.ports.eventbus import EventBusPort

if TYPE_CHECKING:
    from engine.control.erg_debouncer import ErgDebouncer
    from engine.domain.projection import RideStateProjection
    from engine.ws.server import RouteContext

_log = logging.getLogger("rideos.application.ride")


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


class RideService:
    """Owns the ride lifecycle: shift, pause, start, end."""

    def __init__(
        self,
        athlete: AthleteProfile,
        gear_engine: GearEngine,
        bus: EventBusPort,
        erg_debouncer: "ErgDebouncer",
        projection: "RideStateProjection",
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._athlete = athlete
        self._gears = gear_engine
        self._bus = bus
        self._erg = erg_debouncer
        self._projection = projection
        self._clock = clock

    # ── synchronous user actions ──────────────────────────────────────────

    def shift(self, direction: Literal["up", "down"]) -> int:
        """Shift one gear and publish GearShifted."""
        gear = self._gears.shift_up() if direction == "up" else self._gears.shift_down()
        self._bus.publish(GearShifted(gear=gear, direction=direction, t_mono=self._clock()))
        return gear

    def set_paused(self, paused: bool) -> None:
        """Toggle pause/resume mid-ride and publish RidePauseToggled."""
        if self._projection.view.paused == paused:
            return
        self._bus.publish(RidePauseToggled(paused=paused, t_mono=self._clock()))

    def update_athlete_settings(
        self,
        *,
        weight_kg: Optional[float] = None,
        height_cm: Optional[float] = None,
        ftp_w: Optional[float] = None,
    ) -> None:
        """Update rider profile fields. Positive values only; None/<=0 is ignored."""
        if weight_kg is not None and weight_kg > 0:
            self._athlete.weight_kg = float(weight_kg)
        if height_cm is not None and height_cm > 0:
            self._athlete.height_cm = float(height_cm)
        if ftp_w is not None and ftp_w > 0:
            self._athlete.ftp_w = float(ftp_w)
        _log.info(
            "Athlete settings: %.1f kg  %.0f cm  FTP %.0f W",
            self._athlete.weight_kg, self._athlete.height_cm, self._athlete.ftp_w,
        )

    # ── async ride lifecycle ──────────────────────────────────────────────

    async def cancel_active_ride(self, ctx: "RouteContext") -> None:
        """Cancel any running phase_task or legacy tracker_task and reset erg state."""
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
        self._erg.reset()

    async def start_ride(self, ctx: "RouteContext", msg: dict) -> None:
        """Handle a start_ride request: load, transform, configure, spawn phase machine."""
        from engine.control.phases import run_phases
        from engine.route.erg import compute_cadence_table, compute_target_power_table
        from engine.route.loader import load_gpx, reverse_route, slice_route

        route_id = msg.get("route_id")
        if not isinstance(route_id, str) or not route_id or ctx.library is None:
            return

        gpx_path = ctx.library.get_gpx_path(route_id)
        if gpx_path is None or not gpx_path.exists():
            _put(ctx.broadcast_queue, {"type": "route_error", "message": "Strecke nicht gefunden"})
            return

        await self.cancel_active_ride(ctx)

        try:
            route = await asyncio.to_thread(load_gpx, str(gpx_path))
        except Exception as exc:
            _put(ctx.broadcast_queue, {"type": "route_error", "message": f"{type(exc).__name__}: {exc}"})
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
        if erg_mode:
            self._erg.configure(
                power_table=compute_target_power_table(
                    route.grades_pct, self._athlete.ftp_w,
                ),
                cadence_table=compute_cadence_table(route.grades_pct),
            )
        else:
            self._erg.reset()

        # Ghost (disabled in erg mode)
        use_ghost = bool(msg.get("ghost", False)) and not erg_mode
        if use_ghost:
            self._setup_ghost(ctx, route_id, route, cut_start, cut_end)

        laps = max(1, int(msg.get("laps", 1)))
        warmup_s = max(0, int(msg.get("warmup_s", 0)))
        cooldown_s = max(0, int(msg.get("cooldown_s", 0)))
        use_physics = bool(msg.get("physics_mode", False))
        rid_snapshot = route_id

        def _on_complete(elapsed_s: int) -> None:
            if ctx.library and rid_snapshot:
                ctx.library.update_best_time(rid_snapshot, elapsed_s)
                _put(ctx.broadcast_queue, ctx.library.to_ws_message())
            self._bus.publish(RideEnded(elapsed_s=elapsed_s, t_mono=self._clock(), reason="completed"))

        def _on_phase_change(
            phase: str, target_w: Optional[float], end_mono: Optional[float],
        ) -> None:
            self._bus.publish(RidePhaseChanged(
                phase=phase,  # type: ignore[arg-type]
                target_power_w=target_w,
                phase_end_mono=end_mono,
                t_mono=self._clock(),
            ))

        speed_fn = lambda: self._projection.view.speed_kmh  # noqa: E731
        physics_config = None
        power_fn = None
        if use_physics:
            physics_config = PhysicsConfig(
                rider_mass_kg=self._athlete.weight_kg,
                cda_m2=estimate_cda(self._athlete.weight_kg, self._athlete.height_cm),
            )
            power_fn = lambda: self._projection.view.power_w  # noqa: E731

        ctx.phase_task = asyncio.create_task(
            run_phases(
                route,
                ctx.stop_event,
                speed_fn,
                warmup_s=warmup_s,
                cooldown_s=cooldown_s,
                laps=laps,
                bus=self._bus,
                on_tracker_ready=lambda t: setattr(ctx, "tracker", t),
                on_tracker_done=lambda: setattr(ctx, "tracker", None),
                on_complete=_on_complete,
                on_phase_change=_on_phase_change,
                physics_config=physics_config,
                power_fn=power_fn,
            ),
            name="ride_phases",
        )
        self._bus.publish(RideStarted(
            route_id=route_id,
            laps=laps,
            warmup_s=warmup_s,
            cooldown_s=cooldown_s,
            erg_mode=erg_mode,
            t_mono=self._clock(),
        ))
        _log.info(
            "start_ride: route=%s reverse=%s laps=%d warmup=%ds cooldown=%ds erg=%s ghost=%s physics=%s",
            route_id, msg.get("reverse", False), laps, warmup_s, cooldown_s, erg_mode, use_ghost,
            use_physics,
        )

    async def end_ride(self, ctx: "RouteContext") -> None:
        """Cancel an in-progress ride and publish RideEnded."""
        elapsed_s = 0
        ride_start = self._projection.view.ride_start_mono
        if ride_start is not None:
            elapsed_s = int(self._clock() - ride_start)
        await self.cancel_active_ride(ctx)
        self._bus.publish(RideEnded(elapsed_s=elapsed_s, t_mono=self._clock(), reason="user_ended"))

    # ── helpers ───────────────────────────────────────────────────────────

    def _setup_ghost(
        self,
        ctx: "RouteContext",
        route_id: str,
        route: Any,
        cut_start: Optional[float],
        cut_end: Optional[float],
    ) -> None:
        from engine.route.ghost import GhostTracker

        ghost_mode, strava_id = self._resolve_auto_ghost(ctx, route_id)
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
                return
            except Exception as exc:
                _log.warning("Ghost: strava load failed: %s", exc)
                ghost_mode = "estimated"

        if ghost_mode == "estimated" and ctx.library is not None:
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

    @staticmethod
    def _resolve_auto_ghost(
        ctx: "RouteContext", route_id: Optional[str],
    ) -> tuple[str, Optional[str]]:
        """Resolve 'auto' ghost mode → ('strava', strava_id) or ('estimated', None)."""
        if ctx.streams_dir and ctx.library and route_id:
            entry = next((e for e in ctx.library.list_routes() if e.id == route_id), None)
            if entry and entry.strava_id:
                path = ctx.streams_dir / f"{entry.strava_id}.json"
                if path.exists():
                    return "strava", entry.strava_id
        return "estimated", None
