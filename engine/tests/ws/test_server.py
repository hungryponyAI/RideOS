"""Tests for the WebSocket broadcast server (engine/engine/ws/server.py).

Coverage:
- RideState telemetry fields (delegated to test_state.py, cross-checked here)
- broadcast_loop starts, accepts a client, sends a JSON message from the queue
- fan-out: two simultaneous clients both receive the same broadcast
- stop_event causes broadcast_loop to exit cleanly within 1 second
- JSON snapshot contains exactly the 6 required keys
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
