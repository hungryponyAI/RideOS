"""Pure position-advance and grade-lookup logic for the route tracker.

These functions are called by the asyncio RouteTracker adapter on every tick.
No I/O, no asyncio, no state — just arithmetic and a bisect lookup.
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass

from engine.domain.physics import PhysicsConfig, PhysicsState, advance_physics


@dataclass(frozen=True)
class CurveConstraint:
    radius_m: float | None
    curvature: float | None
    speed_limit_mps: float | None


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


def curve_constraint_at(
    position_m: float,
    cum_dist_m: tuple[float, ...],
    curve_radius_m: tuple[float | None, ...],
    curve_speed_limit_mps: tuple[float | None, ...],
    *,
    max_unlimited_speed_mps: float = 25.0,
) -> CurveConstraint:
    """Return interpolated precomputed curve limit/radius at route position."""
    if (
        not cum_dist_m
        or len(curve_radius_m) != len(cum_dist_m)
        or len(curve_speed_limit_mps) != len(cum_dist_m)
    ):
        return CurveConstraint(radius_m=None, curvature=None, speed_limit_mps=None)

    idx = bisect.bisect_right(cum_dist_m, position_m) - 1
    idx = max(0, min(idx, len(cum_dist_m) - 1))
    next_idx = min(idx + 1, len(cum_dist_m) - 1)
    if next_idx == idx:
        radius = curve_radius_m[idx]
        cap = curve_speed_limit_mps[idx]
    else:
        d0, d1 = cum_dist_m[idx], cum_dist_m[next_idx]
        t = 0.0 if d1 == d0 else (position_m - d0) / (d1 - d0)
        radius = _interpolate_optional(curve_radius_m[idx], curve_radius_m[next_idx], t)
        cap = _interpolate_cap(
            curve_speed_limit_mps[idx],
            curve_speed_limit_mps[next_idx],
            t,
            max_unlimited_speed_mps,
        )

    if cap is not None and cap >= max_unlimited_speed_mps - 0.05:
        cap = None
    curvature = None if radius is None or radius <= 0.0 else 1.0 / radius
    return CurveConstraint(radius_m=radius, curvature=curvature, speed_limit_mps=cap)


def _interpolate_optional(a: float | None, b: float | None, t: float) -> float | None:
    if a is None and b is None:
        return None
    if a is None:
        return b
    if b is None:
        return a
    return a + (b - a) * t


def _interpolate_cap(
    a: float | None,
    b: float | None,
    t: float,
    max_unlimited_speed_mps: float,
) -> float | None:
    av = max_unlimited_speed_mps if a is None else a
    bv = max_unlimited_speed_mps if b is None else b
    return av + (bv - av) * t
