"""RouteTracker asyncio adapter — advances position along a GPX route (ROUTE-02 + ROUTE-03).

Pure position math lives in engine.domain.tracker. This module owns the
asyncio loop, the clock, and publishes PositionAdvanced events.

Key invariants:
- Only this task publishes PositionAdvanced once a route is loaded.
- position_m is monotonically non-decreasing until route completion.
- No BLE/WS/FTMS imports — testable with a plain speed_fn callable.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import TYPE_CHECKING, Callable, Optional

from engine.domain.events import PositionAdvanced
from engine.domain.physics import PhysicsConfig, PhysicsState, advance_physics
from engine.domain.tracker import CurveConstraint, advance_position, curve_constraint_at, grade_at
from engine.route.model import RouteData

if TYPE_CHECKING:
    from engine.ports.eventbus import EventBusPort

_log = logging.getLogger("rideos.route")

ROUTE_COMPLETE_GRADE: float = 0.0
_ROUTE_END_EPSILON_M: float = 0.5
_MAX_VIRTUAL_ACCEL_MPS2: float = 1.0
_MAX_VIRTUAL_DECEL_MPS2: float = 1.5
_CURVE_LOOKAHEAD_MIN_M: float = 20.0
_CURVE_LOOKAHEAD_MAX_M: float = 80.0


class RouteTracker:
    """Advances position along a RouteData and publishes PositionAdvanced events."""

    def __init__(
        self,
        route: RouteData,
        on_complete: Optional[Callable[[int], None]] = None,
        laps: int = 1,
        bus: Optional["EventBusPort"] = None,
        physics_config: PhysicsConfig | None = None,
        initial_speed_ms: float = 0.0,
    ) -> None:
        self._route = route
        self._position_m: float = 0.0
        self._on_complete = on_complete
        self._laps = max(1, laps)
        self._lap_index: int = 0
        self._bus = bus
        self._physics_config = physics_config
        self._physics_state = PhysicsState(speed_ms=initial_speed_ms)
        self._virtual_speed_ms: float = initial_speed_ms
        self._has_virtual_speed = initial_speed_ms > 0.0
        self._curve_limited_active = False
        self._last_physics_debug_s: float = 0.0
        self._physics_debug_enabled = _env_truthy("RIDEOS_PHYSICS_DEBUG")

    @property
    def position_m(self) -> float:
        return self._position_m

    async def run(
        self,
        speed_fn: Callable[[], Optional[float]],
        stop_event: asyncio.Event,
        *,
        tick_s: float = 0.25,
        power_fn: Callable[[], Optional[float]] | None = None,
    ) -> None:
        """Main tracker loop. Exits when stop_event fires OR all laps complete.

        speed_fn: returns current speed in km/h (or None when no reading yet).
        """
        last_t = time.monotonic()
        start_t = time.monotonic()
        self._lap_index = 0

        while not stop_event.is_set():
            now = time.monotonic()
            dt = now - last_t
            last_t = now

            if self._physics_config is not None and power_fn is not None:
                _, current_grade = grade_at(
                    self._position_m,
                    self._route.cum_dist_m,
                    self._route.grades_pct,
                )
                self._physics_state = advance_physics(
                    self._physics_state,
                    power_w=power_fn(),
                    grade_pct=current_grade,
                    dt=dt,
                    config=self._physics_config,
                )
                physics_speed_ms = self._physics_state.speed_ms
                curve_constraint = self._curve_constraint_for_speed(physics_speed_ms)
                virtual_speed_ms = self._derive_virtual_speed(
                    physics_speed_ms,
                    curve_constraint.speed_limit_mps,
                    dt,
                )
                self._position_m = advance_position(
                    self._position_m,
                    virtual_speed_ms,
                    dt,
                    self._route.total_dist_m,
                )
                self._log_physics_debug(
                    now,
                    physics_speed_ms,
                    curve_constraint,
                    virtual_speed_ms,
                )
            else:
                speed_ms = max(0.0, (speed_fn() or 0.0) / 3.6)
                curve_constraint = self._curve_constraint_for_speed(speed_ms)
                virtual_speed_ms = self._derive_virtual_speed(
                    speed_ms,
                    curve_constraint.speed_limit_mps,
                    dt,
                )
                self._position_m = advance_position(
                    self._position_m, virtual_speed_ms, dt, self._route.total_dist_m
                )

            if self._position_m >= self._route.total_dist_m - _ROUTE_END_EPSILON_M:
                self._lap_index += 1
                if self._lap_index >= self._laps:
                    elapsed_s = int(now - start_t)
                    _log.info(
                        "Route complete: %d lap(s) in %ds",
                        self._laps,
                        elapsed_s,
                    )
                    if self._bus is not None:
                        self._bus.publish(PositionAdvanced(
                            position_m=self._route.total_dist_m,
                            grade_idx=0,
                            grade_pct=ROUTE_COMPLETE_GRADE,
                            lap_index=self._lap_index,
                            t_mono=now,
                        ))
                    if self._on_complete is not None:
                        self._on_complete(elapsed_s)
                    return
                self._position_m = 0.0
                _log.info("Lap %d/%d complete; restarting from 0", self._lap_index, self._laps)

            idx, grade = grade_at(
                self._position_m,
                self._route.cum_dist_m,
                self._route.grades_pct,
            )

            if self._bus is not None:
                self._bus.publish(PositionAdvanced(
                    position_m=self._position_m,
                    grade_idx=idx,
                    grade_pct=grade,
                    lap_index=self._lap_index,
                    t_mono=now,
                ))

            await asyncio.sleep(tick_s)

    def _curve_constraint_for_speed(self, speed_ms: float) -> CurveConstraint:
        current = curve_constraint_at(
            self._position_m,
            self._route.cum_dist_m,
            self._route.curve_radius_m,
            self._route.curve_speed_limit_mps,
        )
        lookahead_m = min(
            _CURVE_LOOKAHEAD_MAX_M,
            max(_CURVE_LOOKAHEAD_MIN_M, max(0.0, speed_ms) * 4.0),
        )
        ahead = curve_constraint_at(
            min(self._route.total_dist_m, self._position_m + lookahead_m),
            self._route.cum_dist_m,
            self._route.curve_radius_m,
            self._route.curve_speed_limit_mps,
        )
        return _stricter_curve_constraint(current, ahead)

    def _derive_virtual_speed(
        self,
        physical_speed_ms: float,
        curve_limit_mps: float | None,
        dt: float,
    ) -> float:
        if not self._has_virtual_speed:
            self._virtual_speed_ms = physical_speed_ms
            self._has_virtual_speed = True

        if curve_limit_mps is not None and physical_speed_ms > curve_limit_mps:
            target_speed = min(physical_speed_ms, curve_limit_mps)
            self._virtual_speed_ms = _ramp_speed(
                self._virtual_speed_ms,
                target_speed,
                dt,
                accel_mps2=_MAX_VIRTUAL_ACCEL_MPS2,
                decel_mps2=_MAX_VIRTUAL_DECEL_MPS2,
            )
            self._curve_limited_active = True
            return self._virtual_speed_ms

        if self._curve_limited_active and self._virtual_speed_ms < physical_speed_ms:
            self._virtual_speed_ms = _ramp_speed(
                self._virtual_speed_ms,
                physical_speed_ms,
                dt,
                accel_mps2=_MAX_VIRTUAL_ACCEL_MPS2,
                decel_mps2=_MAX_VIRTUAL_DECEL_MPS2,
            )
            if physical_speed_ms - self._virtual_speed_ms < 0.05:
                self._curve_limited_active = False
                self._virtual_speed_ms = physical_speed_ms
            return self._virtual_speed_ms

        self._curve_limited_active = False
        self._virtual_speed_ms = physical_speed_ms
        return self._virtual_speed_ms

    def _log_physics_debug(
        self,
        now: float,
        physics_speed_ms: float,
        curve_constraint: CurveConstraint,
        derived_speed_ms: float,
    ) -> None:
        if not self._physics_debug_enabled and not _log.isEnabledFor(logging.DEBUG):
            return
        if now - self._last_physics_debug_s < 1.0:
            return
        self._last_physics_debug_s = now
        limit = curve_constraint.speed_limit_mps
        radius = curve_constraint.radius_m
        curvature = curve_constraint.curvature
        log_fn = _log.info if self._physics_debug_enabled else _log.debug
        log_fn(
            "PHYSICS | physics_v=%.2fm/s %.1fkm/h curve_limit=%s radius=%s curvature=%s derived_v=%.2fm/s %.1fkm/h",
            physics_speed_ms,
            physics_speed_ms * 3.6,
            "none" if limit is None else f"{limit:.2f}m/s {limit * 3.6:.1f}km/h",
            "none" if radius is None else f"{radius:.1f}m",
            "none" if curvature is None else f"{curvature:.4f}1/m",
            derived_speed_ms,
            derived_speed_ms * 3.6,
        )


def _stricter_curve_constraint(a: CurveConstraint, b: CurveConstraint) -> CurveConstraint:
    if a.speed_limit_mps is None:
        return b
    if b.speed_limit_mps is None:
        return a
    return a if a.speed_limit_mps <= b.speed_limit_mps else b


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _ramp_speed(
    current_ms: float,
    target_ms: float,
    dt: float,
    *,
    accel_mps2: float,
    decel_mps2: float,
) -> float:
    if dt <= 0.0:
        return max(0.0, current_ms)
    current = max(0.0, current_ms)
    target = max(0.0, target_ms)
    if target > current:
        return min(target, current + accel_mps2 * dt)
    if target < current:
        return max(target, current - decel_mps2 * dt)
    return current
