"""RideStateProjection — feed events, assert on the resulting view."""
from __future__ import annotations

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
from engine.domain.projection import RideStateProjection


def proj() -> RideStateProjection:
    return RideStateProjection()


# ── defaults ──────────────────────────────────────────────────────────────────

def test_initial_view_is_paused():
    assert proj().view.paused is True


def test_initial_gear_is_six():
    assert proj().view.gear == 6


def test_initial_position_zero():
    assert proj().view.position_m == 0.0


def test_initial_view_is_frozen():
    import pytest
    v = proj().view
    with pytest.raises((AttributeError, TypeError)):
        v.gear = 99  # type: ignore[misc]


# ── TelemetryReading ──────────────────────────────────────────────────────────

def test_telemetry_updates_speed_power_cadence():
    p = proj()
    v = p.apply(TelemetryReading(speed_kmh=28.5, power_w=215, cadence_rpm=88.0, t_mono=1.0))
    assert v.speed_kmh == 28.5
    assert v.power_w == 215
    assert v.cadence_rpm == 88.0


def test_telemetry_nulls_propagate():
    p = proj()
    p.apply(TelemetryReading(speed_kmh=20.0, power_w=180, cadence_rpm=80.0, t_mono=1.0))
    v = p.apply(TelemetryReading(speed_kmh=None, power_w=None, cadence_rpm=None, t_mono=2.0))
    assert v.speed_kmh is None
    assert v.power_w is None


def test_view_property_matches_apply_return():
    p = proj()
    returned = p.apply(TelemetryReading(speed_kmh=10.0, power_w=100, cadence_rpm=70.0, t_mono=1.0))
    assert p.view is returned


# ── GearShifted ───────────────────────────────────────────────────────────────

def test_gear_shifted_updates_gear():
    p = proj()
    v = p.apply(GearShifted(gear=8, direction="up", t_mono=2.0))
    assert v.gear == 8


def test_gear_shifted_does_not_touch_telemetry():
    p = proj()
    p.apply(TelemetryReading(speed_kmh=25.0, power_w=200, cadence_rpm=85.0, t_mono=1.0))
    v = p.apply(GearShifted(gear=4, direction="down", t_mono=2.0))
    assert v.speed_kmh == 25.0


# ── PositionAdvanced ──────────────────────────────────────────────────────────

def test_position_advanced_updates_all_fields():
    p = proj()
    v = p.apply(PositionAdvanced(position_m=3000.0, grade_idx=5, grade_pct=6.0, lap_index=1, t_mono=30.0))
    assert v.position_m == 3000.0
    assert v.real_grade_pct == 6.0
    assert v.grade_idx == 5
    assert v.lap_index == 1


# ── RidePhaseChanged ──────────────────────────────────────────────────────────

def test_phase_changed_to_warmup():
    p = proj()
    v = p.apply(RidePhaseChanged(phase="warmup", target_power_w=90.0, phase_end_mono=120.0, t_mono=0.0))
    assert v.ride_phase == "warmup"
    assert v.target_power_w == 90.0
    assert v.phase_end_mono == 120.0


def test_phase_changed_to_route_clears_countdown():
    p = proj()
    p.apply(RidePhaseChanged(phase="warmup", target_power_w=90.0, phase_end_mono=120.0, t_mono=0.0))
    v = p.apply(RidePhaseChanged(phase="route", target_power_w=None, phase_end_mono=None, t_mono=121.0))
    assert v.ride_phase == "route"
    assert v.target_power_w is None
    assert v.phase_end_mono is None


# ── ErgTargetCommitted ────────────────────────────────────────────────────────

def test_erg_committed_updates_power_and_cadence():
    p = proj()
    v = p.apply(ErgTargetCommitted(power_w=210.0, cadence_rpm=88, t_mono=60.0))
    assert v.erg_committed_power_w == 210.0
    assert v.erg_committed_cadence == 88


def test_erg_committed_no_cadence():
    p = proj()
    v = p.apply(ErgTargetCommitted(power_w=180.0, cadence_rpm=None, t_mono=60.0))
    assert v.erg_committed_cadence is None


# ── RideStarted ───────────────────────────────────────────────────────────────

def test_ride_started_unpauses_and_resets_position():
    p = proj()
    p.apply(PositionAdvanced(position_m=500.0, grade_idx=1, grade_pct=2.0, lap_index=0, t_mono=5.0))
    v = p.apply(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=10.0))
    assert v.paused is False
    assert v.position_m == 0.0
    assert v.route_id == "r1"
    assert v.ride_start_mono == 10.0


def test_ride_started_erg_mode_propagates():
    p = proj()
    v = p.apply(RideStarted(route_id="r2", laps=2, warmup_s=120, cooldown_s=60, erg_mode=True, t_mono=0.0))
    assert v.erg_mode is True


def test_ride_started_can_keep_ride_paused():
    p = proj()
    v = p.apply(RideStarted(route_id="r3", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=0.0, paused=True))
    assert v.paused is True
    assert v.route_id == "r3"


# ── RideEnded ─────────────────────────────────────────────────────────────────

def test_ride_ended_pauses_and_marks_done():
    p = proj()
    p.apply(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=0.0))
    v = p.apply(RideEnded(elapsed_s=1800, t_mono=1800.0))
    assert v.paused is True
    assert v.ride_phase == "done"


# ── RouteLoaded ───────────────────────────────────────────────────────────────

def test_route_loaded_sets_id_and_distance():
    p = proj()
    v = p.apply(RouteLoaded(route_id="alpine", total_dist_m=25_000.0, t_mono=1.0))
    assert v.route_id == "alpine"
    assert v.total_dist_m == 25_000.0


# ── multi-event sequence ──────────────────────────────────────────────────────

def test_full_ride_sequence():
    p = proj()
    p.apply(RouteLoaded(route_id="gran_fondo", total_dist_m=50_000.0, t_mono=0.0))
    p.apply(RideStarted(route_id="gran_fondo", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=1.0))
    p.apply(TelemetryReading(speed_kmh=32.0, power_w=230, cadence_rpm=92.0, t_mono=2.0))
    p.apply(GearShifted(gear=9, direction="up", t_mono=3.0))
    p.apply(PositionAdvanced(position_m=1000.0, grade_idx=2, grade_pct=3.5, lap_index=0, t_mono=4.0))
    v = p.apply(RideEnded(elapsed_s=60, t_mono=61.0))

    assert v.route_id == "gran_fondo"
    assert v.total_dist_m == 50_000.0
    assert v.speed_kmh == 32.0
    assert v.gear == 9
    assert v.position_m == 1000.0
    assert v.paused is True
    assert v.ride_phase == "done"


def test_each_apply_produces_new_view_object():
    """Applying an event must not mutate the old view."""
    p = proj()
    v1 = p.apply(TelemetryReading(speed_kmh=20.0, power_w=150, cadence_rpm=80.0, t_mono=1.0))
    v2 = p.apply(TelemetryReading(speed_kmh=25.0, power_w=180, cadence_rpm=85.0, t_mono=2.0))
    assert v1 is not v2
    assert v1.speed_kmh == 20.0   # old view is unaffected
    assert v2.speed_kmh == 25.0
