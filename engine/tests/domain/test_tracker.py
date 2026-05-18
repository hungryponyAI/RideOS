"""Domain tests for engine.domain.tracker — pure position and grade functions."""
import pytest

from engine.domain.physics import PhysicsConfig, PhysicsState
from engine.domain.tracker import (
    advance_position,
    advance_position_with_physics,
    curve_constraint_at,
    grade_at,
)

_CUM = (0.0, 250.0, 500.0, 750.0, 1000.0)
_GRADES = (0.0, 2.0, 4.0, -2.0, 0.0)


def test_advance_basic():
    pos = advance_position(0.0, 10.0, 1.0, 1000.0)
    assert pos == pytest.approx(10.0)


def test_advance_clamps_at_total():
    pos = advance_position(990.0, 20.0, 1.0, 1000.0)
    assert pos == 1000.0


def test_advance_zero_speed():
    pos = advance_position(300.0, 0.0, 1.0, 1000.0)
    assert pos == 300.0


def test_advance_position_with_physics_uses_power_and_returns_state():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    pos, state = advance_position_with_physics(
        position_m=0.0,
        physics_state=PhysicsState(speed_ms=4.0),
        power_w=250.0,
        grade_pct=0.0,
        dt=1.0,
        total_dist_m=1000.0,
        config=config,
    )

    assert state.speed_ms > 4.0
    assert pos == pytest.approx(state.speed_ms)


def test_advance_position_with_physics_clamps_at_total():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    pos, state = advance_position_with_physics(
        position_m=998.0,
        physics_state=PhysicsState(speed_ms=8.0),
        power_w=250.0,
        grade_pct=0.0,
        dt=1.0,
        total_dist_m=1000.0,
        config=config,
    )

    assert pos == 1000.0
    assert state.speed_ms > 0.0


def test_grade_at_start():
    idx, grade = grade_at(0.0, _CUM, _GRADES)
    assert idx == 0
    assert grade == 0.0


def test_grade_at_midpoint():
    idx, grade = grade_at(300.0, _CUM, _GRADES)
    assert idx == 1
    assert grade == 2.0


def test_grade_at_end():
    idx, grade = grade_at(1000.0, _CUM, _GRADES)
    assert idx == 4


def test_grade_at_clamps_negative_idx():
    idx, grade = grade_at(-1.0, _CUM, _GRADES)
    assert idx == 0


def test_curve_constraint_at_interpolates_cap_and_radius():
    radii = (None, 40.0, 20.0, 40.0, None)
    caps = (None, 8.0, 5.0, 8.0, None)

    constraint = curve_constraint_at(500.0, _CUM, radii, caps)

    assert constraint.speed_limit_mps == 5.0
    assert constraint.radius_m == 20.0
    assert constraint.curvature == pytest.approx(0.05)


def test_curve_constraint_missing_profile_is_unlimited():
    constraint = curve_constraint_at(500.0, _CUM, (), ())

    assert constraint.speed_limit_mps is None
    assert constraint.radius_m is None
