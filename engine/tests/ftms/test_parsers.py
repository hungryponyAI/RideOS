"""Unit tests for FTMS Indoor Bike Data parser."""
import pytest

from engine.ftms.parsers import parse_indoor_bike_data


def test_speed_flag_inverted_present(ibd_speed_only):
    result = parse_indoor_bike_data(ibd_speed_only)
    assert result.speed_kmh == pytest.approx(12.34)
    assert result.cadence_rpm is None
    assert result.power_watts is None


def test_speed_flag_inverted_absent(ibd_no_speed):
    result = parse_indoor_bike_data(ibd_no_speed)
    assert result.speed_kmh is None


def test_cadence_scaling(ibd_cadence_only_scaling):
    result = parse_indoor_bike_data(ibd_cadence_only_scaling)
    assert result.speed_kmh is None
    assert result.cadence_rpm == pytest.approx(120.5)


def test_power_signed_int16(ibd_power_negative):
    result = parse_indoor_bike_data(ibd_power_negative)
    assert result.power_watts == -50


def test_all_three_fields_present(ibd_speed_cadence_power):
    result = parse_indoor_bike_data(ibd_speed_cadence_power)
    assert result.speed_kmh == pytest.approx(25.0)
    assert result.cadence_rpm == pytest.approx(90.0)
    assert result.power_watts == 250
