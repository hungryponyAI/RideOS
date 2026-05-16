"""Domain tests for pure cycling physics helpers."""
import pytest

from engine.domain.physics import (
    PhysicsConfig,
    PhysicsState,
    advance_physics,
    estimate_cda,
    resistive_force_n,
)


def test_estimate_cda_matches_controller_formula_basis():
    cda = estimate_cda(weight_kg=75.0, height_cm=180.0)
    assert cda == pytest.approx(0.3045, rel=0.001)


def test_resistive_force_is_lower_on_descent_than_flat():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)

    flat = resistive_force_n(speed_ms=8.0, grade_pct=0.0, config=config)
    descent = resistive_force_n(speed_ms=8.0, grade_pct=-5.0, config=config)

    assert flat > 0.0
    assert descent < flat


def test_flat_force_keeps_baseline_load_at_low_speed():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42, baseline_resistance_n=4.0)

    force = resistive_force_n(speed_ms=5.0 / 3.6, grade_pct=0.0, config=config)

    assert force > 7.0


def test_shallow_descent_keeps_positive_load_at_moderate_speed():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)

    force = resistive_force_n(speed_ms=25.0 / 3.6, grade_pct=-3.0, config=config)

    assert force > 10.0


def test_grade_scale_softens_climbs_and_descents():
    full_grade = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42, grade_scale=1.0)
    scaled_grade = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42, grade_scale=0.25)

    flat = resistive_force_n(speed_ms=8.0, grade_pct=0.0, config=full_grade)
    full_climb = resistive_force_n(speed_ms=8.0, grade_pct=2.0, config=full_grade)
    scaled_climb = resistive_force_n(speed_ms=8.0, grade_pct=2.0, config=scaled_grade)
    full_descent = resistive_force_n(speed_ms=8.0, grade_pct=-2.0, config=full_grade)
    scaled_descent = resistive_force_n(speed_ms=8.0, grade_pct=-2.0, config=scaled_grade)

    assert flat < scaled_climb < full_climb
    assert full_descent < scaled_descent < flat


def test_flat_road_accelerates_with_power():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    state = PhysicsState(speed_ms=5.0)

    next_state = advance_physics(state, power_w=250.0, grade_pct=0.0, dt=1.0, config=config)

    assert next_state.speed_ms > state.speed_ms


def test_uphill_decelerates_at_low_power():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    state = PhysicsState(speed_ms=5.0)

    next_state = advance_physics(state, power_w=80.0, grade_pct=8.0, dt=1.0, config=config)

    assert next_state.speed_ms < state.speed_ms


def test_downhill_coasting_can_accelerate():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    state = PhysicsState(speed_ms=5.0)

    next_state = advance_physics(state, power_w=0.0, grade_pct=-8.0, dt=1.0, config=config)

    assert next_state.speed_ms > state.speed_ms


def test_missing_power_is_treated_as_zero():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)
    state = PhysicsState(speed_ms=5.0)

    explicit_zero = advance_physics(state, power_w=0.0, grade_pct=0.0, dt=1.0, config=config)
    missing = advance_physics(state, power_w=None, grade_pct=0.0, dt=1.0, config=config)

    assert missing == explicit_zero


def test_speed_clamps_to_sane_range():
    config = PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42)

    stopped = advance_physics(
        PhysicsState(speed_ms=-2.0),
        power_w=0.0,
        grade_pct=0.0,
        dt=1.0,
        config=config,
    )
    very_fast = advance_physics(
        PhysicsState(speed_ms=35.0),
        power_w=0.0,
        grade_pct=0.0,
        dt=0.0,
        config=config,
    )

    assert stopped.speed_ms == 0.0
    assert very_fast.speed_ms == 30.0
