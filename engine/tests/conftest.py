"""Shared fixtures for RideOS engine tests.

IBD = FTMS Indoor Bike Data characteristic (0x2AD2) byte payloads.
Flag semantics (uint16 LE at offset 0):
  bit 0 (0x0001): More Data — INVERTED for IBD. Speed present when bit CLEAR.
  bit 2 (0x0004): Instantaneous Cadence present
  bit 6 (0x0040): Instantaneous Power present
Field encodings (little-endian):
  Speed:   uint16, units 0.01 km/h
  Cadence: uint16, units 0.5 rpm
  Power:   int16 SIGNED, units 1 W
"""
import struct

import pytest


def _pack_flags(flags: int) -> bytes:
    return struct.pack("<H", flags)


@pytest.fixture
def ibd_speed_only() -> bytes:
    """flags=0x0000 (bit 0 CLEAR → speed present). speed=12.34 km/h."""
    return _pack_flags(0x0000) + struct.pack("<H", 1234)


@pytest.fixture
def ibd_speed_cadence_power() -> bytes:
    """flags bits 0=clear, 2=set, 6=set. speed=25.00, cadence=90.0, power=250."""
    flags = 0x0044  # bit 2 | bit 6; bit 0 CLEAR means speed is present
    return (
        _pack_flags(flags)
        + struct.pack("<H", 2500)   # speed raw
        + struct.pack("<H", 180)    # cadence raw = 90.0 rpm
        + struct.pack("<h", 250)    # power raw (signed)
    )


@pytest.fixture
def ibd_no_speed() -> bytes:
    """flags=0x0001 (bit 0 SET → speed ABSENT). Payload is flags-only."""
    return _pack_flags(0x0001)


@pytest.fixture
def ibd_power_negative() -> bytes:
    """flags=0x0040 (bit 0 CLEAR → speed; bit 6 SET → power). power=-50."""
    flags = 0x0040
    return (
        _pack_flags(flags)
        + struct.pack("<H", 0)      # speed raw = 0.00 km/h
        + struct.pack("<h", -50)    # power raw = -50 W (signed)
    )


@pytest.fixture
def ibd_cadence_only_scaling() -> bytes:
    """flags bits 0=set (no speed), 2=set (cadence). cadence raw=241 → 120.5 rpm."""
    flags = 0x0001 | 0x0004
    return _pack_flags(flags) + struct.pack("<H", 241)
