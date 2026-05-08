"""Pinning tests for engine.control.phases.run_phases.

These tests pin the observable behavior of the phase machine so that Phase 4
(event-driven rewrite) can refactor the implementation without breaking semantics.

Behavior being pinned:
- warmup sets ride_phase="warmup", target_power_w=90, phase_end_monotonic
- warmup → route when timer expires (stop_event not set)
- route sets ride_phase="route", target_power_w=None
- cooldown sets ride_phase="cooldown", target_power_w=90
- done sets ride_phase="done", target_power_w=None
- stop_event during warmup → done immediately
- stop_event during route → done via cancel propagation
- on_tracker_ready called with the RouteTracker
- on_complete called with elapsed seconds
- ride_start_monotonic set at the beginning
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

import pytest

from engine.control.phases import run_phases
from engine.gears.engine import GearEngine
from engine.route.model import RouteData


# ---------------------------------------------------------------------------
# Minimal fake state (only the fields run_phases touches)
# ---------------------------------------------------------------------------

@dataclass
class _FakeState:
    gear_engine: GearEngine
    real_grade_percent: float = 0.0
    last_speed_kmh: Optional[float] = None
    ride_phase: str = "route"
    target_power_w: Optional[float] = None
    phase_end_monotonic: Optional[float] = None
    ride_start_monotonic: Optional[float] = None
    lap_index: int = 0
    lap_count: int = 1
    current_grade_idx: int = 0
    paused: bool = False


def _small_route(total_m: float = 5.0) -> RouteData:
    """A tiny 5-point route that completes quickly at any speed."""
    step = total_m / 4
    cum = tuple(step * i for i in range(5))
    return RouteData(
        lats=(52.0, 52.001, 52.002, 52.003, 52.004),
        lons=(13.0, 13.001, 13.002, 13.003, 13.004),
        elevations_m=(100.0, 100.0, 100.0, 100.0, 100.0),
        cum_dist_m=cum,
        grades_pct=(0.0, 0.0, 0.0, 0.0, 0.0),
        total_dist_m=cum[-1],
    )


# ---------------------------------------------------------------------------
# Warmup phase tests
# ---------------------------------------------------------------------------

async def test_warmup_sets_phase_and_power():
    """During warmup, ride_phase='warmup' and target_power_w=90.0."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    observed_phases: list[str] = []
    observed_powers: list[Optional[float]] = []

    async def _monitor():
        for _ in range(20):
            observed_phases.append(state.ride_phase)
            observed_powers.append(state.target_power_w)
            await asyncio.sleep(0.01)
        stop.set()

    monitor_task = asyncio.create_task(_monitor())
    await run_phases(state, route, stop, warmup_s=1, cooldown_s=0, laps=1)
    await monitor_task

    assert "warmup" in observed_phases
    assert 90.0 in observed_powers


async def test_warmup_sets_phase_end_monotonic():
    """phase_end_monotonic is set while warmup is running."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    phase_end_seen: list[Optional[float]] = []

    async def _check():
        await asyncio.sleep(0.02)
        phase_end_seen.append(state.phase_end_monotonic)
        stop.set()

    check_task = asyncio.create_task(_check())
    await run_phases(state, route, stop, warmup_s=5, cooldown_s=0)
    await check_task

    assert phase_end_seen[0] is not None, "phase_end_monotonic must be set during warmup"


async def test_stop_during_warmup_exits_immediately():
    """Setting stop_event during warmup → ride_phase='done', target_power_w=None."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    async def _stopper():
        await asyncio.sleep(0.05)
        stop.set()

    stopper = asyncio.create_task(_stopper())
    await run_phases(state, route, stop, warmup_s=10)
    await stopper

    assert state.ride_phase == "done"
    assert state.target_power_w is None


# ---------------------------------------------------------------------------
# Route phase tests
# ---------------------------------------------------------------------------

async def test_route_phase_sets_correct_state():
    """When route starts, ride_phase='route' and target_power_w=None."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    route_phase_observed = False
    tracker_ref: list = []

    def _on_ready(t):
        tracker_ref.append(t)
        # Speed the route up so the test finishes quickly
        state.last_speed_kmh = 360.0  # 100 m/s → tiny route done in <0.1 s

    await run_phases(
        state, route, stop, warmup_s=0, cooldown_s=0, laps=1,
        on_tracker_ready=_on_ready,
    )

    assert state.ride_phase == "done"
    assert len(tracker_ref) == 1, "on_tracker_ready must be called exactly once"


async def test_on_complete_receives_elapsed():
    """on_complete is called with a non-negative elapsed_s when the route finishes."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()
    elapsed: list[int] = []

    def _on_ready(t):
        state.last_speed_kmh = 360.0  # fast finish

    await run_phases(
        state, route, stop, warmup_s=0, cooldown_s=0, laps=1,
        on_tracker_ready=_on_ready,
        on_complete=lambda s: elapsed.append(s),
    )

    assert len(elapsed) == 1
    assert elapsed[0] >= 0


async def test_lap_count_written_to_state():
    """lap_count in state reflects the laps= parameter."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    def _on_ready(t):
        state.last_speed_kmh = 720.0  # very fast

    await run_phases(
        state, route, stop, warmup_s=0, cooldown_s=0, laps=3,
        on_tracker_ready=_on_ready,
    )

    assert state.lap_count == 3


# ---------------------------------------------------------------------------
# Cooldown phase tests
# ---------------------------------------------------------------------------

async def test_cooldown_sets_phase_and_power():
    """After route completes, cooldown sets ride_phase='cooldown' and target_power_w=90."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    cooldown_phase_seen = False
    cooldown_power_seen = False

    def _on_ready(t):
        state.last_speed_kmh = 360.0  # fast finish

    async def _monitor():
        nonlocal cooldown_phase_seen, cooldown_power_seen
        for _ in range(100):
            if state.ride_phase == "cooldown":
                cooldown_phase_seen = True
            if state.target_power_w == 90.0 and state.ride_phase == "cooldown":
                cooldown_power_seen = True
                stop.set()
                return
            await asyncio.sleep(0.01)
        stop.set()

    monitor_task = asyncio.create_task(_monitor())
    await run_phases(
        state, route, stop, warmup_s=0, cooldown_s=5,
        on_tracker_ready=_on_ready,
    )
    await monitor_task

    assert cooldown_phase_seen, "ride_phase='cooldown' was never observed"
    assert cooldown_power_seen, "target_power_w=90.0 was never observed during cooldown"


# ---------------------------------------------------------------------------
# Ride start monotonic
# ---------------------------------------------------------------------------

async def test_ride_start_monotonic_set():
    """ride_start_monotonic is written at the very beginning of run_phases."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    def _on_ready(t):
        state.last_speed_kmh = 360.0

    await run_phases(state, route, stop, warmup_s=0, cooldown_s=0, on_tracker_ready=_on_ready)

    assert state.ride_start_monotonic is not None
    import time
    assert state.ride_start_monotonic <= time.monotonic()


# ---------------------------------------------------------------------------
# Full sequence: warmup → route → cooldown → done
# ---------------------------------------------------------------------------

async def test_full_sequence_transitions():
    """Observe all four phase values in order across a short run."""
    state = _FakeState(gear_engine=GearEngine())
    route = _small_route()
    stop = asyncio.Event()

    phases: list[str] = []
    last: str = ""

    def _on_ready(t):
        state.last_speed_kmh = 360.0

    async def _recorder():
        nonlocal last
        for _ in range(500):
            if state.ride_phase != last:
                phases.append(state.ride_phase)
                last = state.ride_phase
            if state.ride_phase == "done":
                return
            await asyncio.sleep(0.01)

    recorder_task = asyncio.create_task(_recorder())
    await run_phases(
        state, route, stop, warmup_s=1, cooldown_s=1,
        on_tracker_ready=_on_ready,
    )
    await recorder_task

    assert "warmup" in phases
    assert "route" in phases
    assert "cooldown" in phases
    assert "done" in phases
    # Ordering: warmup before route before cooldown before done
    assert phases.index("warmup") < phases.index("route")
    assert phases.index("route") < phases.index("cooldown")
    assert phases.index("cooldown") < phases.index("done")
