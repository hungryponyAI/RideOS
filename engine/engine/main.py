"""RideOS engine entry point.

Run with:
    cd engine
    uv run python -m engine

Wires the reconnect_loop (owns the BleakClient lifecycle), the
telemetry_consumer (parses IBD bytes and logs human-readable readings),
GearEngine + AthleteProfile + KeyboardShifter (virtual gearing), and the
FtmsController 4 Hz grade control loop as concurrent asyncio tasks.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from bleak import BleakClient
from bleak.backends.device import BLEDevice

from engine.adapters.ble.click_shifter import ClickShifterAdapter
from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.adapters.input.keyboard_shifter import KeyboardShifterAdapter
from engine.adapters.persistence.event_logger import InMemoryEventLog
from engine.adapters.persistence.ride_repo_sink import RideRepoSink
from engine.adapters.persistence.sqlite.connection import get_connection
from engine.adapters.persistence.sqlite.ride_repo import SqliteRideRepo
from engine.application.auto_shift import AutoShiftController
from engine.application.diagnostics import EngineDiagnostics
from engine.application.replay import ReplayConfig, run_ble_scan_stress, run_replay_telemetry
from engine.application.ride_service import RideService
from engine.application.route_service import RouteService
from engine.application.strava_service import StravaService
from engine.application.wake_lock import MacOSWakeLock
from engine.ble.client import telemetry_consumer
from engine.ble.reconnect import ReconnectConfig, reconnect_loop
from engine.ble.scanner import find_kickr
from engine.config.logging import configure_logging
from engine.control.athlete import AthleteProfile
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.events import (
    ErgTargetCommitted,
    GearShifted,
    PositionAdvanced,
    RideEnded,
    RidePauseToggled,
    RidePhaseChanged,
    RideStarted,
    RouteLoaded,
    TelemetryReading,
)
from engine.domain.projection import RideStateProjection
from engine.ftms.parsers import IndoorBikeData
from engine.gears.engine import GearEngine
from engine.route.library import RouteLibrary
from engine.strava.auth import StravaAuth
from engine.strava.importer import StravaImporter
from engine.transport.ws.outbound import run_outbound_loop
from engine.transport.ws.server import RouteContext, broadcast_loop

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


async def _gear_status_logger(
    gear_engine: GearEngine,
    projection: RideStateProjection,
    stop_event: asyncio.Event,
) -> None:
    """Log gear + effective grade every 5 seconds until stop_event fires."""
    while not stop_event.is_set():
        gear = gear_engine.current_gear
        factor = gear_engine.factor
        real = projection.view.real_grade_pct
        eff = gear_engine.effective_grade(real)
        _log.info(
            "RIDE | gear=%d/%d factor=%.3f real=%.1f%% eff=%.1f%%",
            gear, len(gear_engine.factors), factor, real, eff,
        )
        try:
            await asyncio.wait_for(asyncio.shield(stop_event.wait()), timeout=5.0)
        except asyncio.TimeoutError:
            pass


async def main() -> int:
    configure_logging(level=os.getenv("LOG_LEVEL", "INFO"), json=os.getenv("LOG_JSON", "") == "1")

    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
    stop_event = asyncio.Event()
    broadcast_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
    replay_config = ReplayConfig.from_env()
    stress_ble_scan = os.getenv("RIDEOS_STRESS_BLE_SCAN", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Signal handlers are not available on all platforms / loops.
            pass

    gear_engine = GearEngine()
    athlete = AthleteProfile()

    bus = AsyncioEventBus()
    projection = RideStateProjection()
    _all_event_types = (
        TelemetryReading,
        GearShifted,
        PositionAdvanced,
        RidePhaseChanged,
        ErgTargetCommitted,
        RideStarted,
        RideEnded,
        RouteLoaded,
        RidePauseToggled,
    )
    for event_type in _all_event_types:
        bus.subscribe(event_type, projection.apply)

    if os.getenv("RIDEOS_EVENT_LOG"):
        event_log = InMemoryEventLog()
        for event_type in _all_event_types:
            bus.subscribe(event_type, event_log.record)
        _log.info("Event log enabled (in-memory)")

    _DB_PATH = Path(os.getenv("RIDEOS_DB_PATH", str(Path(__file__).parent.parent / "data" / "rideos.db")))
    _db_conn = get_connection(_DB_PATH)
    _ride_repo = SqliteRideRepo(_db_conn)
    _ride_repo_sink = RideRepoSink(_ride_repo)
    for event_type in _all_event_types:
        bus.subscribe(event_type, _ride_repo_sink.on_event)
    _log.info("Ride event log enabled (SQLite: %s)", _DB_PATH)
    _DIAG_PATH = Path(os.getenv("RIDEOS_ENGINE_DIAG_PATH", str(_DB_PATH.parent / "last_engine_diag.json")))

    _ROUTES_DIR = Path(__file__).parent.parent / "routes"
    _CONFIG_DIR = Path(__file__).parent.parent / "config"
    library = RouteLibrary(_ROUTES_DIR)

    strava_auth = StravaAuth(
        config_path=_CONFIG_DIR / "strava.json",
        tokens_path=_ROUTES_DIR / "strava_tokens.json",
    )
    strava_importer = StravaImporter(
        library=library,
        streams_dir=_ROUTES_DIR / "streams",
    )

    erg_debouncer = ErgDebouncer(bus)
    ride_service = RideService(
        athlete,
        gear_engine,
        bus,
        erg_debouncer,
        projection,
        wake_lock=MacOSWakeLock(),
    )
    route_service = RouteService(bus)
    strava_service = StravaService(bus)

    auto_shift_controller = AutoShiftController(
        ride_service=ride_service,
        projection=projection,
        gear_engine=gear_engine,
    )

    route_ctx = RouteContext(
        broadcast_queue=broadcast_queue,
        stop_event=stop_event,
        library=library,
        strava_auth=strava_auth,
        strava_importer=strava_importer,
        streams_dir=_ROUTES_DIR / "streams",
        ride_service=ride_service,
        route_service=route_service,
        strava_service=strava_service,
        projection=projection,
        ride_repo=_ride_repo,
        auto_shift_controller=auto_shift_controller,
        time_scale=replay_config.time_scale if replay_config.enabled else 1.0,
    )

    diagnostics = EngineDiagnostics(
        route_ctx=route_ctx,
        projection=projection,
        broadcast_queue=broadcast_queue,
        ride_repo_sink=_ride_repo_sink,
        output_path=_DIAG_PATH,
    )
    for event_type in _all_event_types:
        bus.subscribe(event_type, diagnostics.on_event)
    diagnostics.set_gauge("kickr_connected", False)
    diagnostics.set_gauge("click_connected", False)

    shifter_adapter = KeyboardShifterAdapter(gear_engine, bus)

    def _on_kickr_state_change(connected: bool) -> None:
        diagnostics.set_gauge("kickr_connected", connected)
        msg = {"type": "kickr_status", "connected": connected}
        try:
            broadcast_queue.put_nowait(msg)
        except asyncio.QueueFull:
            try:
                broadcast_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            broadcast_queue.put_nowait(msg)
        _log.info("KICKR %s", "connected" if connected else "disconnected")

    def _on_click_state_change(connected: bool) -> None:
        """Push click_status onto the WS broadcast queue so cockpit shows indicator.

        Mirrors _on_reading drop-oldest pattern (RESEARCH.md Pattern 1, INFRA-01).
        Plain def — no await allowed; runs on the asyncio event loop thread.
        """
        diagnostics.set_gauge("click_connected", connected)
        msg = {"type": "click_status", "connected": connected}
        try:
            broadcast_queue.put_nowait(msg)
        except asyncio.QueueFull:
            try:
                broadcast_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            broadcast_queue.put_nowait(msg)
        _log.info("Zwift Click %s", "connected" if connected else "disconnected")

    def _on_reading(reading: IndoorBikeData) -> None:
        bus.publish(TelemetryReading(
            speed_kmh=reading.speed_kmh,
            power_w=reading.power_watts,
            cadence_rpm=reading.cadence_rpm,
            t_mono=time.monotonic(),
        ))
        _log_reading(reading)

    async def find_device():
        return await find_kickr(timeout=10.0)

    managed_tasks: list[asyncio.Task] = []
    if replay_config.enabled:
        replay_task = asyncio.create_task(
            run_replay_telemetry(
                stop_event,
                _on_reading,
                config=replay_config,
                on_state_change=_on_kickr_state_change,
            ),
            name="replay_telemetry",
        )
        managed_tasks.append(replay_task)
        _log.info("Replay mode active; BLE KICKR connection is disabled")
        if stress_ble_scan:
            ble_scan_stress_task = asyncio.create_task(
                run_ble_scan_stress(
                    stop_event,
                    find_device,
                    diagnostics=diagnostics,
                ),
                name="ble_scan_stress",
            )
            managed_tasks.append(ble_scan_stress_task)
    else:
        reconnect_task = asyncio.create_task(
            reconnect_loop(
                queue=queue,
                find_device=find_device,
                connect_client=_connect_client,
                config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
                stop_event=stop_event,
                athlete=athlete,
                projection=projection,
                erg_debouncer=erg_debouncer,
                gear_engine=gear_engine,
                on_kickr_state_change=_on_kickr_state_change,
                diagnostics=diagnostics,
            ),
            name="reconnect_loop",
        )
        consumer_task = asyncio.create_task(
            telemetry_consumer(queue, _on_reading),
            name="telemetry_consumer",
        )
        managed_tasks.extend([reconnect_task, consumer_task])

    broadcast_task = asyncio.create_task(
        run_outbound_loop(broadcast_queue, stop_event, projection, route_ctx, erg_debouncer, gear_engine),
        name="state_broadcast",
    )
    managed_tasks.append(broadcast_task)

    gear_logger_task = asyncio.create_task(
        _gear_status_logger(gear_engine, projection, stop_event),
        name="gear_status_logger",
    )
    managed_tasks.append(gear_logger_task)

    ws_task = asyncio.create_task(
        broadcast_loop(
            broadcast_queue,
            stop_event,
            gear_engine=gear_engine,
            route_context=route_ctx,
        ),
        name="ws_broadcast",
    )
    managed_tasks.append(ws_task)

    if replay_config.enabled and not stress_ble_scan:
        _on_click_state_change(False)
        _log.info("Replay mode active; Zwift Click scanning is disabled")
    else:
        click_adapter = ClickShifterAdapter(
            gear_engine, bus, on_state_change=_on_click_state_change, diagnostics=diagnostics,
        )
        click_task = asyncio.create_task(
            click_adapter.run(stop_event),
            name="click_shifter",
        )
        managed_tasks.append(click_task)
        if replay_config.enabled:
            _log.info("Replay mode active; Zwift Click scanning enabled by RIDEOS_STRESS_BLE_SCAN")
        else:
            _log.debug("click_task spawned — scanning for Zwift Click in background")

    keyboard_task = asyncio.create_task(
        shifter_adapter.run(stop_event),
        name="keyboard_shifter",
    )
    managed_tasks.append(keyboard_task)

    auto_shift_task = asyncio.create_task(
        auto_shift_controller.run(stop_event),
        name="auto_shift",
    )
    managed_tasks.append(auto_shift_task)

    diagnostics_task = asyncio.create_task(
        diagnostics.run(stop_event),
        name="engine_diagnostics",
    )
    managed_tasks.append(diagnostics_task)
    diagnostics.set_tasks(managed_tasks)

    # Wait for shutdown signal, then drain cleanly.
    await stop_event.wait()
    _log.info("Shutdown requested; stopping tasks")

    # Cancel phase_task (start_ride path) or tracker_task (legacy upload path).
    for _task in (route_ctx.phase_task, route_ctx.tracker_task):
        if _task is not None and not _task.done():
            _task.cancel()
            try:
                await asyncio.wait_for(_task, timeout=1.0)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass

    # Tell the consumer to exit; let the reconnect loop finish its current await.
    if not replay_config.enabled:
        await queue.put(None)

    try:
        await asyncio.wait_for(
            asyncio.gather(
                *managed_tasks,
                return_exceptions=True,
            ),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        _log.warning("Shutdown timed out; cancelling remaining tasks")
        for t in managed_tasks:
            if not t.done():
                t.cancel()

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
