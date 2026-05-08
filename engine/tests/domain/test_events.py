"""Domain events — construction and immutability."""
from __future__ import annotations

import pytest

from engine.domain.events import (
    ErgTargetCommitted,
    GearShifted,
    PositionAdvanced,
    RideEnded,
    RidePhaseChanged,
    RideStarted,
    RouteLoaded,
    TelemetryReading,
)


def test_telemetry_reading_fields():
    e = TelemetryReading(speed_kmh=30.0, power_w=250, cadence_rpm=90.0, t_mono=1.0)
    assert e.speed_kmh == 30.0
    assert e.power_w == 250
    assert e.cadence_rpm == 90.0
    assert e.t_mono == 1.0


def test_telemetry_reading_nullable_fields():
    e = TelemetryReading(speed_kmh=None, power_w=None, cadence_rpm=None, t_mono=0.0)
    assert e.speed_kmh is None
    assert e.power_w is None


def test_telemetry_reading_immutable():
    e = TelemetryReading(speed_kmh=30.0, power_w=250, cadence_rpm=90.0, t_mono=1.0)
    with pytest.raises((AttributeError, TypeError)):
        e.speed_kmh = 999  # type: ignore[misc]


def test_gear_shifted_up():
    e = GearShifted(gear=7, direction="up", t_mono=2.5)
    assert e.gear == 7
    assert e.direction == "up"


def test_gear_shifted_down():
    e = GearShifted(gear=5, direction="down", t_mono=3.0)
    assert e.direction == "down"


def test_position_advanced():
    e = PositionAdvanced(position_m=1500.0, grade_idx=3, grade_pct=4.5, lap_index=0, t_mono=10.0)
    assert e.position_m == 1500.0
    assert e.grade_pct == 4.5


def test_ride_phase_changed_warmup():
    e = RidePhaseChanged(phase="warmup", target_power_w=90.0, phase_end_mono=120.0, t_mono=0.0)
    assert e.phase == "warmup"
    assert e.target_power_w == 90.0
    assert e.phase_end_mono == 120.0


def test_ride_phase_changed_route():
    e = RidePhaseChanged(phase="route", target_power_w=None, phase_end_mono=None, t_mono=5.0)
    assert e.target_power_w is None
    assert e.phase_end_mono is None


def test_erg_target_committed():
    e = ErgTargetCommitted(power_w=200.0, cadence_rpm=85, t_mono=60.0)
    assert e.power_w == 200.0
    assert e.cadence_rpm == 85


def test_erg_target_committed_no_cadence():
    e = ErgTargetCommitted(power_w=150.0, cadence_rpm=None, t_mono=60.0)
    assert e.cadence_rpm is None


def test_ride_started():
    e = RideStarted(route_id="abc", laps=2, warmup_s=120, cooldown_s=60, erg_mode=False, t_mono=0.0)
    assert e.route_id == "abc"
    assert e.laps == 2
    assert not e.erg_mode


def test_ride_ended():
    e = RideEnded(elapsed_s=3600, t_mono=3601.0)
    assert e.elapsed_s == 3600


def test_route_loaded():
    e = RouteLoaded(route_id="col_du_galibier", total_dist_m=18_000.0, t_mono=0.5)
    assert e.total_dist_m == 18_000.0
