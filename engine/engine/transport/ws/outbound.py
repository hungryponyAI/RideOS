"""Outbound broadcast loop: polls the read-model projection at 4 Hz and puts
a telemetry snapshot onto the broadcast queue for fan-out by the WS server.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.control.erg_debouncer import ErgDebouncer
    from engine.domain.projection import RideStateProjection
    from engine.gears.engine import GearEngine
    from engine.transport.ws.server import RouteContext

_log = logging.getLogger("rideos.transport.ws.outbound")


def _put(queue: "asyncio.Queue[dict]", msg: dict) -> None:
    """Drop-oldest non-blocking queue put."""
    try:
        queue.put_nowait(msg)
    except asyncio.QueueFull:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        queue.put_nowait(msg)


async def run_outbound_loop(
    broadcast_queue: "asyncio.Queue[dict]",
    stop_event: asyncio.Event,
    projection: "RideStateProjection",
    route_ctx: "RouteContext",
    erg_debouncer: "ErgDebouncer",
    gear_engine: "GearEngine",
) -> None:
    """Poll projection at 4 Hz, push telemetry snapshot to broadcast_queue."""
    while not stop_event.is_set():
        try:
            v = projection.view
            now_t = time.monotonic()

            active_route_id = route_ctx.current_route_id or v.route_id
            route_loaded = route_ctx.current_route is not None or route_ctx.tracker is not None
            projection_matches_route = (
                route_ctx.current_route_id is None
                or v.route_id == route_ctx.current_route_id
            )
            if route_ctx.tracker is not None:
                rider_pos = route_ctx.tracker.position_m
            elif route_ctx.current_route is not None and not projection_matches_route:
                rider_pos = 0.0
            else:
                rider_pos = v.position_m

            ghost_snap = None
            if route_ctx.ghost_tracker is not None:
                route_ctx.ghost_tracker.tick(v.paused)
                ghost_snap = route_ctx.ghost_tracker.snapshot(rider_pos, v.lap_index)

            phase_remaining_s = (
                max(0, int(v.phase_end_mono - now_t)) if v.phase_end_mono is not None else None
            )

            elapsed_s = (
                int(v.elapsed_s_at(now_t)) if v.ride_start_mono is not None else None
            )

            total_dist_m = (
                route_ctx.current_route.total_dist_m
                if route_ctx.current_route is not None
                else v.total_dist_m
            )

            dist_remaining_m = None
            if total_dist_m is not None:
                dist_remaining_m = max(0.0, total_dist_m - rider_pos)

            erg_change_countdown_s = None
            if (
                v.erg_mode
                and erg_debouncer.pending_power_w is not None
                and erg_debouncer.commit_at > 0
            ):
                erg_change_countdown_s = max(0.0, erg_debouncer.commit_at - now_t)

            broadcast_target_w = v.target_power_w
            broadcast_target_cadence = None
            if broadcast_target_w is None and v.erg_mode:
                broadcast_target_w = v.erg_committed_power_w
            if v.erg_mode:
                broadcast_target_cadence = v.erg_committed_cadence

            _put(broadcast_queue, {
                "type": "telemetry",
                "route_id": active_route_id,
                "ride_session_id": route_ctx.current_ride_session_id,
                "speed_kmh": v.speed_kmh,
                "power_w": v.power_w,
                "cadence_rpm": v.cadence_rpm,
                "gear": v.gear,
                "real_grade_pct": v.real_grade_pct,
                "effective_grade_pct": gear_engine.effective_grade(v.real_grade_pct),
                "position_m": rider_pos if route_loaded else None,
                "route_loaded": route_loaded,
                "ghost_lat": ghost_snap.lat if ghost_snap is not None else None,
                "ghost_lng": ghost_snap.lng if ghost_snap is not None else None,
                "ghost_bearing_deg": ghost_snap.bearing_deg if ghost_snap is not None else None,
                "ghost_time_gap_s": ghost_snap.time_gap_s if ghost_snap is not None else None,
                "ghost_dist_m": ghost_snap.dist_m if ghost_snap is not None else None,
                "ride_phase": v.ride_phase,
                "lap_index": v.lap_index,
                "lap_count": v.lap_count,
                "target_power_w": broadcast_target_w,
                "target_cadence_rpm": broadcast_target_cadence,
                "erg_mode": v.erg_mode,
                "phase_remaining_s": phase_remaining_s,
                "elapsed_s": elapsed_s,
                "dist_remaining_m": dist_remaining_m,
                "erg_change_countdown_s": erg_change_countdown_s,
                "ended_reason": v.ended_reason,
            })
        except Exception:
            _log.exception("Outbound broadcast tick failed")

        await asyncio.sleep(0.25)
