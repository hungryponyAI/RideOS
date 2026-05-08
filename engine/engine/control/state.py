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
    # Ride phase machine
    ride_phase: str = "route"  # "warmup" | "route" | "cooldown" | "done"
    lap_index: int = 0
    lap_count: int = 1
    current_grade_idx: int = 0  # written by RouteTracker for erg lookup
    # Erg / target-power mode
    target_power_w: Optional[float] = None  # set by phase machine during warmup/cooldown
    erg_mode: bool = False
    erg_power_table: Optional[tuple] = None   # per-point target watts parallel to grades_pct
    erg_cadence_table: Optional[tuple] = None  # per-point cadence targets (display only)
    # Erg debouncing: committed = currently applied/displayed, pending = scheduled next change
    erg_committed_power_w: Optional[float] = None
    erg_committed_cadence: Optional[int] = None
    erg_pending_power_w: Optional[float] = None
    erg_pending_cadence: Optional[int] = None
    erg_commit_at_monotonic: float = 0.0      # monotonic time when pending becomes committed
    # Phase / ride timing for countdown display
    phase_end_monotonic: Optional[float] = None   # monotonic end time of current warmup/cooldown
    ride_start_monotonic: Optional[float] = None  # monotonic time when the ride was launched
