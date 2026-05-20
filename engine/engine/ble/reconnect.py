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
from typing import Any, Awaitable, Callable, Optional, Type

from bleak import BleakClient, BleakError
from bleak.backends.device import BLEDevice

from engine.ble.client import (
    start_indoor_bike_notify,
    stop_indoor_bike_notify,
)
from engine.control.athlete import AthleteProfile
from engine.control.controller import FtmsController, run_control_loop
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.projection import RideStateProjection
from engine.gears.engine import GearEngine

_log = logging.getLogger(__name__)

FindDevice = Callable[[], Awaitable[Optional[BLEDevice]]]
ConnectClient = Callable[
    [BLEDevice, Callable[[BleakClient], None]],
    AbstractAsyncContextManager[BleakClient],
]
SleepFn = Callable[[float], Awaitable[None]]
ControllerFactory = Type[FtmsController]
OnClientReady = Callable[[BleakClient, FtmsController], None]


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
    *,
    athlete: Optional[AthleteProfile] = None,
    projection: Optional[RideStateProjection] = None,
    erg_debouncer: Optional[ErgDebouncer] = None,
    gear_engine: Optional[GearEngine] = None,
    controller_factory: ControllerFactory = FtmsController,
    on_client_ready: Optional[OnClientReady] = None,
    on_kickr_state_change: Optional[Callable[[bool], None]] = None,
    diagnostics: Any | None = None,
) -> None:
    """Run the scan/connect/subscribe cycle forever, until stop_event is set.

    If athlete is provided, wires FtmsController + run_control_loop into the
    connect lifecycle. INFRA-02 guarantee: controller.shutdown() is called in a
    try/finally before stop_indoor_bike_notify (Pitfall 6).
    """
    backoff = config.initial_backoff

    while True:
        if stop_event is not None and stop_event.is_set():
            return

        try:
            _diag_increment(diagnostics, "kickr_scan_attempts")
            device = await find_device()
        except (BleakError, OSError) as exc:
            _diag_increment(diagnostics, "ble_errors")
            _diag_increment(diagnostics, "kickr_scan_errors")
            _diag_set(diagnostics, "kickr_last_error", str(exc))
            _log.warning("Scan failed: %s (backoff=%.1fs)", exc, backoff)
            await sleep(backoff)
            backoff = min(backoff * 2, config.max_backoff)
            continue

        if device is None:
            _diag_increment(diagnostics, "kickr_scan_misses")
            if stop_event is not None and stop_event.is_set():
                return
            _log.info("KICKR not found; retrying in %.1fs", backoff)
            await sleep(backoff)
            backoff = min(backoff * 2, config.max_backoff)
            continue

        _diag_increment(diagnostics, "kickr_scan_hits")
        _log.info("Connecting to %s", getattr(device, "name", device))

        disconnected = asyncio.Event()

        def _on_disconnect(_: BleakClient) -> None:
            disconnected.set()
            _diag_set(diagnostics, "kickr_connected", False)
            if on_kickr_state_change is not None:
                on_kickr_state_change(False)

        try:
            _diag_increment(diagnostics, "kickr_connect_attempts")
            async with connect_client(device, _on_disconnect) as client:
                await start_indoor_bike_notify(client, queue)
                _diag_set(diagnostics, "kickr_connected", True)
                if on_kickr_state_change is not None:
                    on_kickr_state_change(True)
                _log.info("Subscribed to FTMS Indoor Bike Data; awaiting data...")

                controller: Optional[FtmsController] = None
                control_task: Optional[asyncio.Task] = None

                if athlete is not None:
                    controller = (
                        controller_factory(client, diagnostics=diagnostics)
                        if diagnostics is not None
                        else controller_factory(client)
                    )
                    await controller.start()

                if on_client_ready is not None:
                    on_client_ready(client, controller)  # type: ignore[arg-type]  # controller may be None when athlete absent

                if controller is not None:
                    assert athlete is not None
                    assert stop_event is not None   # always provided from main.py
                    assert projection is not None and erg_debouncer is not None and gear_engine is not None
                    control_task = asyncio.create_task(
                        run_control_loop(
                            controller, athlete, stop_event,
                            projection=projection,
                            erg_debouncer=erg_debouncer,
                            gear_engine=gear_engine,
                        ),
                        name="ftms_control_loop",
                    )

                # Wait until either stop_event fires or device disconnects.
                stop_wait = asyncio.ensure_future(
                    _event_wait(stop_event)
                ) if stop_event is not None else None
                disc_wait = asyncio.ensure_future(_event_wait(disconnected))

                waiters = {disc_wait}
                if stop_wait is not None:
                    waiters.add(stop_wait)

                await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)

                # Cancel pending waiters
                for w in waiters:
                    if not w.done():
                        w.cancel()
                        try:
                            await w
                        except asyncio.CancelledError:
                            pass

                if control_task is not None:
                    control_task.cancel()
                    try:
                        await control_task
                    except asyncio.CancelledError:
                        pass

                # INFRA-02: shutdown before stopping notifications (Pitfall 6).
                if controller is not None:
                    try:
                        await controller.shutdown()
                    finally:
                        pass  # shutdown() already swallows all exceptions

                _log.info("Disconnected; attempting to stop notifications cleanly")
                try:
                    await stop_indoor_bike_notify(client)
                except (BleakError, OSError):
                    _diag_increment(diagnostics, "ble_errors")
                    _diag_increment(diagnostics, "kickr_notify_stop_errors")
                    pass
                _diag_set(diagnostics, "kickr_connected", False)

        except (BleakError, OSError) as exc:
            _diag_increment(diagnostics, "ble_errors")
            _diag_increment(diagnostics, "kickr_connect_errors")
            _diag_set(diagnostics, "kickr_connected", False)
            _diag_set(diagnostics, "kickr_last_error", str(exc))
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


async def _event_wait(event: Optional[asyncio.Event]) -> None:
    """Await an event.wait(); returns immediately if event is None."""
    if event is not None:
        await event.wait()


def _diag_increment(diagnostics: Any | None, name: str, amount: int = 1) -> None:
    if diagnostics is not None:
        diagnostics.increment(name, amount)


def _diag_set(diagnostics: Any | None, name: str, value: Any) -> None:
    if diagnostics is not None:
        diagnostics.set_gauge(name, value)
