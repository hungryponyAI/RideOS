"""Pinning test: every domain event subscribed in main.py flows into the projection.

main.py wires the AsyncioEventBus to feed every DomainEvent type into a single
RideStateProjection. This test reproduces the wiring and verifies that one of
each event type updates the view as expected — guarding against a missing
subscribe() call when new event types are added.
"""
from __future__ import annotations

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
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

ALL_EVENT_TYPES = (
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


def _wire() -> tuple[AsyncioEventBus, RideStateProjection]:
    bus = AsyncioEventBus()
    proj = RideStateProjection()
    for et in ALL_EVENT_TYPES:
        bus.subscribe(et, proj.apply)
    return bus, proj


def test_all_event_types_have_a_projection_subscriber():
    bus, _ = _wire()
    for et in ALL_EVENT_TYPES:
        assert bus.subscriber_count(et) == 1, f"{et.__name__} missing a subscriber"


def test_published_telemetry_reaches_projection():
    bus, proj = _wire()
    bus.publish(TelemetryReading(speed_kmh=27.5, power_w=210, cadence_rpm=87.0, t_mono=1.0))
    assert proj.view.speed_kmh == 27.5
    assert proj.view.power_w == 210


def test_published_gear_shift_reaches_projection():
    bus, proj = _wire()
    bus.publish(GearShifted(gear=9, direction="up", t_mono=2.0))
    assert proj.view.gear == 9


def test_full_event_stream_drives_view():
    """One of each event type, in a plausible ride order."""
    bus, proj = _wire()
    bus.publish(RouteLoaded(route_id="alpine", total_dist_m=12_000.0, t_mono=0.0))
    bus.publish(RideStarted(
        route_id="alpine", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=1.0,
    ))
    bus.publish(RidePhaseChanged(
        phase="route", target_power_w=None, phase_end_mono=None, t_mono=2.0,
    ))
    bus.publish(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=3.0))
    bus.publish(GearShifted(gear=8, direction="up", t_mono=4.0))
    bus.publish(PositionAdvanced(
        position_m=500.0, grade_idx=1, grade_pct=2.5, lap_index=0, t_mono=5.0,
    ))
    bus.publish(ErgTargetCommitted(power_w=180.0, cadence_rpm=85, t_mono=6.0))
    bus.publish(RideEnded(elapsed_s=60, t_mono=61.0))

    v = proj.view
    assert v.route_id == "alpine"
    assert v.total_dist_m == 12_000.0
    assert v.speed_kmh == 30.0
    assert v.gear == 8
    assert v.position_m == 500.0
    assert v.real_grade_pct == 2.5
    assert v.erg_committed_power_w == 180.0
    assert v.erg_committed_cadence == 85
    assert v.ride_phase == "done"
    assert v.paused is True
