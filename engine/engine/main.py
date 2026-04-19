"""RideOS engine entry point.

Run with:
    cd engine
    uv run python -m engine

Wires the reconnect_loop (owns the BleakClient lifecycle), the
telemetry_consumer (parses IBD bytes and logs human-readable readings),
GearEngine + RideState + KeyboardShifter (virtual gearing), and the
FtmsController 4 Hz grade control loop as concurrent asyncio tasks.
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
from engine.control.state import RideState
from engine.ftms.parsers import IndoorBikeData
from engine.gears.engine import GearEngine
from engine.input.keyboard import KeyboardShifter

_log = logging.getLogger("rideos.engine")

# Edit this constant for bench testing. Phase 4 GPX replaces it with per-tick values.
DEFAULT_GRADE: float = 2.0  # % simulated gradient


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


async def _gear_status_logger(state: RideState, stop_event: asyncio.Event) -> None:
    """Log gear + effective grade every 5 seconds until stop_event fires."""
    while not stop_event.is_set():
        gear = state.gear_engine.current_gear
        factor = state.gear_engine.factor
        real = state.real_grade_percent
        eff = state.gear_engine.effective_grade(real)
        _log.info(
            "RIDE | gear=%d/10 factor=%.3f real=%.1f%% eff=%.1f%%",
            gear, factor, real, eff,
        )
        try:
            await asyncio.wait_for(asyncio.shield(stop_event.wait()), timeout=5.0)
        except asyncio.TimeoutError:
            pass


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

    gear_engine = GearEngine()
    state = RideState(gear_engine=gear_engine, real_grade_percent=DEFAULT_GRADE)

    shifter = KeyboardShifter(gear_engine)
    shifter.start()

    try:
        async def find_device():
            return await find_kickr(timeout=10.0)

        reconnect_task = asyncio.create_task(
            reconnect_loop(
                queue=queue,
                find_device=find_device,
                connect_client=_connect_client,
                config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
                stop_event=stop_event,
                ride_state=state,
            ),
            name="reconnect_loop",
        )

        consumer_task = asyncio.create_task(
            telemetry_consumer(queue, _log_reading),
            name="telemetry_consumer",
        )

        gear_logger_task = asyncio.create_task(
            _gear_status_logger(state, stop_event),
            name="gear_status_logger",
        )

        # Wait for shutdown signal, then drain cleanly.
        await stop_event.wait()
        _log.info("Shutdown requested; stopping tasks")

        # Tell the consumer to exit; let the reconnect loop finish its current await.
        await queue.put(None)

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    reconnect_task, consumer_task, gear_logger_task,
                    return_exceptions=True,
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            _log.warning("Shutdown timed out; cancelling remaining tasks")
            for t in (reconnect_task, consumer_task, gear_logger_task):
                if not t.done():
                    t.cancel()

    finally:
        shifter.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
