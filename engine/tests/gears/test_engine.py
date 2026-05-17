import pytest
from engine.gears.engine import GearEngine, _FACTORS


def test_default_is_middle_gear():
    g = GearEngine()
    assert g.current_gear == 6
    assert g.factor == pytest.approx(1.807)


def test_factor_table_anchors():
    # 12 gears spanning 0.8 → 4.8 (geometric)
    assert _FACTORS[0] == 0.800
    assert _FACTORS[11] == 4.800
    assert len(_FACTORS) == 12


def test_effective_grade_formula():
    g = GearEngine(current_gear=6)
    assert g.effective_grade(6.0) == pytest.approx(6.0 / 1.807)


@pytest.mark.parametrize("gear", list(range(1, 13)))
def test_all_gears_at_6pct(gear):
    g = GearEngine(current_gear=gear)
    assert g.effective_grade(6.0) == pytest.approx(6.0 / _FACTORS[gear - 1])


def test_shift_up_clamps_at_top():
    g = GearEngine(current_gear=12)
    assert g.shift_up() == 12
    assert g.current_gear == 12


def test_shift_down_clamps_at_1():
    g = GearEngine(current_gear=1)
    assert g.shift_down() == 1
    assert g.current_gear == 1


def test_shift_bounds_normal_middle():
    g = GearEngine(current_gear=6)
    assert g.shift_up() == 7
    assert g.shift_down() == 6
    assert g.shift_down() == 5


def test_low_gear_amplifies_grade():
    # factor 0.4 < 1 → effective_grade > real_grade (amplifies the climb)
    g = GearEngine(current_gear=1)
    assert g.effective_grade(6.0) > 6.0


def test_high_gear_dampens_grade():
    # factor 2.4 > 1 → effective_grade < real_grade → feels easier on a climb
    g = GearEngine(current_gear=12)
    assert g.effective_grade(6.0) < 6.0


def test_negative_grade_passes_through():
    g = GearEngine(current_gear=6)
    assert g.effective_grade(-3.0) == pytest.approx(-3.0 / 1.807)
    assert g.effective_grade(-3.0) < 0


def test_custom_factors_override():
    g = GearEngine(current_gear=5, factors=(1.0,) * 12)
    assert g.effective_grade(6.0) == pytest.approx(6.0)
