"""Backward-compat shim — real code lives in engine.domain.ftms_codec."""
from engine.domain.ftms_codec import (  # noqa: F401
    FMCP_UUID,
    FMS_UUID,
    OpCode,
    ResultCode,
    ControlPointResponse,
    encode_request_control,
    encode_reset,
    encode_set_target_power,
    encode_start_or_resume,
    encode_stop_or_pause,
    encode_set_simulation_parameters,
    parse_control_point_response,
)
