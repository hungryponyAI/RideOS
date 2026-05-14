"""Offline validation helpers for comparing speed and physics route progression."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from engine.domain.physics import PhysicsConfig, PhysicsState, advance_physics
from engine.domain.route import RouteData
from engine.domain.tracker import advance_position_with_physics, grade_at

PowerProfile = Callable[[float, float, float], float | None]


@dataclass(frozen=True)
class CompletionEstimate:
    mode: str
    completed: bool
    elapsed_s: float
    final_position_m: float
    final_speed_ms: float
    min_speed_ms: float
    max_speed_ms: float


@dataclass(frozen=True)
class CompletionComparison:
    speed_mode: CompletionEstimate
    physics_mode: CompletionEstimate

    @property
    def delta_s(self) -> float | None:
        if not self.speed_mode.completed or not self.physics_mode.completed:
            return None
        return self.physics_mode.elapsed_s - self.speed_mode.elapsed_s


@dataclass(frozen=True)
class EdgeCaseResult:
    name: str
    passed: bool
    detail: str


def constant_power(power_w: float | None) -> PowerProfile:
    return lambda _elapsed_s, _position_m, _grade_pct: power_w


def estimate_speed_mode_completion(
    route: RouteData,
    *,
    speed_kmh: float,
    max_time_s: float = 8 * 3600.0,
) -> CompletionEstimate:
    speed_ms = max(0.0, speed_kmh / 3.6)
    if route.total_dist_m <= 0.0:
        return CompletionEstimate("speed", True, 0.0, 0.0, speed_ms, speed_ms, speed_ms)
    if speed_ms <= 0.0:
        return CompletionEstimate("speed", False, max_time_s, 0.0, 0.0, 0.0, 0.0)

    elapsed_s = route.total_dist_m / speed_ms
    completed = elapsed_s <= max_time_s
    return CompletionEstimate(
        mode="speed",
        completed=completed,
        elapsed_s=min(elapsed_s, max_time_s),
        final_position_m=route.total_dist_m if completed else speed_ms * max_time_s,
        final_speed_ms=speed_ms,
        min_speed_ms=speed_ms,
        max_speed_ms=speed_ms,
    )


def estimate_physics_mode_completion(
    route: RouteData,
    *,
    power_profile: PowerProfile,
    config: PhysicsConfig,
    dt_s: float = 0.25,
    initial_speed_ms: float = 0.0,
    max_time_s: float = 8 * 3600.0,
) -> CompletionEstimate:
    if route.total_dist_m <= 0.0:
        return CompletionEstimate("physics", True, 0.0, 0.0, 0.0, 0.0, 0.0)
    if dt_s <= 0.0:
        raise ValueError("dt_s must be positive")

    elapsed_s = 0.0
    position_m = 0.0
    state = PhysicsState(speed_ms=initial_speed_ms)
    min_speed_ms = state.speed_ms
    max_speed_ms = state.speed_ms

    while elapsed_s < max_time_s and position_m < route.total_dist_m:
        _, grade_pct = grade_at(position_m, route.cum_dist_m, route.grades_pct)
        power_w = power_profile(elapsed_s, position_m, grade_pct)
        position_m, state = advance_position_with_physics(
            position_m,
            state,
            power_w,
            grade_pct,
            dt_s,
            route.total_dist_m,
            config,
        )
        elapsed_s += dt_s
        min_speed_ms = min(min_speed_ms, state.speed_ms)
        max_speed_ms = max(max_speed_ms, state.speed_ms)

    completed = position_m >= route.total_dist_m
    return CompletionEstimate(
        mode="physics",
        completed=completed,
        elapsed_s=elapsed_s,
        final_position_m=position_m,
        final_speed_ms=state.speed_ms,
        min_speed_ms=min_speed_ms,
        max_speed_ms=max_speed_ms,
    )


def compare_completion_times(
    route: RouteData,
    *,
    speed_kmh: float,
    power_w: float,
    config: PhysicsConfig,
    dt_s: float = 0.25,
    initial_speed_ms: float = 0.0,
    max_time_s: float = 8 * 3600.0,
) -> CompletionComparison:
    return CompletionComparison(
        speed_mode=estimate_speed_mode_completion(
            route,
            speed_kmh=speed_kmh,
            max_time_s=max_time_s,
        ),
        physics_mode=estimate_physics_mode_completion(
            route,
            power_profile=constant_power(power_w),
            config=config,
            dt_s=dt_s,
            initial_speed_ms=initial_speed_ms,
            max_time_s=max_time_s,
        ),
    )


def validate_edge_cases(config: PhysicsConfig) -> tuple[EdgeCaseResult, ...]:
    flat_start = PhysicsState(speed_ms=6.0)
    flat_zero = advance_physics(flat_start, power_w=0.0, grade_pct=0.0, dt=2.0, config=config)
    missing_power = advance_physics(flat_start, power_w=None, grade_pct=0.0, dt=2.0, config=config)

    climb_low = advance_physics(
        PhysicsState(speed_ms=4.0), power_w=80.0, grade_pct=12.0, dt=2.0, config=config
    )
    climb_high = advance_physics(
        PhysicsState(speed_ms=4.0), power_w=500.0, grade_pct=12.0, dt=2.0, config=config
    )
    descent_coast = advance_physics(
        PhysicsState(speed_ms=4.0), power_w=0.0, grade_pct=-8.0, dt=2.0, config=config
    )

    return (
        EdgeCaseResult(
            "zero_power_flat_decelerates",
            flat_zero.speed_ms < flat_start.speed_ms,
            f"{flat_start.speed_ms:.2f} -> {flat_zero.speed_ms:.2f} m/s",
        ),
        EdgeCaseResult(
            "missing_power_matches_zero_power",
            missing_power == flat_zero,
            f"missing={missing_power.speed_ms:.2f}, zero={flat_zero.speed_ms:.2f} m/s",
        ),
        EdgeCaseResult(
            "steep_climb_low_power_slows",
            climb_low.speed_ms < 4.0,
            f"4.00 -> {climb_low.speed_ms:.2f} m/s",
        ),
        EdgeCaseResult(
            "steep_climb_high_power_beats_low_power",
            climb_high.speed_ms > climb_low.speed_ms,
            f"low={climb_low.speed_ms:.2f}, high={climb_high.speed_ms:.2f} m/s",
        ),
        EdgeCaseResult(
            "descent_coasting_accelerates",
            descent_coast.speed_ms > 4.0,
            f"4.00 -> {descent_coast.speed_ms:.2f} m/s",
        ),
    )
