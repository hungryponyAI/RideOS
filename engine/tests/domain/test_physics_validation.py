"""Tests for offline physics validation and calibration helpers."""
import pytest

from engine.domain.physics import PhysicsConfig
from engine.domain.physics_validation import (
    compare_completion_times,
    constant_power,
    estimate_physics_mode_completion,
    estimate_speed_mode_completion,
    validate_edge_cases,
)
from engine.domain.route import RouteData


def _route(total_m: float = 100.0, grade_pct: float = 0.0) -> RouteData:
    return RouteData(
        lats=(0.0, 0.0),
        lons=(0.0, 0.001),
        elevations_m=(0.0, total_m * grade_pct / 100.0),
        cum_dist_m=(0.0, total_m),
        grades_pct=(grade_pct, grade_pct),
        total_dist_m=total_m,
    )


def test_speed_mode_completion_time_is_direct_distance_over_speed():
    estimate = estimate_speed_mode_completion(_route(total_m=100.0), speed_kmh=36.0)

    assert estimate.completed is True
    assert estimate.elapsed_s == pytest.approx(10.0)
    assert estimate.final_position_m == pytest.approx(100.0)


def test_speed_mode_zero_speed_does_not_complete():
    estimate = estimate_speed_mode_completion(_route(total_m=100.0), speed_kmh=0.0, max_time_s=30.0)

    assert estimate.completed is False
    assert estimate.elapsed_s == 30.0
    assert estimate.final_position_m == 0.0


def test_physics_mode_completion_advances_from_power():
    estimate = estimate_physics_mode_completion(
        _route(total_m=20.0),
        power_profile=constant_power(250.0),
        config=PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42),
        dt_s=0.25,
        initial_speed_ms=4.0,
        max_time_s=30.0,
    )

    assert estimate.completed is True
    assert estimate.final_position_m == pytest.approx(20.0)
    assert estimate.max_speed_ms > 4.0


def test_physics_mode_times_out_when_no_power_on_flat_from_stop():
    estimate = estimate_physics_mode_completion(
        _route(total_m=20.0),
        power_profile=constant_power(None),
        config=PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42),
        dt_s=0.25,
        initial_speed_ms=0.0,
        max_time_s=3.0,
    )

    assert estimate.completed is False
    assert estimate.final_position_m == 0.0


def test_compare_completion_times_reports_delta_when_both_complete():
    comparison = compare_completion_times(
        _route(total_m=20.0),
        speed_kmh=18.0,
        power_w=250.0,
        config=PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42),
        initial_speed_ms=4.0,
        max_time_s=30.0,
    )

    assert comparison.speed_mode.completed is True
    assert comparison.physics_mode.completed is True
    assert comparison.delta_s is not None


def test_edge_case_validation_passes_default_scenarios():
    results = validate_edge_cases(PhysicsConfig(rider_mass_kg=75.0, cda_m2=0.42))

    assert {r.name for r in results} == {
        "zero_power_flat_decelerates",
        "missing_power_matches_zero_power",
        "steep_climb_low_power_slows",
        "steep_climb_high_power_beats_low_power",
        "descent_coasting_accelerates",
    }
    assert all(r.passed for r in results)
