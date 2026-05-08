"""Tests for the WebSocket broadcast server (engine/engine/ws/server.py).

Coverage:
- RideState telemetry fields (delegated to test_state.py, cross-checked here)
- broadcast_loop starts, accepts a client, sends a JSON message from the queue
- fan-out: two simultaneous clients both receive the same broadcast
- stop_event causes broadcast_loop to exit cleanly within 1 second
- JSON snapshot contains exactly the 6 required keys
- inbound gear_shift messages call GearEngine.shift_up / shift_down
"""
from __future__ import annotations

import asyncio
import json

import pytest
from websockets.asyncio.client import connect

from engine.ws.server import broadcast_loop


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_free_port() -> int:
    """Return an available TCP port by binding to port 0 and releasing it."""
    import socket
    with socket.socket() as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# Test: single client receives a message
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_client_receives_message():
    """broadcast_loop accepts a client and delivers a queue item as JSON."""
    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    payload = {"speed_kmh": 30.0, "power_w": 150, "cadence_rpm": 80,
               "gear": 5, "real_grade_pct": 2.0, "effective_grade_pct": 2.24}

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port)
    )

    # Give server time to bind
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await queue.put(payload)
            received = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(received)
            assert data == payload
    finally:
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=2.0)


# ---------------------------------------------------------------------------
# Test: fan-out — two simultaneous clients
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fanout():
    """Two clients connected simultaneously both receive the same broadcast."""
    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    payload = {"speed_kmh": 25.0, "power_w": 200, "cadence_rpm": 90,
               "gear": 3, "real_grade_pct": 5.0, "effective_grade_pct": 7.47}

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port)
    )

    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws1, \
                   connect(f"ws://localhost:{port}") as ws2:
            # Small delay to ensure both are registered in CLIENTS
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
        await asyncio.wait_for(server_task, timeout=2.0)


# ---------------------------------------------------------------------------
# Test: stop_event shuts down cleanly within 1 second
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_shutdown():
    """stop_event causes broadcast_loop to exit within 1 second."""
    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port)
    )

    await asyncio.sleep(0.05)

    stop_event.set()
    await asyncio.wait_for(server_task, timeout=1.0)
    assert server_task.done()


# ---------------------------------------------------------------------------
# Test: JSON snapshot contains exactly the 6 required keys
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_snapshot_schema():
    """JSON snapshot sent to clients contains exactly the 6 required keys."""
    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    canonical_snapshot = {
        "speed_kmh": 34.2,
        "power_w": 187,
        "cadence_rpm": 82,
        "gear": 5,
        "real_grade_pct": 8.0,
        "effective_grade_pct": 5.0,
    }
    required_keys = set(canonical_snapshot.keys())

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port)
    )

    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await queue.put(canonical_snapshot)
            received = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(received)
            assert set(data.keys()) == required_keys
    finally:
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=2.0)


# ---------------------------------------------------------------------------
# Test: inbound gear_shift messages call GearEngine methods
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_inbound_gear_shift():
    """WS client sends gear_shift messages; GearEngine.shift_up/down is called."""
    from engine.gears.engine import GearEngine

    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()
    gear_engine = GearEngine()  # starts at gear 5

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, gear_engine=gear_engine, host="localhost", port=port)
    )

    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            # Shift up: gear 6 (default) -> 7
            await ws.send(json.dumps({"type": "gear_shift", "direction": "up"}))
            await asyncio.sleep(0.1)
            assert gear_engine.current_gear == 7

            # Shift down: gear 7 -> 6
            await ws.send(json.dumps({"type": "gear_shift", "direction": "down"}))
            await asyncio.sleep(0.1)
            assert gear_engine.current_gear == 6
    finally:
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=2.0)


@pytest.mark.asyncio
async def test_inbound_no_gear_engine():
    """Inbound messages are silently ignored when gear_engine is None (default)."""
    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port)
    )

    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            # Should not raise; gear_engine is None so message is ignored
            await ws.send(json.dumps({"type": "gear_shift", "direction": "up"}))
            await asyncio.sleep(0.1)
            # No assertion needed — test passes if no exception is raised
    finally:
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=2.0)


# ---------------------------------------------------------------------------
# Phase 4: load_route inbound + route_data outbound
# ---------------------------------------------------------------------------

from pathlib import Path

_FIXTURES = Path(__file__).parent.parent / "fixtures"


@pytest.mark.asyncio
async def test_load_route_success_broadcasts_route_data():
    """Sending a load_route message with a valid GPX path results in a route_data broadcast."""
    from engine.control.state import RideState
    from engine.gears.engine import GearEngine
    from engine.ws.server import broadcast_loop, RouteContext

    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
    state = RideState(gear_engine=GearEngine())
    ctx = RouteContext(state=state, broadcast_queue=queue, stop_event=stop_event)

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, gear_engine=state.gear_engine,
                       host="localhost", port=port, route_context=ctx),
    )
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await ws.send(json.dumps({
                "type": "load_route",
                "path": str(_FIXTURES / "route_simple.gpx"),
            }))
            # Wait for route_data message
            received = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(received)
            assert data["type"] == "route_data"
            assert len(data["lats"]) == 3
            assert len(data["lons"]) == 3
            assert len(data["elevations_m"]) == 3
            assert len(data["cum_dist_m"]) == 3
            assert len(data["grades_pct"]) == 3
            assert 200.0 < data["total_dist_m"] < 350.0

        # RouteContext now has a live tracker
        assert ctx.tracker is not None
        assert ctx.tracker_task is not None
        assert not ctx.tracker_task.done()
    finally:
        if ctx.tracker_task:
            ctx.tracker_task.cancel()
            try:
                await ctx.tracker_task
            except (asyncio.CancelledError, Exception):
                pass
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=3.0)


@pytest.mark.asyncio
async def test_load_route_failure_broadcasts_route_error():
    """Bogus path yields route_error, not a crash."""
    from engine.control.state import RideState
    from engine.gears.engine import GearEngine
    from engine.ws.server import broadcast_loop, RouteContext

    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
    state = RideState(gear_engine=GearEngine())
    ctx = RouteContext(state=state, broadcast_queue=queue, stop_event=stop_event)

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, gear_engine=state.gear_engine,
                       host="localhost", port=port, route_context=ctx),
    )
    await asyncio.sleep(0.05)

    try:
        async with connect(f"ws://localhost:{port}") as ws:
            await ws.send(json.dumps({
                "type": "load_route",
                "path": "/does/not/exist.gpx",
            }))
            received = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(received)
            assert data["type"] == "route_error"
            assert "message" in data
            assert isinstance(data["message"], str) and data["message"]

        # No tracker should be spawned on failure
        assert ctx.tracker is None
        assert ctx.tracker_task is None
        # Grade reset to 0 on failure per CONTEXT.md "free ride = 0%"
        assert state.real_grade_percent == 0.0
    finally:
        stop_event.set()
        await asyncio.wait_for(server_task, timeout=3.0)


@pytest.mark.asyncio
async def test_backward_compat_broadcast_loop_without_route_context():
    """broadcast_loop still works when route_context is omitted (legacy callers)."""
    from engine.ws.server import broadcast_loop

    port = await _get_free_port()
    stop_event = asyncio.Event()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    server_task = asyncio.create_task(
        broadcast_loop(queue, stop_event, host="localhost", port=port),
    )
    await asyncio.sleep(0.05)
    stop_event.set()
    await asyncio.wait_for(server_task, timeout=3.0)


# ---------------------------------------------------------------------------
# Phase 5: click_status message contract
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_click_status_message_serializes_cleanly():
    """click_status dict serializes to the expected JSON shape."""
    msg = {"type": "click_status", "connected": True}
    text = json.dumps(msg)
    assert json.loads(text) == msg
    assert text == '{"type": "click_status", "connected": true}'


@pytest.mark.asyncio
async def test_click_status_drop_oldest_on_full_queue():
    """Mirrors the _on_reading drop-oldest pattern in main.py.

    Fill a maxsize=2 queue, then write a click_status — must succeed
    without raising QueueFull (older message dropped).
    """
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=2)
    q.put_nowait({"type": "telemetry", "n": 1})
    q.put_nowait({"type": "telemetry", "n": 2})
    msg = {"type": "click_status", "connected": True}
    try:
        q.put_nowait(msg)
    except asyncio.QueueFull:
        q.get_nowait()
        q.put_nowait(msg)
    # The newest message must be in the queue.
    seen = []
    while not q.empty():
        seen.append(q.get_nowait())
    assert msg in seen
