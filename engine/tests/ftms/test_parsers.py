"""Unit tests for FTMS Indoor Bike Data parser.

All tests marked xfail until engine.ftms.parsers.parse_indoor_bike_data
lands in plan 02. They MUST exist in wave 0 so wave 1 has a failing test
to turn green (RED → GREEN per VALIDATION.md).
"""
import pytest

# Parser imported lazily inside each test so collection works before
# the module exists. Downstream plan 02 creates engine/engine/ftms/parsers.py.


def _parse(data: bytes):
    from engine.ftms.parsers import parse_indoor_bike_data

    return parse_indoor_bike_data(data)


@pytest.mark.xfail(strict=True, reason="parse_indoor_bike_data ships in plan 02")
def test_speed_flag_inverted_present(ibd_speed_only):
    result = _parse(ibd_speed_only)
    assert result.speed_kmh == pytest.approx(12.34)
    assert result.cadence_rpm is None
    assert result.power_watts is None


@pytest.mark.xfail(strict=True, reason="parse_indoor_bike_data ships in plan 02")
def test_speed_flag_inverted_absent(ibd_no_speed):
    result = _parse(ibd_no_speed)
    assert result.speed_kmh is None


@pytest.mark.xfail(strict=True, reason="parse_indoor_bike_data ships in plan 02")
def test_cadence_scaling(ibd_cadence_only_scaling):
    result = _parse(ibd_cadence_only_scaling)
    assert result.speed_kmh is None
    assert result.cadence_rpm == pytest.approx(120.5)


@pytest.mark.xfail(strict=True, reason="parse_indoor_bike_data ships in plan 02")
def test_power_signed_int16(ibd_power_negative):
    result = _parse(ibd_power_negative)
    assert result.power_watts == -50


@pytest.mark.xfail(strict=True, reason="parse_indoor_bike_data ships in plan 02")
def test_all_three_fields_present(ibd_speed_cadence_power):
    result = _parse(ibd_speed_cadence_power)
    assert result.speed_kmh == pytest.approx(25.0)
    assert result.cadence_rpm == pytest.approx(90.0)
    assert result.power_watts == 250
