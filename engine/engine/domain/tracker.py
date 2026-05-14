"""Pure position-advance and grade-lookup logic for the route tracker.

These functions are called by the asyncio RouteTracker adapter on every tick.
No I/O, no asyncio, no state — just arithmetic and a bisect lookup.
"""
from __future__ import annotations

import bisect

from engine.domain.physics import PhysicsConfig, PhysicsState, advance_physics


def advance_position(
    position_m: float,
    speed_ms: float,
    dt: float,
    total_dist_m: float,
) -> float:
    """Return new position along the route, clamped to total_dist_m."""
    return min(position_m + speed_ms * dt, total_dist_m)


def advance_position_with_physics(
    position_m: float,
    physics_state: PhysicsState,
    power_w: float | None,
    grade_pct: float,
    dt: float,
    total_dist_m: float,
    config: PhysicsConfig,
) -> tuple[float, PhysicsState]:
    """Return route position and physics state after one power-based tick."""
    next_state = advance_physics(
        physics_state,
        power_w=power_w,
        grade_pct=grade_pct,
        dt=dt,
        config=config,
    )
    next_position = advance_position(position_m, next_state.speed_ms, dt, total_dist_m)
    return next_position, next_state


def grade_at(
    position_m: float,
    cum_dist_m: tuple[float, ...],
    grades_pct: tuple[float, ...],
) -> tuple[int, float]:
    """Return (grade_idx, grade_pct) for the given position along the route."""
    idx = bisect.bisect_right(cum_dist_m, position_m) - 1
    idx = max(0, min(idx, len(grades_pct) - 1))
    return idx, grades_pct[idx]
