"""Tests for AutoShiftController — cadence-based auto-shift logic."""
from __future__ import annotations

import time
from dataclasses import replace
from unittest.mock import MagicMock, patch

import pytest

from engine.application.auto_shift import (
    COOLDOWN_S,
    DEBOUNCE_S,
    MANUAL_OVERRIDE_S,
    STARTUP_GRACE_S,
    AutoShiftController,
)
from engine.domain.gears import GearEngine, ShiftMode
from engine.domain.projection import RideStateProjection, RideStateView


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_controller(
    cadence_min: int = 82,
    cadence_max: int = 92,
    mode: ShiftMode = ShiftMode.AUTO,
) -> tuple[AutoShiftController, MagicMock, GearEngine]:
    gear_engine = GearEngine(current_gear=6, mode=mode)
    ride_service = MagicMock()
    ride_service.shift.return_value = 6
    ride_service._athlete = MagicMock()
    ride_service._athlete.ftp_w = 250

    projection = MagicMock()
    projection.view = RideStateView(
        cadence_rpm=88.0,
        power_w=180,
        paused=False,
    )

    t0 = 1000.0
    clock = MagicMock(return_value=t0)

    ctrl = AutoShiftController(
        ride_service=ride_service,
        projection=projection,
        gear_engine=gear_engine,
        cadence_min_rpm=cadence_min,
        cadence_max_rpm=cadence_max,
        clock=clock,
    )
    return ctrl, ride_service, gear_engine


# ---------------------------------------------------------------------------
# Mode guard — only fires in AUTO mode
# ---------------------------------------------------------------------------

def test_no_shift_in_manual_mode():
    ctrl, svc, gears = _make_controller(mode=ShiftMode.MANUAL)
    ctrl._tick()
    svc.shift.assert_not_called()


def test_no_shift_in_cassette_mode():
    ctrl, svc, gears = _make_controller(mode=ShiftMode.CASSETTE)
    ctrl._tick()
    svc.shift.assert_not_called()


# ---------------------------------------------------------------------------
# Debounce — cadence must be out-of-band for DEBOUNCE_S before shift fires
# ---------------------------------------------------------------------------

def test_no_shift_before_debounce_expires():
    ctrl, svc, gears = _make_controller()
    # Cadence above max (92)
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)
    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    # Just past debounce — but cooldown was just reset, so this should still work
    # Let's verify: no shift yet because debounce started tracking
    svc.shift.assert_not_called()


def test_shift_fires_after_debounce():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    # First tick: starts out-of-band tracking at t=1000
    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    svc.shift.assert_not_called()

    # Second tick: DEBOUNCE_S later
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_called_once_with("up", automatic=True)


def test_shift_down_when_cadence_below_min():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=70.0)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_called_once_with("down", automatic=True)


def test_debounce_resets_when_cadence_returns_to_band():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    # Cadence returns to band before debounce expires
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=88.0)
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S - 0.1
    ctrl._tick()
    svc.shift.assert_not_called()


# ---------------------------------------------------------------------------
# Cooldown — no consecutive shifts before COOLDOWN_S
# ---------------------------------------------------------------------------

def test_no_double_shift_within_cooldown():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    assert svc.shift.call_count == 1

    # Immediately after — cooldown in effect
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S + 0.1
    ctrl._tick()
    assert svc.shift.call_count == 1  # still only 1


def test_shift_allowed_after_cooldown():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    assert svc.shift.call_count == 1

    # After cooldown: first tick restarts debounce tracking, second fires
    t2 = 1000.0 + DEBOUNCE_S + COOLDOWN_S + 0.1
    ctrl._clock.return_value = t2
    ctrl._tick()
    assert svc.shift.call_count == 1  # tracking restarted, not fired yet
    ctrl._clock.return_value = t2 + DEBOUNCE_S
    ctrl._tick()
    assert svc.shift.call_count == 2


# ---------------------------------------------------------------------------
# Manual override
# ---------------------------------------------------------------------------

def test_manual_override_suppresses_auto():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    ctrl._clock.return_value = 1000.0
    ctrl.register_manual_shift()

    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_not_called()


def test_auto_resumes_after_manual_override_expires():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0)

    ctrl._clock.return_value = 1000.0
    ctrl.register_manual_shift()

    # After override expires: first tick restarts debounce tracking, second fires
    t2 = 1000.0 + MANUAL_OVERRIDE_S + 0.1
    ctrl._clock.return_value = t2
    ctrl._tick()
    svc.shift.assert_not_called()
    ctrl._clock.return_value = t2 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_called_once_with("up", automatic=True)


# ---------------------------------------------------------------------------
# Paused / startup grace
# ---------------------------------------------------------------------------

def test_no_shift_while_paused():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0, paused=True)
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_not_called()


def test_startup_grace_after_unpause():
    ctrl, svc, gears = _make_controller()
    ctrl._was_paused = True
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0, paused=False)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()  # triggers grace window

    ctrl._clock.return_value = 1000.0 + STARTUP_GRACE_S - 0.1
    ctrl._tick()
    svc.shift.assert_not_called()


def test_shift_allowed_after_startup_grace():
    ctrl, svc, gears = _make_controller()
    ctrl._was_paused = True
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=100.0, paused=False)

    ctrl._clock.return_value = 1000.0
    ctrl._tick()  # sets grace window, _resume_grace_until = 1005

    # First tick after grace: restarts debounce tracking
    t2 = 1000.0 + STARTUP_GRACE_S + 0.1
    ctrl._clock.return_value = t2
    ctrl._tick()
    svc.shift.assert_not_called()
    # Second tick: fires
    ctrl._clock.return_value = t2 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_called_once_with("up", automatic=True)


# ---------------------------------------------------------------------------
# Power safety override
# ---------------------------------------------------------------------------

def test_power_safety_forces_easier_gear():
    ctrl, svc, gears = _make_controller()
    # Power well above 1.5× FTP (250 W → threshold 375 W)
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=88.0, power_w=400)
    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    svc.shift.assert_called_once_with("up", automatic=True)


def test_power_safety_no_shift_at_max_gear():
    ctrl, svc, gears = _make_controller()
    gears.current_gear = 12  # already at easiest
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=88.0, power_w=400)
    ctrl._clock.return_value = 1000.0
    ctrl._tick()
    svc.shift.assert_not_called()


# ---------------------------------------------------------------------------
# Low cadence guard
# ---------------------------------------------------------------------------

def test_no_shift_when_cadence_too_low_to_track():
    ctrl, svc, gears = _make_controller()
    ctrl._proj.view = replace(ctrl._proj.view, cadence_rpm=10.0)
    ctrl._clock.return_value = 1000.0 + DEBOUNCE_S
    ctrl._tick()
    svc.shift.assert_not_called()


# ---------------------------------------------------------------------------
# update_shift_settings
# ---------------------------------------------------------------------------

def test_update_shift_settings_changes_mode():
    from engine.domain.gears import GearEngine, ShiftMode
    from engine.application.ride_service import RideService
    from engine.domain.projection import RideStateProjection
    from engine.ports.eventbus import EventBusPort

    gear_engine = GearEngine(current_gear=6)
    bus = MagicMock(spec=EventBusPort)
    erg = MagicMock()
    proj = MagicMock()
    proj.view = RideStateView()
    athlete = MagicMock()
    athlete.weight_kg = 75.0
    athlete.height_cm = 180.0
    athlete.ftp_w = 250

    from engine.application.ride_service import RideService
    svc = RideService(
        athlete=athlete,
        gear_engine=gear_engine,
        bus=bus,
        erg_debouncer=erg,
        projection=proj,
    )

    assert gear_engine.mode is ShiftMode.MANUAL
    svc.update_shift_settings(mode="cassette")
    assert gear_engine.mode is ShiftMode.CASSETTE
    svc.update_shift_settings(mode="auto")
    assert gear_engine.mode is ShiftMode.AUTO
    svc.update_shift_settings(mode="invalid")  # falls back to MANUAL
    assert gear_engine.mode is ShiftMode.MANUAL


def test_update_shift_settings_updates_cadence_targets():
    ctrl, svc, gears = _make_controller()
    auto_ctrl = MagicMock()
    auto_ctrl.cadence_min_rpm = 82
    auto_ctrl.cadence_max_rpm = 92

    from engine.domain.gears import GearEngine, ShiftMode
    from engine.application.ride_service import RideService
    from engine.ports.eventbus import EventBusPort

    gear_engine = GearEngine(current_gear=6)
    bus = MagicMock(spec=EventBusPort)
    erg = MagicMock()
    proj = MagicMock()
    proj.view = RideStateView()
    athlete = MagicMock()
    athlete.weight_kg = 75.0
    athlete.height_cm = 180.0
    athlete.ftp_w = 250

    ride_svc = RideService(
        athlete=athlete,
        gear_engine=gear_engine,
        bus=bus,
        erg_debouncer=erg,
        projection=proj,
    )
    ride_svc.update_shift_settings(
        mode="auto",
        auto_cadence_min_rpm=75,
        auto_cadence_max_rpm=95,
        auto_shift_controller=auto_ctrl,
    )
    assert auto_ctrl.cadence_min_rpm == 75
    assert auto_ctrl.cadence_max_rpm == 95
