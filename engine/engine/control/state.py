"""Shared ride state read by run_control_loop on every tick.

Mutated by:
- KeyboardShifter (via GearEngine.shift_up/down)
- (Phase 3) WebSocket bridge — will mutate real_grade_percent / gear directly
- (Phase 4) GPX position tracker — will mutate real_grade_percent

Read by:
- run_control_loop (only)  — writes to the trainer
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from engine.gears.engine import GearEngine


@dataclass
class RideState:
    gear_engine: GearEngine
    real_grade_percent: float = 0.0
    last_speed_kmh: Optional[float] = None
    last_power_w: Optional[float] = None
    last_cadence_rpm: Optional[float] = None
    athlete_weight_kg: float = 75.0
    athlete_height_cm: float = 180.0
    athlete_ftp_w: float = 200.0
    paused: bool = True  # starts paused; UI sends set_paused:false on play
