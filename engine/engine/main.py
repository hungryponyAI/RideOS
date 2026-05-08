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
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from bleak import BleakClient
from bleak.backends.device import BLEDevice

from engine.ble.client import telemetry_consumer
from engine.ble.reconnect import ReconnectConfig, reconnect_loop
from engine.ble.scanner import find_kickr
from engine.control.state import RideState
from engine.ftms.parsers import IndoorBikeData
from engine.gears.engine import GearEngine
from engine.input.click import run_click_shifter
from engine.input.keyboard import KeyboardShifter
from engine.route.library import RouteLibrary
from engine.strava.auth import StravaAuth
from engine.strava.importer import StravaImporter
from engine.ws.server import broadcast_loop, RouteContext

_log = logging.getLogger("rideos.engine")

# Phase 4: "Free ride" baseline — no GPX loaded means flat road (0%).
# RouteTracker overwrites state.real_grade_percent on every tick once a route is active.
DEFAULT_GRADE: float = 0.0  # % simulated gradient (no route = flat)


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
    broadcast_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Signal handlers are not available on all platforms / loops.
            pass

    gear_engine = GearEngine()
    state = RideState(gear_engine=gear_engine, real_grade_percent=DEFAULT_GRADE)

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

    route_ctx = RouteContext(
        state=state,
        broadcast_queue=broadcast_queue,
        stop_event=stop_event,
        library=library,
        strava_auth=strava_auth,
        strava_importer=strava_importer,
        streams_dir=_ROUTES_DIR / "streams",
    )

    shifter = KeyboardShifter(gear_engine)
    shifter.start()

    try:
        def _on_kickr_state_change(connected: bool) -> None:
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
            """Update RideState sensor fields from BLE notification."""
            state.last_speed_kmh = reading.speed_kmh
            state.last_power_w = reading.power_watts
            state.last_cadence_rpm = reading.cadence_rpm
            _log_reading(reading)

        async def _state_broadcast_loop() -> None:
            """Broadcast telemetry at 4 Hz, independent of KICKR connection."""
            while not stop_event.is_set():
                try:
                    now_t = time.monotonic()
                    rider_pos = route_ctx.tracker.position_m if route_ctx.tracker is not None else 0.0

                    ghost_snap = None
                    if route_ctx.ghost_tracker is not None:
                        route_ctx.ghost_tracker.tick(state.paused)
                        ghost_snap = route_ctx.ghost_tracker.snapshot(rider_pos, state.lap_index)

                    phase_remaining_s = None
                    if state.phase_end_monotonic is not None:
                        phase_remaining_s = max(0, int(state.phase_end_monotonic - now_t))

                    elapsed_s = None
                    if state.ride_start_monotonic is not None:
                        elapsed_s = int(now_t - state.ride_start_monotonic)

                    dist_remaining_m = None
                    if route_ctx.tracker is not None and route_ctx.current_route is not None:
                        dist_remaining_m = max(0.0, route_ctx.current_route.total_dist_m - rider_pos)

                    erg_change_countdown_s = None
                    if state.erg_mode and state.erg_pending_power_w is not None and state.erg_commit_at_monotonic > 0:
                        erg_change_countdown_s = max(0.0, state.erg_commit_at_monotonic - now_t)

                    broadcast_target_w = state.target_power_w
                    broadcast_target_cadence = None
                    if broadcast_target_w is None and state.erg_mode:
                        broadcast_target_w = state.erg_committed_power_w
                    if state.erg_mode:
                        broadcast_target_cadence = state.erg_committed_cadence

                    snapshot = {
                        "type": "telemetry",
                        "speed_kmh": state.last_speed_kmh,
                        "power_w": state.last_power_w,
                        "cadence_rpm": state.last_cadence_rpm,
                        "gear": state.gear_engine.current_gear,
                        "real_grade_pct": state.real_grade_percent,
                        "effective_grade_pct": state.gear_engine.effective_grade(state.real_grade_percent),
                        "position_m": rider_pos if route_ctx.tracker is not None else None,
                        "route_loaded": route_ctx.tracker is not None,
                        "ghost_lat": ghost_snap.lat if ghost_snap is not None else None,
                        "ghost_lng": ghost_snap.lng if ghost_snap is not None else None,
                        "ghost_bearing_deg": ghost_snap.bearing_deg if ghost_snap is not None else None,
                        "ghost_time_gap_s": ghost_snap.time_gap_s if ghost_snap is not None else None,
                        "ride_phase": state.ride_phase,
                        "lap_index": state.lap_index,
                        "lap_count": state.lap_count,
                        "target_power_w": broadcast_target_w,
                        "target_cadence_rpm": broadcast_target_cadence,
                        "erg_mode": state.erg_mode,
                        "phase_remaining_s": phase_remaining_s,
                        "elapsed_s": elapsed_s,
                        "dist_remaining_m": dist_remaining_m,
                        "erg_change_countdown_s": erg_change_countdown_s,
                    }
                    try:
                        broadcast_queue.put_nowait(snapshot)
                    except asyncio.QueueFull:
                        try:
                            broadcast_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                        broadcast_queue.put_nowait(snapshot)
                except Exception:
                    _log.exception("State broadcast tick failed")

                await asyncio.sleep(0.25)

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
                on_kickr_state_change=_on_kickr_state_change,
            ),
            name="reconnect_loop",
        )

        consumer_task = asyncio.create_task(
            telemetry_consumer(queue, _on_reading),
            name="telemetry_consumer",
        )

        broadcast_task = asyncio.create_task(
            _state_broadcast_loop(),
            name="state_broadcast",
        )

        gear_logger_task = asyncio.create_task(
            _gear_status_logger(state, stop_event),
            name="gear_status_logger",
        )

        ws_task = asyncio.create_task(
            broadcast_loop(
                broadcast_queue,
                stop_event,
                gear_engine=gear_engine,
                route_context=route_ctx,
            ),
            name="ws_broadcast",
        )

        click_task = asyncio.create_task(
            run_click_shifter(
                gear_engine,
                stop_event,
                on_state_change=_on_click_state_change,
            ),
            name="click_shifter",
        )
        _log.debug("click_task spawned — scanning for Zwift Click in background")

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
        await queue.put(None)

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    reconnect_task, consumer_task, broadcast_task,
                    gear_logger_task, ws_task, click_task,
                    return_exceptions=True,
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            _log.warning("Shutdown timed out; cancelling remaining tasks")
            for t in (reconnect_task, consumer_task, broadcast_task,
                      gear_logger_task, ws_task, click_task):
                if not t.done():
                    t.cancel()

    finally:
        shifter.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
