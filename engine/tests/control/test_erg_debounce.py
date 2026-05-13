"""Pinning tests for the erg-mode debouncing logic in run_control_loop.

The debouncer inside run_control_loop:
- On first tick in erg mode: commits immediately
- When raw_power differs from committed by ≥1 W: schedules change 30 s in the future
- When scheduled time arrives: committed ← pending
- When raw_power returns to match committed: cancels the pending change
- While paused: control loop takes grade-sim path (erg branch skipped)
"""
from __future__ import annotations

import asyncio

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.control.athlete import AthleteProfile
from engine.control.controller import FtmsController, run_control_loop
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.events import PositionAdvanced, RidePauseToggled, RideStarted
from engine.domain.projection import RideStateProjection
from engine.ftms.control_point import FMCP_UUID, OpCode
from engine.gears.engine import GearEngine


def _setup(
    power_table: tuple[float, ...],
    cadence_table: tuple[int | None, ...] | None = None,
    grade_idx: int = 0,
    paused: bool = False,
) -> tuple[RideStateProjection, ErgDebouncer, GearEngine]:
    """Wire projection + debouncer for erg mode."""
    bus = AsyncioEventBus()
    gear_engine = GearEngine()
    projection = RideStateProjection()
    erg_debouncer = ErgDebouncer(bus)
    erg_debouncer.configure(power_table=power_table, cadence_table=cadence_table)

    # Bring projection to: erg_mode=True, paused as requested, grade_idx set
    projection.apply(RideStarted(
        route_id="test", laps=1, warmup_s=0, cooldown_s=0, erg_mode=True, t_mono=0.0,
    ))
    if paused:
        projection.apply(RidePauseToggled(paused=True, t_mono=0.0))
    projection.apply(PositionAdvanced(
        position_m=0.0, grade_idx=grade_idx, grade_pct=0.0, lap_index=0, t_mono=0.0,
    ))
    return projection, erg_debouncer, gear_engine


# ---------------------------------------------------------------------------
# First-tick commit
# ---------------------------------------------------------------------------

async def test_erg_first_tick_commits_immediately(fake_bleak_client_factory):
    """On the very first erg tick, committed = raw_power (no 30 s wait)."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    projection, erg_debouncer, gear_engine = _setup(
        power_table=(100.0, 150.0, 200.0), grade_idx=0,
    )
    stop = asyncio.Event()
    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick >= 2:
            stop.set()

    await run_control_loop(
        ctrl, AthleteProfile(), stop,
        projection=projection, erg_debouncer=erg_debouncer, gear_engine=gear_engine,
        sleep=fake_sleep, clock=lambda: tick * 0.25,
    )

    assert erg_debouncer.committed_power_w == 100.0
    assert erg_debouncer.pending_power_w is None


# ---------------------------------------------------------------------------
# Pending change scheduled on grade transition
# ---------------------------------------------------------------------------

async def test_erg_grade_change_schedules_pending(fake_bleak_client_factory):
    """When grade_idx changes so raw_power differs ≥1 W, pending is scheduled."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    projection, erg_debouncer, gear_engine = _setup(
        power_table=(100.0, 200.0, 250.0), grade_idx=0,
    )
    stop = asyncio.Event()
    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            # Advance to a higher-power grade segment
            projection.apply(PositionAdvanced(
                position_m=10.0, grade_idx=1, grade_pct=1.0, lap_index=0, t_mono=tick * 0.25,
            ))
        if tick >= 4:
            stop.set()

    await run_control_loop(
        ctrl, AthleteProfile(), stop,
        projection=projection, erg_debouncer=erg_debouncer, gear_engine=gear_engine,
        sleep=fake_sleep, clock=lambda: tick * 0.25,
    )

    assert erg_debouncer.committed_power_w == 100.0
    assert erg_debouncer.pending_power_w == 200.0
    assert erg_debouncer.commit_at > 0.0


# ---------------------------------------------------------------------------
# Pending commit fires after 30 s
# ---------------------------------------------------------------------------

async def test_erg_pending_commits_after_30s(fake_bleak_client_factory):
    """When clock passes commit_at, pending becomes committed."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    projection, erg_debouncer, gear_engine = _setup(
        power_table=(100.0, 200.0), grade_idx=0,
    )
    stop = asyncio.Event()
    tick = 0

    def fake_clock():
        if tick <= 5:
            return tick * 0.25
        return 35.0  # well past commit_at

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            projection.apply(PositionAdvanced(
                position_m=10.0, grade_idx=1, grade_pct=1.0, lap_index=0, t_mono=tick * 0.25,
            ))
        if tick >= 8:
            stop.set()

    await run_control_loop(
        ctrl, AthleteProfile(), stop,
        projection=projection, erg_debouncer=erg_debouncer, gear_engine=gear_engine,
        sleep=fake_sleep, clock=fake_clock,
    )

    assert erg_debouncer.committed_power_w == 200.0
    assert erg_debouncer.pending_power_w is None


# ---------------------------------------------------------------------------
# Pending cancelled when raw returns to committed
# ---------------------------------------------------------------------------

async def test_erg_pending_cancelled_on_return(fake_bleak_client_factory):
    """If raw_power returns to match committed, the pending change is cancelled."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    projection, erg_debouncer, gear_engine = _setup(
        power_table=(100.0, 200.0), grade_idx=0,
    )
    stop = asyncio.Event()
    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            projection.apply(PositionAdvanced(
                position_m=10.0, grade_idx=1, grade_pct=1.0, lap_index=0, t_mono=tick * 0.25,
            ))
        if tick == 4:
            projection.apply(PositionAdvanced(
                position_m=0.0, grade_idx=0, grade_pct=0.0, lap_index=0, t_mono=tick * 0.25,
            ))
        if tick >= 6:
            stop.set()

    await run_control_loop(
        ctrl, AthleteProfile(), stop,
        projection=projection, erg_debouncer=erg_debouncer, gear_engine=gear_engine,
        sleep=fake_sleep, clock=lambda: tick * 0.25,
    )

    assert erg_debouncer.committed_power_w == 100.0
    assert erg_debouncer.pending_power_w is None
    assert erg_debouncer.commit_at == 0.0


# ---------------------------------------------------------------------------
# Erg branch skipped when paused
# ---------------------------------------------------------------------------

async def test_erg_branch_skipped_when_paused(fake_bleak_client_factory):
    """When projection.paused=True, the erg branch is skipped; grade-sim path runs."""
    client = fake_bleak_client_factory(
        auto_success_for=(
            OpCode.REQUEST_CONTROL,
            OpCode.START_OR_RESUME,
            OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS,
        )
    )
    ctrl = FtmsController(client)
    await ctrl.start()
    baseline = len(client.writes)

    projection, erg_debouncer, gear_engine = _setup(
        power_table=(100.0,), grade_idx=0, paused=True,
    )
    stop = asyncio.Event()
    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick >= 3:
            stop.set()

    await run_control_loop(
        ctrl, AthleteProfile(), stop,
        projection=projection, erg_debouncer=erg_debouncer, gear_engine=gear_engine,
        sleep=fake_sleep, clock=lambda: tick * 0.25,
    )

    writes = client.writes[baseline:]
    opcodes = [w[1][0] for w in writes]
    assert OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS in opcodes
    assert OpCode.SET_TARGET_POWER not in opcodes
    assert erg_debouncer.committed_power_w is None
