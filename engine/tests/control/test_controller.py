import asyncio
import pytest

from engine.control.controller import FtmsController, FtmsControlError, run_control_loop
from engine.control.state import RideState
from engine.ftms.control_point import FMCP_UUID, OpCode, ResultCode
from engine.gears.engine import GearEngine


async def test_handshake_happy_path(fake_bleak_client_factory):
    client = fake_bleak_client_factory(auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME))
    ctrl = FtmsController(client)
    await ctrl.start()
    # Two writes, both to FMCP_UUID, with response=True
    assert len(client.writes) == 2
    assert client.writes[0] == (FMCP_UUID, b"\x00", True)
    assert client.writes[1] == (FMCP_UUID, b"\x07", True)
    assert ctrl.controlled is True


async def test_handshake_raises_on_not_permitted(fake_bleak_client_factory, fmcp_not_permitted_request_control):
    client = fake_bleak_client_factory()
    client.queue_indication(fmcp_not_permitted_request_control)
    ctrl = FtmsController(client)
    with pytest.raises(FtmsControlError) as exc:
        await ctrl.start()
    assert exc.value.op == OpCode.REQUEST_CONTROL
    assert exc.value.result == ResultCode.CONTROL_NOT_PERMITTED
    assert ctrl.controlled is False


async def test_handshake_raises_on_start_failure(fake_bleak_client_factory, fmcp_success_request_control):
    client = fake_bleak_client_factory()
    client.queue_indication(fmcp_success_request_control)   # REQUEST_CONTROL SUCCESS
    client.queue_indication(b"\x80\x07\x04")                 # START_OR_RESUME -> OPERATION_FAILED
    ctrl = FtmsController(client)
    with pytest.raises(FtmsControlError) as exc:
        await ctrl.start()
    assert exc.value.op == OpCode.START_OR_RESUME
    assert exc.value.result == ResultCode.OPERATION_FAILED


async def test_handshake_timeout(fake_bleak_client_factory, monkeypatch):
    # Shorten timeout so the test finishes fast
    monkeypatch.setattr(FtmsController, "_RESPONSE_TIMEOUT_S", 0.05)
    client = fake_bleak_client_factory()   # no queued response → Future never resolves
    ctrl = FtmsController(client)
    with pytest.raises((asyncio.TimeoutError, FtmsControlError)):
        await ctrl.start()


async def test_set_simulation_grade_encodes_correctly(fake_bleak_client_factory):
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)
    )
    ctrl = FtmsController(client)
    await ctrl.start()
    await ctrl.set_simulation_grade(5.0)
    assert client.writes[-1] == (FMCP_UUID, b"\x11\x00\x00\xf4\x01\x00\x00", True)


async def test_tick_coalescing(fake_bleak_client_factory):
    """Verify epsilon gating + 1s keepalive over a scripted timeline."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)
    )
    ctrl = FtmsController(client)
    await ctrl.start()
    baseline_writes = len(client.writes)   # 2 from handshake

    gears = GearEngine(current_gear=5)
    state = RideState(gear_engine=gears, real_grade_percent=6.0)
    stop = asyncio.Event()

    times = iter([0.00, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25])
    sleeps: list[float] = []

    async def fake_sleep(d):
        sleeps.append(d)
        # After 5 sleeps have been awaited, signal stop so loop exits.
        if len(sleeps) >= 5:
            stop.set()

    def fake_clock():
        return next(times)

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=fake_clock)

    sim_writes = [w for w in client.writes[baseline_writes:] if w[1][:1] == b"\x11"]
    # First tick always writes. With no grade change, keepalive forces a write
    # at >= 1.0s since last_write_t. With clock starting at 0.00 and keepalive
    # 1.0s, ticks at t=0.00 (forced first) and t>=1.00 (keepalive) write.
    # Between them the loop ticks but skips writes (epsilon gating; grade stable).
    assert len(sim_writes) >= 2              # first tick + at least one keepalive
    assert len(sim_writes) < 5               # not every tick writes
    # Every write uses response=True
    assert all(w[2] is True for w in sim_writes)


async def test_tick_writes_on_grade_change(fake_bleak_client_factory):
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)
    )
    ctrl = FtmsController(client)
    await ctrl.start()
    baseline = len(client.writes)

    gears = GearEngine(current_gear=5)
    state = RideState(gear_engine=gears, real_grade_percent=2.0)
    stop = asyncio.Event()

    tick_count = {"n": 0}

    async def fake_sleep(_d):
        tick_count["n"] += 1
        # On tick 2, shift gears — effective_grade changes dramatically
        if tick_count["n"] == 2:
            gears.shift_down()          # factor 0.892 -> 0.772, effective grade changes
        if tick_count["n"] >= 4:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=lambda: tick_count["n"] * 0.25)

    sim_writes = [w for w in client.writes[baseline:] if w[1][:1] == b"\x11"]
    # First tick + post-shift tick must both write (epsilon exceeded).
    assert len(sim_writes) >= 2


async def test_no_write_before_handshake(fake_bleak_client_factory):
    """The architectural rule: writes only happen after controller.start() succeeds."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME)
    )
    ctrl = FtmsController(client)

    # Before start(): zero writes
    assert len(client.writes) == 0

    # After start(): exactly 2 writes (REQUEST_CONTROL + START_OR_RESUME), IN ORDER
    await ctrl.start()
    assert len(client.writes) == 2
    assert client.writes[0][1][0] == OpCode.REQUEST_CONTROL    # opcode 0x00 first
    assert client.writes[1][1][0] == OpCode.START_OR_RESUME    # opcode 0x07 second
    # No 0x11 before any set_simulation_grade call:
    assert not any(w[1][0] == OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS for w in client.writes)


# ---------------------------------------------------------------------------
# Task 1 (02-04): shutdown tests
# ---------------------------------------------------------------------------

async def test_shutdown_sequence(fake_bleak_client_factory):
    """shutdown() produces exactly STOP then RESET writes in that order; controlled=False after."""
    client = fake_bleak_client_factory(
        auto_success_for=(
            OpCode.REQUEST_CONTROL,
            OpCode.START_OR_RESUME,
            OpCode.STOP_OR_PAUSE,
            OpCode.RESET,
        )
    )
    ctrl = FtmsController(client)
    await ctrl.start()
    baseline = len(client.writes)

    await ctrl.shutdown()

    shutdown_writes = client.writes[baseline:]
    assert len(shutdown_writes) == 2
    assert shutdown_writes[0][1][0] == OpCode.STOP_OR_PAUSE   # 0x08 first
    assert shutdown_writes[1][1][0] == OpCode.RESET            # 0x01 second
    assert ctrl.controlled is False


async def test_shutdown_never_raises(fake_bleak_client_factory):
    """BLE error on STOP write → RESET still attempted; no exception raised."""
    client = fake_bleak_client_factory(
        auto_success_for=(
            OpCode.REQUEST_CONTROL,
            OpCode.START_OR_RESUME,
            # STOP_OR_PAUSE deliberately NOT in auto_success_for → Future never resolves → timeout
            OpCode.RESET,
        )
    )
    import unittest.mock as mock
    ctrl = FtmsController(client)
    await ctrl.start()

    # Shorten timeout so the test is fast
    with mock.patch.object(FtmsController, "_RESPONSE_TIMEOUT_S", 0.05):
        # Must not raise even though STOP times out
        await ctrl.shutdown()

    # RESET was still attempted after STOP failed
    opcodes = [w[1][0] for w in client.writes]
    assert OpCode.RESET in opcodes


async def test_shutdown_on_crash(fake_bleak_client_factory):
    """try/finally in caller: shutdown writes appear AFTER a mid-loop grade write.

    Order assertion:
        sim_idx (0x11 grade write) < stop_idx (0x08) < reset_idx (0x01)
    """
    client = fake_bleak_client_factory(
        auto_success_for=(
            OpCode.REQUEST_CONTROL,
            OpCode.START_OR_RESUME,
            OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS,
            OpCode.STOP_OR_PAUSE,
            OpCode.RESET,
        )
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    gears = GearEngine(current_gear=5)
    state = RideState(gear_engine=gears, real_grade_percent=5.0)
    stop = asyncio.Event()

    async def faulty_loop():
        # Perform one grade write then crash
        await ctrl.set_simulation_grade(state.gear_engine.effective_grade(state.real_grade_percent))
        raise RuntimeError("simulated mid-tick crash")

    try:
        await faulty_loop()
    except RuntimeError:
        pass
    finally:
        await ctrl.shutdown()

    opcodes = [w[1][0] for w in client.writes]
    sim_idx  = next(i for i, op in enumerate(opcodes) if op == OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)
    stop_idx = next(i for i, op in enumerate(opcodes) if op == OpCode.STOP_OR_PAUSE)
    reset_idx = next(i for i, op in enumerate(opcodes) if op == OpCode.RESET)
    assert sim_idx < stop_idx < reset_idx
