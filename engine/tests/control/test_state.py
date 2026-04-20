"""Tests for RideState telemetry field extensions (Phase 3)."""
from __future__ import annotations

from engine.control.state import RideState
from engine.gears.engine import GearEngine


def test_ridestate_telemetry_fields_default_none():
    """RideState has last_speed_kmh, last_power_w, last_cadence_rpm all defaulting to None."""
    state = RideState(gear_engine=GearEngine())
    assert state.last_speed_kmh is None
    assert state.last_power_w is None
    assert state.last_cadence_rpm is None


def test_ridestate_telemetry_fields_assignable():
    """Telemetry fields on RideState can be assigned float values."""
    state = RideState(gear_engine=GearEngine())
    state.last_speed_kmh = 32.5
    state.last_power_w = 185.0
    state.last_cadence_rpm = 88.0
    assert state.last_speed_kmh == 32.5
    assert state.last_power_w == 185.0
    assert state.last_cadence_rpm == 88.0


def test_ridestate_existing_fields_unchanged():
    """Existing RideState fields remain intact after telemetry field extension."""
    gear = GearEngine()
    state = RideState(gear_engine=gear, real_grade_percent=3.5)
    assert state.gear_engine is gear
    assert state.real_grade_percent == 3.5


def test_ridestate_dataclass_fields_present():
    """RideState dataclass fields dict contains the 3 new telemetry fields."""
    import dataclasses
    field_names = {f.name for f in dataclasses.fields(RideState)}
    assert "last_speed_kmh" in field_names
    assert "last_power_w" in field_names
    assert "last_cadence_rpm" in field_names
