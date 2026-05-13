"""Athlete profile — static configuration that does not change during a ride."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AthleteProfile:
    weight_kg: float = 75.0
    height_cm: float = 180.0
    ftp_w: float = 200.0
