"""Unit tests for engine.ble.client — exercises the queue consumer without real BLE."""
from __future__ import annotations

import asyncio
import struct
from typing import List

import pytest

from engine.ble.client import telemetry_consumer
from engine.ftms.parsers import IndoorBikeData


def _ibd_payload_speed_cadence_power() -> bytes:
    flags = 0x0044  # bit 2 | bit 6; bit 0 CLEAR = speed present
    return (
        struct.pack("<H", flags)
        + struct.pack("<H", 2500)   # speed raw → 25.00 km/h
        + struct.pack("<H", 180)    # cadence raw → 90.0 rpm
        + struct.pack("<h", 250)    # power 250 W signed
    )


@pytest.mark.asyncio
async def test_consumer_parses_and_invokes_sync_handler():
    queue: asyncio.Queue = asyncio.Queue()
    seen: List[IndoorBikeData] = []

    def handler(r: IndoorBikeData) -> None:
        seen.append(r)

    await queue.put(_ibd_payload_speed_cadence_power())
    await queue.put(None)  # shutdown

    await telemetry_consumer(queue, handler)

    assert len(seen) == 1
    assert seen[0].speed_kmh == pytest.approx(25.0)
    assert seen[0].cadence_rpm == pytest.approx(90.0)
    assert seen[0].power_watts == 250


@pytest.mark.asyncio
async def test_consumer_awaits_async_handler():
    queue: asyncio.Queue = asyncio.Queue()
    seen: List[IndoorBikeData] = []

    async def handler(r: IndoorBikeData) -> None:
        await asyncio.sleep(0)
        seen.append(r)

    await queue.put(_ibd_payload_speed_cadence_power())
    await queue.put(None)

    await telemetry_consumer(queue, handler)

    assert len(seen) == 1
    assert seen[0].power_watts == 250


@pytest.mark.asyncio
async def test_consumer_logs_and_continues_on_bad_payload():
    queue: asyncio.Queue = asyncio.Queue()
    seen: List[IndoorBikeData] = []

    def handler(r: IndoorBikeData) -> None:
        seen.append(r)

    # Truncated payload — flags claim power present but no power bytes follow.
    truncated = struct.pack("<H", 0x0040)  # bit 6 set, no power bytes
    await queue.put(truncated)
    # A good payload after the bad one — consumer must keep running.
    await queue.put(_ibd_payload_speed_cadence_power())
    await queue.put(None)

    await telemetry_consumer(queue, handler)

    assert len(seen) == 1
    assert seen[0].power_watts == 250


@pytest.mark.asyncio
async def test_consumer_exits_on_none_sentinel():
    queue: asyncio.Queue = asyncio.Queue()
    calls = 0

    def handler(r: IndoorBikeData) -> None:
        nonlocal calls
        calls += 1

    await queue.put(None)
    await asyncio.wait_for(telemetry_consumer(queue, handler), timeout=1.0)
    assert calls == 0
