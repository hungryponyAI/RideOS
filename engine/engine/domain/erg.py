"""Erg-mode target power and cadence tables derived from route grade profile + FTP."""
from __future__ import annotations

# (lo_pct, hi_pct, ftp_factor)
_POWER_BUCKETS: list[tuple[float, float, float]] = [
    (-999.0, -2.0, 0.50),
    (  -2.0,  0.0, 0.65),
    (   0.0,  3.0, 0.85),
    (   3.0,  6.0, 1.00),
    (   6.0,  9.0, 1.10),
    (   9.0, 999.0, 1.20),
]

# (lo_pct, hi_pct, cadence_rpm)
_CADENCE_BUCKETS: list[tuple[float, float, int]] = [
    (-999.0,  0.0, 90),
    (   0.0,  3.0, 85),
    (   3.0,  6.0, 80),
    (   6.0,  9.0, 75),
    (   9.0, 999.0, 70),
]


def _ftp_factor(grade_pct: float) -> float:
    for lo, hi, factor in _POWER_BUCKETS:
        if lo <= grade_pct < hi:
            return factor
    return 1.20


def _cadence(grade_pct: float) -> int:
    for lo, hi, rpm in _CADENCE_BUCKETS:
        if lo <= grade_pct < hi:
            return rpm
    return 70


def compute_target_power_table(
    grades_pct: tuple[float, ...],
    ftp_w: float,
) -> tuple[float, ...]:
    """Return per-point target watts parallel to grades_pct."""
    return tuple(_ftp_factor(g) * ftp_w for g in grades_pct)


def compute_cadence_table(grades_pct: tuple[float, ...]) -> tuple[int, ...]:
    """Return per-point cadence target (rpm) parallel to grades_pct."""
    return tuple(_cadence(g) for g in grades_pct)
