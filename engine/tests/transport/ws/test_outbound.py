from __future__ import annotations

import asyncio

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.events import PositionAdvanced, RideStarted
from engine.domain.projection import RideStateProjection
from engine.domain.route import RouteData
from engine.gears.engine import GearEngine
from engine.transport.ws.outbound import run_outbound_loop
from engine.transport.ws.server import RouteContext


@pytest.mark.asyncio
async def test_outbound_uses_route_start_when_projection_is_from_previous_route():
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=4)
    stop_event = asyncio.Event()
    projection = RideStateProjection()
    projection.apply(RideStarted(
        route_id="old-route",
        laps=1,
        warmup_s=0,
        cooldown_s=0,
        erg_mode=False,
        t_mono=1.0,
    ))
    projection.apply(PositionAdvanced(
        position_m=750.0,
        grade_idx=0,
        grade_pct=0.0,
        lap_index=0,
        t_mono=2.0,
    ))
    route = RouteData(
        lats=(47.0, 47.01),
        lons=(11.0, 11.01),
        elevations_m=(500.0, 510.0),
        cum_dist_m=(0.0, 1000.0),
        grades_pct=(1.0, 1.0),
        total_dist_m=1000.0,
    )
    ctx = RouteContext(
        broadcast_queue=queue,
        stop_event=stop_event,
        current_route_id="new-route",
        current_ride_session_id="new-session",
        current_route=route,
    )

    task = asyncio.create_task(run_outbound_loop(
        queue,
        stop_event,
        projection,
        ctx,
        ErgDebouncer(AsyncioEventBus()),
        GearEngine(),
    ))
    try:
        msg = await asyncio.wait_for(queue.get(), timeout=1.0)
    finally:
        stop_event.set()
        await asyncio.wait_for(task, timeout=1.0)

    assert msg["type"] == "telemetry"
    assert msg["route_id"] == "new-route"
    assert msg["ride_session_id"] == "new-session"
    assert msg["position_m"] == 0.0
    assert msg["dist_remaining_m"] == 1000.0
