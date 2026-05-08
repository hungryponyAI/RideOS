"""Pinning tests for the erg-mode debouncing logic in run_control_loop.

The debouncer inside run_control_loop:
- On first tick in erg mode: commits immediately (erg_committed_power_w = raw_power)
- When raw_power differs from committed by ≥1 W: schedules change 30s in the future
- When scheduled time arrives: committed ← pending
- When raw_power returns to match committed: cancels the pending change
- While paused: control loop takes grade-sim path (erg branch skipped)

These tests drive the loop with a fake clock and fake sleep so they run
in microseconds without real asyncio timing dependencies.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

import pytest

from engine.control.controller import FtmsController, run_control_loop
from engine.control.state import RideState
from engine.ftms.control_point import FMCP_UUID, OpCode
from engine.gears.engine import GearEngine


# ---------------------------------------------------------------------------
# Helper: build a RideState configured for erg mode
# ---------------------------------------------------------------------------

def _erg_state(
    power_table: tuple[float, ...] = (100.0, 150.0, 200.0),
    cadence_table: Optional[tuple[int, ...]] = (85, 80, 75),
    grade_idx: int = 0,
) -> RideState:
    s = RideState(gear_engine=GearEngine())
    s.paused = False
    s.erg_mode = True
    s.erg_power_table = power_table
    s.erg_cadence_table = cadence_table
    s.current_grade_idx = grade_idx
    return s


# ---------------------------------------------------------------------------
# First-tick commit
# ---------------------------------------------------------------------------

async def test_erg_first_tick_commits_immediately(fake_bleak_client_factory):
    """On the very first erg tick, committed = raw_power (no 30s wait)."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    state = _erg_state(power_table=(100.0, 150.0, 200.0), grade_idx=0)
    stop = asyncio.Event()

    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick >= 2:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=lambda: tick * 0.25)

    assert state.erg_committed_power_w == 100.0
    assert state.erg_pending_power_w is None


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

    state = _erg_state(power_table=(100.0, 200.0, 250.0), grade_idx=0)
    stop = asyncio.Event()

    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            # Move to a higher-power grade segment
            state.current_grade_idx = 1
        if tick >= 4:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=lambda: tick * 0.25)

    # committed stays at initial 100 W; pending = 200 W is scheduled
    assert state.erg_committed_power_w == 100.0
    assert state.erg_pending_power_w == 200.0
    assert state.erg_commit_at_monotonic > 0.0


# ---------------------------------------------------------------------------
# Pending commit fires after 30 s
# ---------------------------------------------------------------------------

async def test_erg_pending_commits_after_30s(fake_bleak_client_factory):
    """When clock passes erg_commit_at_monotonic, pending becomes committed."""
    client = fake_bleak_client_factory(
        auto_success_for=(OpCode.REQUEST_CONTROL, OpCode.START_OR_RESUME, OpCode.SET_TARGET_POWER)
    )
    ctrl = FtmsController(client)
    await ctrl.start()

    state = _erg_state(power_table=(100.0, 200.0), grade_idx=0)
    stop = asyncio.Event()

    tick = 0
    # Fake clock: first 5 ticks at t=0..1s, then jump to t=35s (past the 30s debounce)
    def fake_clock():
        if tick <= 5:
            return tick * 0.25
        return 35.0  # well past commit_at

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            state.current_grade_idx = 1  # trigger a pending change
        if tick >= 8:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=fake_clock)

    # After clock jumps to 35s, pending should have been committed
    assert state.erg_committed_power_w == 200.0
    assert state.erg_pending_power_w is None


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

    state = _erg_state(power_table=(100.0, 200.0), grade_idx=0)
    stop = asyncio.Event()

    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick == 2:
            state.current_grade_idx = 1  # trigger pending
        if tick == 4:
            state.current_grade_idx = 0  # return to original grade → cancel pending
        if tick >= 6:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=lambda: tick * 0.25)

    assert state.erg_committed_power_w == 100.0
    assert state.erg_pending_power_w is None
    assert state.erg_commit_at_monotonic == 0.0


# ---------------------------------------------------------------------------
# Erg branch skipped when paused
# ---------------------------------------------------------------------------

async def test_erg_branch_skipped_when_paused(fake_bleak_client_factory):
    """When state.paused=True, the erg branch is skipped; grade-sim path runs instead."""
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

    state = _erg_state(power_table=(100.0,), grade_idx=0)
    state.paused = True  # override to paused

    stop = asyncio.Event()
    tick = 0

    async def fake_sleep(_):
        nonlocal tick
        tick += 1
        if tick >= 3:
            stop.set()

    await run_control_loop(ctrl, state, stop, sleep=fake_sleep, clock=lambda: tick * 0.25)

    # Should have written sim params (0x11), not target power (0x13)
    writes = client.writes[baseline:]
    opcodes = [w[1][0] for w in writes]
    assert OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS in opcodes
    assert OpCode.SET_TARGET_POWER not in opcodes
    # erg state was not touched
    assert state.erg_committed_power_w is None
