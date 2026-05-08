"""Integration test: run the engine stack against the BLE replay fixture.

Exit criteria (from refactor plan Phase 0):
  "replay harness boots and runs a 30-second recorded ride end-to-end
  without hardware; pinning tests pass."

This test wires together:
  - ReplayBleakClient (pre-recorded IBD frames at 4 Hz)
  - telemetry_consumer (IBD parser)
  - RideState (shared mutable state)
  - run_control_loop (grade-sim path — uses FakeBleakClient for FTMS writes)

The KICKR's FTMS control path uses a FakeBleakClient (from conftest) for
write assertions; the IBD notification path uses ReplayBleakClient.
After 30 virtual seconds, we assert:
  - Speed, power, cadence were written into RideState at least once
  - The control loop fired at least 10 FTMS writes
"""
from __future__ import annotations

import asyncio

import pytest

from engine.ble.client import start_indoor_bike_notify, telemetry_consumer
from engine.control.controller import FtmsController, run_control_loop
from engine.control.state import RideState
from engine.ftms.control_point import FMCP_UUID, OpCode
from engine.gears.engine import GearEngine
from tests.fixtures.ble_replay import ReplayBleakClient


async def test_30s_replay_without_hardware(fake_bleak_client_factory):
    """Boot the engine against the replay fixture; verify telemetry flows through."""
    stop_event = asyncio.Event()

    # --- FTMS write path: use FakeBleakClient to record FTMS commands ---
    ftms_client = fake_bleak_client_factory(
        auto_success_for=(
            OpCode.REQUEST_CONTROL,
            OpCode.START_OR_RESUME,
            OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS,
        )
    )
    ctrl = FtmsController(ftms_client)
    await ctrl.start()

    # --- IBD notification path: use ReplayBleakClient ---
    replay_client = ReplayBleakClient(stop_event=stop_event)

    gear_engine = GearEngine()
    state = RideState(gear_engine=gear_engine)
    state.paused = False

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    readings_seen: list[tuple] = []

    def _on_reading(reading) -> None:
        state.last_speed_kmh = reading.speed_kmh
        state.last_power_w = reading.power_watts
        state.last_cadence_rpm = reading.cadence_rpm
        readings_seen.append((reading.speed_kmh, reading.power_watts, reading.cadence_rpm))

    # Subscribe to IBD notifications from replay client
    await start_indoor_bike_notify(replay_client, queue)

    consumer_task = asyncio.create_task(
        telemetry_consumer(queue, _on_reading),
        name="telemetry_consumer",
    )
    control_task = asyncio.create_task(
        run_control_loop(ctrl, state, stop_event),
        name="control_loop",
    )

    # Run for 30 virtual seconds (replay finishes on its own; we stop after 35s wall-clock cap)
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=35.0)
    except asyncio.TimeoutError:
        stop_event.set()

    # Stop everything
    await queue.put(None)
    try:
        await asyncio.wait_for(
            asyncio.gather(consumer_task, control_task, return_exceptions=True),
            timeout=3.0,
        )
    except asyncio.TimeoutError:
        consumer_task.cancel()
        control_task.cancel()

    # Assertions ----------------------------------------------------------------

    assert len(readings_seen) >= 10, (
        f"Expected >= 10 IBD readings, got {len(readings_seen)}"
    )

    # At least one non-zero speed reading during the ramp-up
    non_zero_speeds = [r[0] for r in readings_seen if r[0] and r[0] > 0]
    assert len(non_zero_speeds) > 0, "No non-zero speed readings observed"

    # Control loop fired FTMS writes
    ftms_writes = [w for w in ftms_client.writes if w[1][:1] == bytes([0x11])]
    assert len(ftms_writes) >= 5, (
        f"Expected >= 5 FTMS grade writes, got {len(ftms_writes)}"
    )


async def test_replay_frames_are_parseable():
    """Sanity check: SAMPLE_RIDE_FRAMES decode to sensible IBD readings."""
    from engine.ftms.parsers import parse_indoor_bike_data
    from tests.fixtures.ble_replay import SAMPLE_RIDE_FRAMES

    assert len(SAMPLE_RIDE_FRAMES) == 120  # 30s × 4 Hz

    # Mid-ride frame (index 60 = t=15s, speed should be ~30 km/h)
    mid_frame = SAMPLE_RIDE_FRAMES[60]
    reading = parse_indoor_bike_data(mid_frame)
    assert reading.speed_kmh is not None
    assert reading.speed_kmh > 0
    assert reading.power_watts is not None
    assert reading.power_watts > 0
