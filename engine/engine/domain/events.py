"""Domain events — every meaningful state change is one of these frozen dataclasses.

Adapters publish events; the projection and any subscriber consume them.
Every event carries t_mono (monotonic clock) for replay and debugging.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union


@dataclass(frozen=True)
class TelemetryReading:
    """Raw telemetry snapshot received from the KICKR via BLE."""

    speed_kmh: float | None
    power_w: int | None
    cadence_rpm: float | None
    t_mono: float


@dataclass(frozen=True)
class GearShifted:
    """Gear change triggered by shifter or keyboard — carries the resulting gear."""

    gear: int
    direction: Literal["up", "down"]
    t_mono: float


@dataclass(frozen=True)
class PositionAdvanced:
    """Route tracker advanced the rider's position by one tick."""

    position_m: float
    grade_idx: int
    grade_pct: float
    lap_index: int
    t_mono: float


@dataclass(frozen=True)
class RidePhaseChanged:
    """Phase machine transitioned to a new phase."""

    phase: Literal["warmup", "route", "cooldown", "done"]
    target_power_w: float | None
    phase_end_mono: float | None
    t_mono: float


@dataclass(frozen=True)
class ErgTargetCommitted:
    """ERG debouncer committed a new target after the 30 s holdoff."""

    power_w: float
    cadence_rpm: int | None
    t_mono: float


@dataclass(frozen=True)
class RideStarted:
    """Ride began — start_ride handler completed setup."""

    route_id: str
    laps: int
    warmup_s: int
    cooldown_s: int
    erg_mode: bool
    t_mono: float


@dataclass(frozen=True)
class RideEnded:
    """Ride stopped — user action or phase machine reached 'done'."""

    elapsed_s: int
    t_mono: float


@dataclass(frozen=True)
class RouteLoaded:
    """A route was selected and loaded into the active context."""

    route_id: str
    total_dist_m: float
    t_mono: float


DomainEvent = Union[
    TelemetryReading,
    GearShifted,
    PositionAdvanced,
    RidePhaseChanged,
    ErgTargetCommitted,
    RideStarted,
    RideEnded,
    RouteLoaded,
]
