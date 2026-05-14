"""Pure cycling physics helpers for virtual route progression."""
from __future__ import annotations

from dataclasses import dataclass
from math import atan, cos, sin


@dataclass(frozen=True)
class PhysicsConfig:
    rider_mass_kg: float
    bike_mass_kg: float = 10.0
    crr: float = 0.004
    air_density_kg_m3: float = 1.225
    cda_m2: float | None = None
    drivetrain_efficiency: float = 0.97
    gravity_ms2: float = 9.80665

    @property
    def total_mass_kg(self) -> float:
        return self.rider_mass_kg + self.bike_mass_kg


@dataclass(frozen=True)
class PhysicsState:
    speed_ms: float


def estimate_cda(weight_kg: float, height_cm: float) -> float:
    """Estimate cyclist CdA in hoods position using Bassett frontal area."""
    h_m = height_cm / 100.0
    frontal_area_m2 = 0.0276 * (h_m**0.725) * (weight_kg**0.425)
    return frontal_area_m2 * 1.15


def resistive_force_n(speed_ms: float, grade_pct: float, config: PhysicsConfig) -> float:
    """Return gravity, rolling, and aerodynamic resistance in newtons."""
    speed = max(0.0, speed_ms)
    slope = grade_pct / 100.0
    theta = atan(slope)
    mass = config.total_mass_kg
    cda = config.cda_m2 if config.cda_m2 is not None else estimate_cda(config.rider_mass_kg, 175.0)

    gravity_n = mass * config.gravity_ms2 * sin(theta)
    rolling_n = config.crr * mass * config.gravity_ms2 * cos(theta)
    aero_n = 0.5 * config.air_density_kg_m3 * cda * speed * speed
    return gravity_n + rolling_n + aero_n


def advance_physics(
    state: PhysicsState,
    power_w: float | None,
    grade_pct: float,
    dt: float,
    config: PhysicsConfig,
) -> PhysicsState:
    """Advance speed by one timestep with a simple semi-implicit Euler step."""
    if dt <= 0.0:
        return PhysicsState(speed_ms=_clamp_speed(state.speed_ms))

    speed = _clamp_speed(state.speed_ms)
    power = max(0.0, power_w or 0.0) * config.drivetrain_efficiency
    drive_force_n = power / max(speed, 1.0)
    net_force_n = drive_force_n - resistive_force_n(speed, grade_pct, config)
    acceleration_ms2 = net_force_n / config.total_mass_kg
    next_speed = speed + acceleration_ms2 * dt
    return PhysicsState(speed_ms=_clamp_speed(next_speed))


def _clamp_speed(speed_ms: float) -> float:
    return min(max(0.0, speed_ms), 30.0)
