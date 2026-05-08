"""Domain tests for engine.domain.gears — imports direct from domain, not the shim."""
import pytest
from engine.domain.gears import GearEngine, _FACTORS


def test_default_gear():
    g = GearEngine()
    assert g.current_gear == 6
    assert g.factor == pytest.approx(0.903)


def test_factor_table_anchors():
    assert _FACTORS[0] == 0.400
    assert _FACTORS[11] == 2.400
    assert len(_FACTORS) == 12


def test_effective_grade():
    g = GearEngine(current_gear=6)
    assert g.effective_grade(6.0) == pytest.approx(6.0 / 0.903)


def test_shift_up_clamps():
    g = GearEngine(current_gear=12)
    assert g.shift_up() == 12


def test_shift_down_clamps():
    g = GearEngine(current_gear=1)
    assert g.shift_down() == 1


def test_shift_sequence():
    g = GearEngine(current_gear=6)
    assert g.shift_up() == 7
    assert g.shift_down() == 6
    assert g.shift_down() == 5


def test_low_gear_amplifies():
    g = GearEngine(current_gear=1)
    assert g.effective_grade(6.0) > 6.0


def test_high_gear_dampens():
    g = GearEngine(current_gear=12)
    assert g.effective_grade(6.0) < 6.0


def test_negative_grade():
    g = GearEngine(current_gear=6)
    assert g.effective_grade(-3.0) < 0
