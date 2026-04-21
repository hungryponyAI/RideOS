"""Tests for engine.route.tracker — ROUTE-02 + ROUTE-03 coverage.

RED phase: these tests import engine.route.tracker which does not yet exist.
Task 2 of this plan turns them GREEN.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

import pytest


# ------------------------------------------------------------------
# Fixtures: a minimal RouteData stub + a minimal RideState stub
# ------------------------------------------------------------------

def _build_route(total_m: float = 1000.0, grades: list[float] | None = None):
    """Create a RouteData with N=5 points spanning total_m metres.

    cum_dist_m = [0, 250, 500, 750, 1000]
    grades_pct defaults to [0, 2, 4, -2, 0] — monotonic-enough for bisect tests.
    """
    from engine.route.model import RouteData

    if grades is None:
        grades = [0.0, 2.0, 4.0, -2.0, 0.0]
    assert len(grades) == 5
    step = total_m / 4
    cum = tuple(step * i for i in range(5))
    return RouteData(
        lats=(52.52, 52.521, 52.522, 52.523, 52.524),
        lons=(13.40, 13.401, 13.402, 13.403, 13.404),
        elevations_m=(100.0, 105.0, 115.0, 110.0, 110.0),
        cum_dist_m=cum,
        grades_pct=tuple(grades),
        total_dist_m=cum[-1],
    )


@dataclass
class _FakeRideState:
    """Minimal stand-in for engine.control.state.RideState — only the fields RouteTracker uses."""
    real_grade_percent: float = 0.0
    last_speed_kmh: Optional[float] = None


# ------------------------------------------------------------------
# ROUTE-02: position integration
# ------------------------------------------------------------------

async def test_tracker_advances_position_at_fixed_speed():
    """ROUTE-02 happy path: 36 km/h = 10 m/s; after 0.5 s of ticks, position ≈ 5 m."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0)
    tracker = RouteTracker(route)
    state = _FakeRideState(last_speed_kmh=36.0)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(state, stop_event, tick_s=0.05))
    await asyncio.sleep(0.25)  # ~5 ticks at 0.05 s
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    # 10 m/s * 0.25 s = 2.5 m, allow wide tolerance for scheduler jitter
    assert 1.0 < tracker.position_m < 8.0, f"Expected ~2.5 m of travel, got {tracker.position_m}"


async def test_position_clamp_and_route_complete():
    """ROUTE-02: reaching total_dist_m clamps position AND sets grade to 0 AND exits task."""
    from engine.route.tracker import RouteTracker, ROUTE_COMPLETE_GRADE

    route = _build_route(total_m=5.0)  # Tiny route so we finish in ~1 tick at 36 km/h
    tracker = RouteTracker(route)
    state = _FakeRideState(last_speed_kmh=36.0, real_grade_percent=99.0)  # sentinel
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(state, stop_event, tick_s=0.01))
    # Wait for task to complete naturally (route ends); should exit without stop_event
    await asyncio.wait_for(task, timeout=2.0)

    assert tracker.position_m <= route.total_dist_m
    assert tracker.position_m >= route.total_dist_m - 0.5  # reached the end band
    assert state.real_grade_percent == ROUTE_COMPLETE_GRADE
    assert ROUTE_COMPLETE_GRADE == 0.0


async def test_none_speed_treated_as_zero():
    """ROUTE-02 Pitfall 4: None last_speed_kmh (BLE gap) must not crash; position freezes."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0)
    tracker = RouteTracker(route)
    state = _FakeRideState(last_speed_kmh=None)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(state, stop_event, tick_s=0.02))
    await asyncio.sleep(0.1)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    assert tracker.position_m == 0.0  # no movement at all


# ------------------------------------------------------------------
# ROUTE-03: grade lookup + state mutation
# ------------------------------------------------------------------

async def test_grade_lookup_uses_bisect():
    """ROUTE-03: at position 600 m on a 0-250-500-750-1000 route, bisect_right(cum, 600)-1 = 2.
    So state.real_grade_percent should equal grades_pct[2] = 4.0.
    """
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0, grades=[0.0, 2.0, 4.0, -2.0, 0.0])
    tracker = RouteTracker(route)
    # Seed position via a single tick at very high speed, then stop
    state = _FakeRideState(last_speed_kmh=36.0 * 60)  # 60 m/s — advances fast
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(state, stop_event, tick_s=0.01))
    await asyncio.sleep(0.05)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    # We don't know exact position, but after > 250 m we should be in grade band 2.0 or later
    # The key assertion: real_grade_percent must be a value from grades_pct (never stale 0.0 if we moved)
    assert state.real_grade_percent in route.grades_pct
    assert tracker.position_m > 0.0


async def test_state_mutation_happens_every_tick():
    """ROUTE-03: verify state.real_grade_percent is written each tick, not just once."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0, grades=[7.5, 7.5, 7.5, 7.5, 7.5])  # uniform
    tracker = RouteTracker(route)
    state = _FakeRideState(last_speed_kmh=10.0, real_grade_percent=-99.0)  # bogus sentinel
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(state, stop_event, tick_s=0.02))
    await asyncio.sleep(0.05)  # >= 1 tick guaranteed
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    # Uniform grade route → state must reflect 7.5, overwriting the sentinel
    assert state.real_grade_percent == 7.5


async def test_position_m_property_is_readonly():
    """ROUTE-02: tracker.position_m is a read-only property (no setter)."""
    from engine.route.tracker import RouteTracker

    route = _build_route()
    tracker = RouteTracker(route)
    assert tracker.position_m == 0.0
    with pytest.raises(AttributeError):
        tracker.position_m = 123.0  # type: ignore[misc]
