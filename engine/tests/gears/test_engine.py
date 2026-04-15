import pytest
from engine.gears.engine import GearEngine, _FACTORS


def test_default_is_middle_gear():
    g = GearEngine()
    assert g.current_gear == 5
    assert g.factor == pytest.approx(0.892)


def test_factor_table_anchors_match_focus_project():
    # Focus Project.md: G1=0.5, G10=1.8 (exact)
    assert _FACTORS[0] == 0.500
    assert _FACTORS[9] == 1.800
    assert len(_FACTORS) == 10


def test_effective_grade_formula():
    g = GearEngine(current_gear=5)
    assert g.effective_grade(6.0) == pytest.approx(6.0 / 0.892)


@pytest.mark.parametrize("gear", list(range(1, 11)))
def test_all_gears_at_6pct(gear):
    g = GearEngine(current_gear=gear)
    assert g.effective_grade(6.0) == pytest.approx(6.0 / _FACTORS[gear - 1])


def test_shift_up_clamps_at_10():
    g = GearEngine(current_gear=10)
    assert g.shift_up() == 10
    assert g.current_gear == 10


def test_shift_down_clamps_at_1():
    g = GearEngine(current_gear=1)
    assert g.shift_down() == 1
    assert g.current_gear == 1


def test_shift_bounds_normal_middle():
    g = GearEngine(current_gear=5)
    assert g.shift_up() == 6
    assert g.shift_down() == 5
    assert g.shift_down() == 4


def test_low_gear_amplifies_grade():
    # factor 0.5 < 1 → effective_grade > real_grade (amplifies the climb)
    g = GearEngine(current_gear=1)
    assert g.effective_grade(6.0) > 6.0


def test_high_gear_dampens_grade():
    # factor 1.8 > 1 → effective_grade < real_grade → feels easier on a climb
    g = GearEngine(current_gear=10)
    assert g.effective_grade(6.0) < 6.0


def test_negative_grade_passes_through():
    g = GearEngine(current_gear=5)
    assert g.effective_grade(-3.0) == pytest.approx(-3.0 / 0.892)
    assert g.effective_grade(-3.0) < 0


def test_custom_factors_override():
    g = GearEngine(current_gear=5, factors=(1.0,) * 10)
    assert g.effective_grade(6.0) == pytest.approx(6.0)
