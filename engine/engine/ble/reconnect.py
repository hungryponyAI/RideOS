"""BLE reconnect lifecycle for the Wahoo KICKR Core.

Owns the scan → connect → subscribe → wait-for-disconnect cycle as a
standalone asyncio task. Deliberately separate from engine/ble/client.py
so the Phase 2 control loop and Phase 3 WS bridge can read telemetry and
issue writes without managing the lifecycle themselves.

Single-owner rule (RESEARCH.md Pitfall 5):
  reconnect_loop is the SOLE owner of the BleakClient. Other tasks
  must receive a reference to the connected client via shared state
  (set by the subclass/extension in Phase 2), never construct their own.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from bleak import BleakClient, BleakError
from bleak.backends.device import BLEDevice

from engine.ble.client import (
    start_indoor_bike_notify,
    stop_indoor_bike_notify,
)

_log = logging.getLogger(__name__)

FindDevice = Callable[[], Awaitable[Optional[BLEDevice]]]
ConnectClient = Callable[
    [BLEDevice, Callable[[BleakClient], None]],
    AbstractAsyncContextManager[BleakClient],
]
SleepFn = Callable[[float], Awaitable[None]]


@dataclass(frozen=True)
class ReconnectConfig:
    initial_backoff: float = 1.0
    max_backoff: float = 60.0


async def reconnect_loop(
    queue: "asyncio.Queue[Optional[bytes]]",
    find_device: FindDevice,
    connect_client: ConnectClient,
    config: ReconnectConfig = ReconnectConfig(),
    sleep: SleepFn = asyncio.sleep,
    stop_event: Optional[asyncio.Event] = None,
) -> None:
    """Run the scan/connect/subscribe cycle forever, until stop_event is set."""
    backoff = config.initial_backoff

    while True:
        if stop_event is not None and stop_event.is_set():
            return

        try:
            device = await find_device()
        except (BleakError, OSError) as exc:
            _log.warning("Scan failed: %s (backoff=%.1fs)", exc, backoff)
            await sleep(backoff)
            backoff = min(backoff * 2, config.max_backoff)
            continue

        if device is None:
            if stop_event is not None and stop_event.is_set():
                return
            _log.info("KICKR not found; retrying in %.1fs", backoff)
            await sleep(backoff)
            backoff = min(backoff * 2, config.max_backoff)
            continue

        _log.info("Connecting to %s", getattr(device, "name", device))

        disconnected = asyncio.Event()

        def _on_disconnect(_: BleakClient) -> None:
            disconnected.set()

        try:
            async with connect_client(device, _on_disconnect) as client:
                await start_indoor_bike_notify(client, queue)
                _log.info("Subscribed to FTMS Indoor Bike Data; awaiting data...")
                await disconnected.wait()
                _log.info("Disconnected; attempting to stop notifications cleanly")
                try:
                    await stop_indoor_bike_notify(client)
                except (BleakError, OSError):
                    pass
        except (BleakError, OSError) as exc:
            _log.warning(
                "BLE error during connect/notify: %s (backoff=%.1fs)",
                exc, backoff,
            )
            await sleep(backoff)
            backoff = min(backoff * 2, config.max_backoff)
            continue

        # Successful connect/subscribe/disconnect cycle — reset backoff.
        backoff = config.initial_backoff
        _log.info("Reconnect cycle complete; rescanning")
