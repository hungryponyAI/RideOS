"""FTMS Indoor Bike Data characteristic (0x2AD2) parser.

Spec: Bluetooth SIG FTMS v1.0 §4.9 Indoor Bike Data.
Reference: pycycling ftms_parsers/indoor_bike_data.py (read-only).

Byte layout (all little-endian):
  offset 0..1: flags uint16
  optional fields in this order, each present per its flag bit:
    speed           uint16, 0.01 km/h  — present when bit 0 CLEAR (INVERTED!)
    avg speed       uint16             — bit 1
    cadence         uint16, 0.5 rpm    — bit 2
    avg cadence     uint16             — bit 3
    total distance  uint24 (3 bytes)   — bit 4
    resistance      int16              — bit 5
    power inst.     int16, 1 W signed  — bit 6
    ... (bits 7-12 ignored for Phase 1)
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Optional

# Flag bit masks
_FLAG_MORE_DATA_SPEED_ABSENT = 0x0001   # INVERTED: set = speed absent
_FLAG_AVG_SPEED              = 0x0002
_FLAG_INST_CADENCE           = 0x0004
_FLAG_AVG_CADENCE            = 0x0008
_FLAG_TOTAL_DISTANCE         = 0x0010
_FLAG_RESISTANCE             = 0x0020
_FLAG_INST_POWER             = 0x0040


@dataclass(frozen=True)
class IndoorBikeData:
    """Parsed FTMS Indoor Bike Data payload. Any field may be None if not transmitted."""

    speed_kmh: Optional[float] = None
    cadence_rpm: Optional[float] = None
    power_watts: Optional[int] = None


def parse_indoor_bike_data(data: bytes | bytearray) -> IndoorBikeData:
    """Parse an FTMS Indoor Bike Data characteristic notification payload.

    Raises:
        struct.error: if the payload is truncated relative to its flags.
    """
    buf = bytes(data)
    flags = struct.unpack_from("<H", buf, 0)[0]
    offset = 2

    speed_kmh: Optional[float] = None
    cadence_rpm: Optional[float] = None
    power_watts: Optional[int] = None

    # Bit 0 is INVERTED for Indoor Bike Data: speed present when CLEAR.
    if not (flags & _FLAG_MORE_DATA_SPEED_ABSENT):
        raw = struct.unpack_from("<H", buf, offset)[0]
        speed_kmh = raw / 100.0
        offset += 2

    if flags & _FLAG_AVG_SPEED:
        offset += 2  # skip avg speed

    if flags & _FLAG_INST_CADENCE:
        raw = struct.unpack_from("<H", buf, offset)[0]
        cadence_rpm = raw / 2.0
        offset += 2

    if flags & _FLAG_AVG_CADENCE:
        offset += 2  # skip avg cadence

    if flags & _FLAG_TOTAL_DISTANCE:
        offset += 3  # total distance is 3 bytes (uint24 LE)

    if flags & _FLAG_RESISTANCE:
        offset += 2  # skip resistance

    if flags & _FLAG_INST_POWER:
        # SIGNED int16 — use "<h" not "<H". Negative values are valid (e.g., braking).
        power_watts = struct.unpack_from("<h", buf, offset)[0]
        offset += 2

    # Bits 7..12 (avg power, energy, HR, MET, elapsed, remaining) ignored for Phase 1.
    return IndoorBikeData(
        speed_kmh=speed_kmh,
        cadence_rpm=cadence_rpm,
        power_watts=power_watts,
    )
