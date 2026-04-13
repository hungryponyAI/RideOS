"""BLE notification wiring for FTMS Indoor Bike Data.

Callback safety (RESEARCH.md Pattern 1 + Pitfall 3):
  BLE notification callbacks run in the asyncio event loop thread but
  MUST NOT await. Awaiting inside a CoreBluetooth callback deadlocks the
  entire event loop. We push raw bytes into an asyncio.Queue and parse
  in a separate consumer coroutine.
"""
from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Awaitable, Callable, Optional, Union

from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

from engine.ftms.parsers import IndoorBikeData, parse_indoor_bike_data

INDOOR_BIKE_DATA_UUID: str = "00002ad2-0000-1000-8000-00805f9b34fb"

_log = logging.getLogger(__name__)

ReadingHandler = Callable[[IndoorBikeData], Union[Awaitable[None], None]]


async def start_indoor_bike_notify(
    client: BleakClient,
    queue: "asyncio.Queue[Optional[bytes]]",
) -> None:
    """Subscribe to Indoor Bike Data notifications; payloads land in the queue.

    The callback is intentionally a plain sync function — DO NOT change
    to async def or add await expressions.
    """

    def _on_notify(_: BleakGATTCharacteristic, data: bytearray) -> None:
        # put_nowait is mandatory: awaiting inside the callback deadlocks
        # the macOS CoreBluetooth event loop.
        queue.put_nowait(bytes(data))

    await client.start_notify(INDOOR_BIKE_DATA_UUID, _on_notify)


async def stop_indoor_bike_notify(client: BleakClient) -> None:
    """Unsubscribe from Indoor Bike Data notifications."""
    await client.stop_notify(INDOOR_BIKE_DATA_UUID)


async def telemetry_consumer(
    queue: "asyncio.Queue[Optional[bytes]]",
    on_reading: ReadingHandler,
) -> None:
    """Drain the telemetry queue, parse each payload, invoke on_reading.

    Shutdown: put None into the queue to stop the consumer cleanly.
    """
    while True:
        payload = await queue.get()
        if payload is None:
            return
        try:
            reading = parse_indoor_bike_data(payload)
        except Exception:  # noqa: BLE001 — log-and-skip malformed payloads
            _log.exception("Failed to parse IBD payload (%d bytes)", len(payload))
            continue

        result = on_reading(reading)
        if inspect.isawaitable(result):
            await result
