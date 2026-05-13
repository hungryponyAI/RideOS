"""Tests for engine.route.tracker — ROUTE-02 + ROUTE-03 coverage."""
from __future__ import annotations

import asyncio
from typing import Optional

import pytest


def _build_route(total_m: float = 1000.0, grades: list[float] | None = None):
    """Create a RouteData with N=5 points spanning total_m metres."""
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


class _CaptureBus:
    """Minimal event bus that records published events."""
    def __init__(self):
        self.events: list = []

    def publish(self, event) -> None:
        self.events.append(event)


# ------------------------------------------------------------------
# ROUTE-02: position integration
# ------------------------------------------------------------------

async def test_tracker_advances_position_at_fixed_speed():
    """ROUTE-02 happy path: 36 km/h = 10 m/s; after 0.25 s of ticks, position > 0."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0)
    tracker = RouteTracker(route)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: 36.0, stop_event, tick_s=0.05))
    await asyncio.sleep(0.25)  # ~5 ticks at 0.05 s
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    # 10 m/s * 0.25 s ≈ 2.5 m; wide tolerance for scheduler jitter
    assert 1.0 < tracker.position_m < 8.0, f"Expected ~2.5 m of travel, got {tracker.position_m}"


async def test_position_clamp_and_route_complete():
    """ROUTE-02: reaching total_dist_m exits the task; final PositionAdvanced has grade 0."""
    from engine.route.tracker import RouteTracker, ROUTE_COMPLETE_GRADE
    from engine.domain.events import PositionAdvanced

    route = _build_route(total_m=5.0)
    bus = _CaptureBus()
    tracker = RouteTracker(route, bus=bus)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: 36.0, stop_event, tick_s=0.01))
    await asyncio.wait_for(task, timeout=2.0)

    assert tracker.position_m <= route.total_dist_m
    assert tracker.position_m >= route.total_dist_m - 0.6

    # Final PositionAdvanced event should carry ROUTE_COMPLETE_GRADE
    pos_events = [e for e in bus.events if isinstance(e, PositionAdvanced)]
    assert len(pos_events) >= 1
    assert pos_events[-1].grade_pct == ROUTE_COMPLETE_GRADE
    assert ROUTE_COMPLETE_GRADE == 0.0


async def test_none_speed_treated_as_zero():
    """ROUTE-02 Pitfall: None speed (BLE gap) must not crash; position freezes."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0)
    tracker = RouteTracker(route)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: None, stop_event, tick_s=0.02))
    await asyncio.sleep(0.1)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    assert tracker.position_m == 0.0


# ------------------------------------------------------------------
# ROUTE-03: grade lookup via PositionAdvanced events
# ------------------------------------------------------------------

async def test_grade_lookup_publishes_correct_grade():
    """ROUTE-03: at high speed, bisect advances; final event grade must be in grades_pct."""
    from engine.route.tracker import RouteTracker
    from engine.domain.events import PositionAdvanced

    route = _build_route(total_m=1000.0, grades=[0.0, 2.0, 4.0, -2.0, 0.0])
    bus = _CaptureBus()
    tracker = RouteTracker(route, bus=bus)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: 36.0 * 60, stop_event, tick_s=0.01))
    await asyncio.sleep(0.05)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    pos_events = [e for e in bus.events if isinstance(e, PositionAdvanced)]
    assert len(pos_events) >= 1
    assert all(e.grade_pct in route.grades_pct for e in pos_events)
    assert tracker.position_m > 0.0


async def test_grade_published_every_tick():
    """ROUTE-03: PositionAdvanced is published on every tick, not just once."""
    from engine.route.tracker import RouteTracker
    from engine.domain.events import PositionAdvanced

    route = _build_route(total_m=1000.0, grades=[7.5, 7.5, 7.5, 7.5, 7.5])
    bus = _CaptureBus()
    tracker = RouteTracker(route, bus=bus)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: 10.0, stop_event, tick_s=0.02))
    await asyncio.sleep(0.12)  # ≥ 3 ticks
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    pos_events = [e for e in bus.events if isinstance(e, PositionAdvanced)]
    assert len(pos_events) >= 3
    assert all(e.grade_pct == 7.5 for e in pos_events)


async def test_position_m_property_is_readonly():
    """ROUTE-02: tracker.position_m is a read-only property (no setter)."""
    from engine.route.tracker import RouteTracker

    route = _build_route()
    tracker = RouteTracker(route)
    assert tracker.position_m == 0.0
    with pytest.raises(AttributeError):
        tracker.position_m = 123.0  # type: ignore[misc]
