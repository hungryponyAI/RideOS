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

from engine.gears.engine import GearEngine


@dataclass
class RideState:
    gear_engine: GearEngine
    real_grade_percent: float = 0.0
