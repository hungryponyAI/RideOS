"""RideOS engine entry point.

Run with:
    cd engine
    uv run python -m engine

Wires the reconnect_loop (owns the BleakClient lifecycle) and the
telemetry_consumer (parses IBD bytes and logs human-readable readings)
as two concurrent asyncio tasks.
"""
from __future__ import annotations

import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from typing import Optional

from bleak import BleakClient
from bleak.backends.device import BLEDevice

from engine.ble.client import telemetry_consumer
from engine.ble.reconnect import ReconnectConfig, reconnect_loop
from engine.ble.scanner import find_kickr
from engine.ftms.parsers import IndoorBikeData

_log = logging.getLogger("rideos.engine")


@asynccontextmanager
async def _connect_client(device: BLEDevice, on_disconnect):
    """Production connect_client: async-with BleakClient per RESEARCH.md Pitfall 4."""
    async with BleakClient(
        device, disconnected_callback=on_disconnect
    ) as client:
        yield client


def _log_reading(reading: IndoorBikeData) -> None:
    speed = f"{reading.speed_kmh:5.1f} km/h" if reading.speed_kmh is not None else "  --  km/h"
    power = f"{reading.power_watts:4d} W" if reading.power_watts is not None else "  -- W"
    cadence = (
        f"{reading.cadence_rpm:5.1f} rpm"
        if reading.cadence_rpm is not None
        else "  --  rpm"
    )
    _log.info("TELEMETRY | speed=%s  power=%s  cadence=%s", speed, power, cadence)


async def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Signal handlers are not available on all platforms / loops.
            pass

    async def find_device():
        return await find_kickr(timeout=10.0)

    reconnect_task = asyncio.create_task(
        reconnect_loop(
            queue=queue,
            find_device=find_device,
            connect_client=_connect_client,
            config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
            stop_event=stop_event,
        ),
        name="reconnect_loop",
    )

    consumer_task = asyncio.create_task(
        telemetry_consumer(queue, _log_reading),
        name="telemetry_consumer",
    )

    # Wait for shutdown signal, then drain cleanly.
    await stop_event.wait()
    _log.info("Shutdown requested; stopping tasks")

    # Tell the consumer to exit; let the reconnect loop finish its current await.
    await queue.put(None)

    try:
        await asyncio.wait_for(
            asyncio.gather(reconnect_task, consumer_task, return_exceptions=True),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        _log.warning("Shutdown timed out; cancelling remaining tasks")
        for t in (reconnect_task, consumer_task):
            if not t.done():
                t.cancel()

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
