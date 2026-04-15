"""Unit tests for FTMS Control Point encoders and response parser.

Byte fixtures from RESEARCH.md Pitfall 2 and Code Examples §FTMS Control Point opcodes.
All tests are pure Python — no BLE dependency.
"""
import pytest

from engine.ftms.control_point import (
    OpCode,
    ResultCode,
    ControlPointResponse,
    encode_request_control,
    encode_reset,
    encode_start_or_resume,
    encode_stop_or_pause,
    encode_set_simulation_parameters,
    parse_control_point_response,
)


def test_encode_request_control():
    assert encode_request_control() == b'\x00'


def test_encode_reset():
    assert encode_reset() == b'\x01'


def test_encode_start_or_resume():
    assert encode_start_or_resume() == b'\x07'


def test_encode_stop_or_pause_default():
    # Default is stop (pause=False) → 0x08 0x01
    assert encode_stop_or_pause() == b'\x08\x01'


def test_encode_stop_or_pause_pause_true():
    # pause=True → 0x08 0x02
    assert encode_stop_or_pause(pause=True) == b'\x08\x02'


def test_encode_grade_zero():
    # grade=0.0 → opcode 0x11, wind sint16 LE = 0x0000, grade sint16 LE = 0x0000, crr=0, cw=0
    assert encode_set_simulation_parameters(0.0) == b'\x11\x00\x00\x00\x00\x00\x00'


def test_encode_grade_positive():
    # grade=5.0 → grade_int = 500 = 0x01f4 LE → bytes[3:5] = b'\xf4\x01'
    assert encode_set_simulation_parameters(5.0) == b'\x11\x00\x00\xf4\x01\x00\x00'


def test_encode_grade_negative():
    # grade=-3.5 → grade_int = -350 = sint16 LE 0xFEA2 → bytes b'\xa2\xfe'
    # Note: RESEARCH.md fixture '5e fe' is a documentation typo; -350 LE is a2 fe.
    assert encode_set_simulation_parameters(-3.5) == b'\x11\x00\x00\xa2\xfe\x00\x00'


def test_encode_grade_clamp_high():
    # grade=500.0 exceeds max +327.67 → grade_int clamped to 32767
    result = encode_set_simulation_parameters(500.0)
    assert result[3:5] == (32767).to_bytes(2, 'little', signed=True)


def test_encode_grade_clamp_low():
    # grade=-500.0 below min -327.68 → grade_int clamped to -32768
    result = encode_set_simulation_parameters(-500.0)
    assert result[3:5] == (-32768).to_bytes(2, 'little', signed=True)


def test_parse_response_success():
    # 0x80 = RESPONSE header, 0x00 = REQUEST_CONTROL opcode, 0x01 = SUCCESS
    result = parse_control_point_response(b'\x80\x00\x01')
    assert result == ControlPointResponse(OpCode.REQUEST_CONTROL, ResultCode.SUCCESS)


def test_parse_response_not_permitted():
    # 0x80 0x00 0x05 = RESPONSE to REQUEST_CONTROL with CONTROL_NOT_PERMITTED
    result = parse_control_point_response(b'\x80\x00\x05')
    assert result.result == ResultCode.CONTROL_NOT_PERMITTED


def test_parse_response_malformed_empty():
    with pytest.raises(ValueError):
        parse_control_point_response(b'')


def test_parse_response_malformed_wrong_header():
    # First byte must be 0x80 (RESPONSE opcode)
    with pytest.raises(ValueError):
        parse_control_point_response(b'\x7f\x00\x01')


def test_parse_response_accepts_bytearray():
    # bleak delivers bytearray — must work identically to bytes
    result = parse_control_point_response(bytearray(b'\x80\x00\x01'))
    assert result == ControlPointResponse(OpCode.REQUEST_CONTROL, ResultCode.SUCCESS)
