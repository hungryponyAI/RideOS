"""Tests for engine.route.tracker — ROUTE-02 + ROUTE-03 coverage."""
from __future__ import annotations

import asyncio
from dataclasses import replace

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
    from engine.domain.events import PositionAdvanced
    from engine.route.tracker import ROUTE_COMPLETE_GRADE, RouteTracker

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


async def test_physics_mode_advances_from_power_when_speed_is_missing():
    """Phase 2: physics-enabled tracking uses power instead of trainer speed."""
    from engine.domain.physics import PhysicsConfig
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0, grades=[0.0, 0.0, 0.0, 0.0, 0.0])
    tracker = RouteTracker(
        route,
        physics_config=PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42),
        initial_speed_ms=4.0,
    )
    stop_event = asyncio.Event()

    task = asyncio.create_task(
        tracker.run(lambda: None, stop_event, tick_s=0.02, power_fn=lambda: 250.0)
    )
    await asyncio.sleep(0.1)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    assert tracker.position_m > 0.0


async def test_physics_config_without_power_fn_keeps_speed_based_tracking():
    """Physics config alone is not enough to switch modes."""
    from engine.domain.physics import PhysicsConfig
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0)
    tracker = RouteTracker(
        route,
        physics_config=PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42),
        initial_speed_ms=8.0,
    )
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: None, stop_event, tick_s=0.02))
    await asyncio.sleep(0.1)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    assert tracker.position_m == 0.0


async def test_curve_speed_limit_caps_virtual_progress_speed_mode():
    """Curve profile caps route progress while leaving trainer speed input intact."""
    from engine.route.tracker import RouteTracker

    route = _build_route(total_m=1000.0, grades=[0.0, 0.0, 0.0, 0.0, 0.0])
    route = replace(
        route,
        curve_radius_m=(20.0, 20.0, 20.0, 20.0, 20.0),
        curve_speed_limit_mps=(2.0, 2.0, 2.0, 2.0, 2.0),
    )
    tracker = RouteTracker(route, initial_speed_ms=10.0)
    stop_event = asyncio.Event()

    task = asyncio.create_task(tracker.run(lambda: 36.0, stop_event, tick_s=0.02))
    await asyncio.sleep(0.12)
    stop_event.set()
    await asyncio.wait_for(task, timeout=1.0)

    assert tracker._curve_limited_active is True
    assert tracker._virtual_speed_ms < 10.0


def test_physics_debug_env_logs_without_global_debug(monkeypatch, caplog):
    """RIDEOS_PHYSICS_DEBUG prints the physics line at INFO without root DEBUG noise."""
    import logging

    from engine.domain.tracker import CurveConstraint
    from engine.route.tracker import RouteTracker

    monkeypatch.setenv("RIDEOS_PHYSICS_DEBUG", "1")
    tracker = RouteTracker(_build_route())

    with caplog.at_level(logging.INFO, logger="rideos.route"):
        tracker._log_physics_debug(
            10.0,
            7.0,
            CurveConstraint(radius_m=20.0, curvature=0.05, speed_limit_mps=5.0),
            5.0,
        )

    assert "PHYSICS | physics_v=7.00m/s" in caplog.text
    assert "curve_limit=5.00m/s" in caplog.text
    assert "derived_v=5.00m/s" in caplog.text


# ------------------------------------------------------------------
# ROUTE-03: grade lookup via PositionAdvanced events
# ------------------------------------------------------------------

async def test_grade_lookup_publishes_correct_grade():
    """ROUTE-03: at high speed, bisect advances; final event grade must be in grades_pct."""
    from engine.domain.events import PositionAdvanced
    from engine.route.tracker import RouteTracker

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
    from engine.domain.events import PositionAdvanced
    from engine.route.tracker import RouteTracker

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
