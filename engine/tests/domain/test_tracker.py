"""Domain tests for engine.domain.tracker — pure position and grade functions."""
import pytest
from engine.domain.tracker import advance_position, grade_at

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
