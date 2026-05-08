"""Domain tests for engine.domain.ftms_codec."""
import pytest
from engine.domain.ftms_codec import (
    ControlPointResponse,
    OpCode,
    ResultCode,
    encode_request_control,
    encode_reset,
    encode_set_simulation_parameters,
    encode_set_target_power,
    encode_start_or_resume,
    encode_stop_or_pause,
    parse_control_point_response,
)


def test_encode_request_control():
    assert encode_request_control() == bytes([0x00])


def test_encode_reset():
    assert encode_reset() == bytes([0x01])


def test_encode_start_or_resume():
    assert encode_start_or_resume() == bytes([0x07])


def test_encode_stop():
    assert encode_stop_or_pause(pause=False) == bytes([0x08, 0x01])


def test_encode_pause():
    assert encode_stop_or_pause(pause=True) == bytes([0x08, 0x02])


def test_encode_set_target_power_100w():
    payload = encode_set_target_power(100)
    assert payload[0] == 0x05
    assert int.from_bytes(payload[1:3], "little") == 100


def test_encode_set_target_power_clamps_negative():
    payload = encode_set_target_power(-50)
    assert int.from_bytes(payload[1:3], "little") == 0


def test_encode_simulation_parameters_zero_grade():
    payload = encode_set_simulation_parameters(0.0)
    assert payload[0] == 0x11
    assert len(payload) == 7


def test_encode_simulation_parameters_5pct_grade():
    payload = encode_set_simulation_parameters(5.0)
    grade_i = int.from_bytes(payload[3:5], "little", signed=True)
    assert grade_i == 500  # 5.0 * 100


def test_parse_control_point_response_success():
    data = bytes([0x80, 0x11, 0x01])
    resp = parse_control_point_response(data)
    assert resp.request_op == OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS
    assert resp.result == ResultCode.SUCCESS


def test_parse_control_point_response_bad_header():
    with pytest.raises(ValueError):
        parse_control_point_response(bytes([0x00, 0x11, 0x01]))


def test_parse_control_point_response_too_short():
    with pytest.raises(ValueError):
        parse_control_point_response(bytes([0x80, 0x11]))
