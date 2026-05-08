"""FTMS Fitness Machine Control Point encoders + response parser.

Hand-rolled per Phase 1 policy (no pycycling dep). Source: Bluetooth SIG
FTMS v1.0 §4.16 + pycycling ftms_parsers/control_point.py.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass

FMCP_UUID = "00002ad9-0000-1000-8000-00805f9b34fb"  # Fitness Machine Control Point
FMS_UUID  = "00002ada-0000-1000-8000-00805f9b34fb"  # Fitness Machine Status


class OpCode(enum.IntEnum):
    REQUEST_CONTROL                       = 0x00
    RESET                                 = 0x01
    SET_TARGET_POWER                      = 0x05
    START_OR_RESUME                       = 0x07
    STOP_OR_PAUSE                         = 0x08
    SET_INDOOR_BIKE_SIMULATION_PARAMETERS = 0x11
    RESPONSE                              = 0x80


class ResultCode(enum.IntEnum):
    SUCCESS               = 0x01
    NOT_SUPPORTED         = 0x02
    INCORRECT_PARAMETER   = 0x03
    OPERATION_FAILED      = 0x04
    CONTROL_NOT_PERMITTED = 0x05


def encode_request_control() -> bytes:
    return bytes([OpCode.REQUEST_CONTROL])


def encode_reset() -> bytes:
    return bytes([OpCode.RESET])


def encode_set_target_power(watts: int) -> bytes:
    """Opcode 0x05. Byte layout: <B H>
      opcode   uint8   0x05
      power    uint16  unit 1 W, little-endian
    """
    w = max(0, min(65535, watts))
    return bytes([OpCode.SET_TARGET_POWER]) + w.to_bytes(2, "little")


def encode_start_or_resume() -> bytes:
    return bytes([OpCode.START_OR_RESUME])


def encode_stop_or_pause(pause: bool = False) -> bytes:
    # 0x01 = stop, 0x02 = pause. INFRA-02 shutdown always uses stop (pause=False).
    return bytes([OpCode.STOP_OR_PAUSE, 0x02 if pause else 0x01])


def encode_set_simulation_parameters(
    grade_percent: float,
    wind_speed_mps: float = 0.0,
    crr: float = 0.0,
    cw: float = 0.0,
) -> bytes:
    """Opcode 0x11. Byte layout: <B h h B B>
      opcode  uint8   0x11
      wind    sint16  units 0.001 m/s   little-endian
      grade   sint16  units 0.01 %      little-endian
      crr     uint8   units 0.0001
      cw      uint8   units 0.01 kg/m
    Phase 2 only varies grade; wind/crr/cw are sent as 0.
    """
    grade = max(-327.68, min(327.67, grade_percent))
    wind  = max(-32.768, min(32.767, wind_speed_mps))
    crr_u = max(0, min(255, round(crr / 0.0001)))
    cw_u  = max(0, min(255, round(cw  / 0.01)))
    wind_i  = round(wind  * 1000)
    grade_i = round(grade *  100)
    return (
        bytes([OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS])
        + wind_i.to_bytes(2, "little", signed=True)
        + grade_i.to_bytes(2, "little", signed=True)
        + bytes([crr_u, cw_u])
    )


@dataclass(frozen=True)
class ControlPointResponse:
    request_op: OpCode
    result: ResultCode


def parse_control_point_response(data: bytes | bytearray) -> ControlPointResponse:
    """Parse an FMCP indication: 0x80 <req_op> <result> [extra...]."""
    buf = bytes(data)
    if len(buf) < 3 or buf[0] != OpCode.RESPONSE:
        raise ValueError(f"Unexpected FMCP indication: {buf.hex()}")
    return ControlPointResponse(
        request_op=OpCode(buf[1]),
        result=ResultCode(buf[2]),
    )
