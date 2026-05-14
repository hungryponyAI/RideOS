"""Integration tests for transport/ws/server.py — WS lifecycle via broadcast_loop."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from websockets.asyncio.client import connect

from engine.transport.ws.server import RouteContext, broadcast_loop


async def _free_port() -> int:
    import socket
    with socket.socket() as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# Server lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_client_receives_message():
    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    payload = {"type": "telemetry", "speed_kmh": 30.0, "power_w": 150}

    task = asyncio.create_task(broadcast_loop(queue, stop_event, host="localhost", port=port))
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await queue.put(payload)
            received = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            assert received == payload
    finally:
        stop_event.set()
        await asyncio.wait_for(task, timeout=2.0)


@pytest.mark.asyncio
async def test_fanout_two_clients():
    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    payload = {"type": "telemetry", "power_w": 200}

    task = asyncio.create_task(broadcast_loop(queue, stop_event, host="localhost", port=port))
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws1, \
                   connect(f"ws://localhost:{port}") as ws2:
            await asyncio.sleep(0.05)
            await queue.put(payload)
            msg1, msg2 = await asyncio.gather(
                asyncio.wait_for(ws1.recv(), timeout=5.0),
                asyncio.wait_for(ws2.recv(), timeout=5.0),
            )
            assert json.loads(msg1) == payload
            assert json.loads(msg2) == payload
    finally:
        stop_event.set()
        await asyncio.wait_for(task, timeout=2.0)


@pytest.mark.asyncio
async def test_shutdown_on_stop_event():
    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    task = asyncio.create_task(broadcast_loop(queue, stop_event, host="localhost", port=port))
    await asyncio.sleep(0.05)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)
    assert task.done()


@pytest.mark.asyncio
async def test_no_route_context_accepted():
    """broadcast_loop works when route_context is omitted."""
    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    task = asyncio.create_task(broadcast_loop(queue, stop_event, host="localhost", port=port))
    await asyncio.sleep(0.05)
    stop_event.set()
    await asyncio.wait_for(task, timeout=3.0)


# ---------------------------------------------------------------------------
# Inbound dispatch via server (gear_shift end-to-end)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gear_shift_via_server():
    """WS client sends gear_shift → RideService.shift is invoked."""
    from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
    from engine.application.ride_service import RideService
    from engine.control.athlete import AthleteProfile
    from engine.control.erg_debouncer import ErgDebouncer
    from engine.domain.projection import RideStateProjection
    from engine.gears.engine import GearEngine

    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    gear_engine = GearEngine()
    bus = AsyncioEventBus()
    projection = RideStateProjection()
    ride_service = RideService(AthleteProfile(), gear_engine, bus, ErgDebouncer(bus), projection)
    ctx = RouteContext(broadcast_queue=queue, stop_event=stop_event, ride_service=ride_service)

    task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port, route_context=ctx)
    )
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await ws.send(json.dumps({"type": "gear_shift", "direction": "up"}))
            await asyncio.sleep(0.1)
            assert gear_engine.current_gear == 7

            await ws.send(json.dumps({"type": "gear_shift", "direction": "down"}))
            await asyncio.sleep(0.1)
            assert gear_engine.current_gear == 6
    finally:
        stop_event.set()
        await asyncio.wait_for(task, timeout=2.0)


@pytest.mark.asyncio
async def test_load_route_success_broadcasts_route_data():
    """load_route with a valid GPX path results in a route_data broadcast."""
    from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
    from engine.application.route_service import RouteService
    from engine.gears.engine import GearEngine

    _FIXTURES = Path(__file__).parent.parent.parent / "fixtures"

    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
    ctx = RouteContext(
        broadcast_queue=queue,
        stop_event=stop_event,
        route_service=RouteService(AsyncioEventBus()),
    )

    task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port, route_context=ctx)
    )
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await ws.send(json.dumps({
                "type": "load_route",
                "path": str(_FIXTURES / "route_simple.gpx"),
            }))
            received = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            assert received["type"] == "route_data"
            assert len(received["lats"]) == 3

        assert ctx.tracker is not None
    finally:
        if ctx.tracker_task:
            ctx.tracker_task.cancel()
            try:
                await ctx.tracker_task
            except (asyncio.CancelledError, Exception):
                pass
        stop_event.set()
        await asyncio.wait_for(task, timeout=3.0)


@pytest.mark.asyncio
async def test_load_route_bad_path_broadcasts_route_error():
    """Bogus GPX path yields route_error, not a crash."""
    from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
    from engine.application.route_service import RouteService

    port = await _free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
    ctx = RouteContext(
        broadcast_queue=queue,
        stop_event=stop_event,
        route_service=RouteService(AsyncioEventBus()),
    )

    task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port, route_context=ctx)
    )
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await ws.send(json.dumps({"type": "load_route", "path": "/does/not/exist.gpx"}))
            received = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
            assert received["type"] == "route_error"
            assert isinstance(received["message"], str) and received["message"]
    finally:
        stop_event.set()
        await asyncio.wait_for(task, timeout=3.0)
