"""Immutable read-model projection built from domain events.

RideStateView: frozen snapshot of everything a subscriber needs.
RideStateProjection: accumulates events, always exposes the current view.

Usage:
    proj = RideStateProjection()
    proj.apply(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90, t_mono=1.0))
    view = proj.view   # RideStateView with speed_kmh=30.0, etc.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from engine.domain.events import (
    DomainEvent,
    ErgTargetCommitted,
    GearShifted,
    PositionAdvanced,
    RideEnded,
    RidePauseToggled,
    RidePhaseChanged,
    RideStarted,
    RouteLoaded,
    TelemetryReading,
)


@dataclass(frozen=True)
class RideStateView:
    """Immutable snapshot of the full ride state.

    Never mutate — use RideStateProjection.apply() to obtain a new view.
    """

    # Live telemetry
    speed_kmh: float | None = None
    power_w: int | None = None
    cadence_rpm: float | None = None

    # Virtual gearing
    gear: int = 6

    # Route position
    position_m: float = 0.0
    real_grade_pct: float = 0.0
    grade_idx: int = 0
    lap_index: int = 0
    lap_count: int = 1
    total_dist_m: float | None = None
    route_id: str | None = None

    # Ride lifecycle
    paused: bool = True
    ride_phase: str = "route"
    ride_start_mono: float | None = None
    ride_elapsed_s: float = 0.0
    ride_last_resume_mono: float | None = None
    ended_reason: str | None = None

    # Phase countdown (None when not in a timed phase)
    phase_end_mono: float | None = None

    # ERG mode
    erg_mode: bool = False
    target_power_w: float | None = None
    erg_committed_power_w: float | None = None
    erg_committed_cadence: int | None = None

    def elapsed_s_at(self, now_mono: float) -> float:
        """Return active ride time, excluding setup and paused intervals."""
        if self.ride_start_mono is None:
            return 0.0
        if self.paused or self.ride_last_resume_mono is None:
            return self.ride_elapsed_s
        return self.ride_elapsed_s + max(0.0, now_mono - self.ride_last_resume_mono)


class RideStateProjection:
    """Fold domain events into an immutable RideStateView."""

    def __init__(self) -> None:
        self._view = RideStateView()

    @property
    def view(self) -> RideStateView:
        return self._view

    def apply(self, event: DomainEvent) -> RideStateView:
        """Apply one event and return the updated view (also stored as self.view)."""
        v = self._view

        if isinstance(event, TelemetryReading):
            v = replace(v, speed_kmh=event.speed_kmh, power_w=event.power_w, cadence_rpm=event.cadence_rpm)

        elif isinstance(event, GearShifted):
            v = replace(v, gear=event.gear)

        elif isinstance(event, PositionAdvanced):
            v = replace(
                v,
                position_m=event.position_m,
                real_grade_pct=event.grade_pct,
                grade_idx=event.grade_idx,
                lap_index=event.lap_index,
            )

        elif isinstance(event, RidePhaseChanged):
            v = replace(
                v,
                ride_phase=event.phase,
                target_power_w=event.target_power_w,
                phase_end_mono=event.phase_end_mono,
            )

        elif isinstance(event, ErgTargetCommitted):
            v = replace(v, erg_committed_power_w=event.power_w, erg_committed_cadence=event.cadence_rpm)

        elif isinstance(event, RideStarted):
            v = replace(
                v,
                route_id=event.route_id,
                paused=event.paused,
                erg_mode=event.erg_mode,
                ride_start_mono=event.t_mono,
                ride_elapsed_s=0.0,
                ride_last_resume_mono=None if event.paused else event.t_mono,
                position_m=0.0,
                lap_index=0,
                lap_count=event.laps,
                ended_reason=None,
            )

        elif isinstance(event, RideEnded):
            v = replace(
                v,
                paused=True,
                ride_phase="done",
                ended_reason=event.reason,
                ride_elapsed_s=v.elapsed_s_at(event.t_mono),
                ride_last_resume_mono=None,
            )

        elif isinstance(event, RouteLoaded):
            v = replace(v, route_id=event.route_id, total_dist_m=event.total_dist_m)

        elif isinstance(event, RidePauseToggled):
            if event.paused:
                v = replace(
                    v,
                    paused=True,
                    ride_elapsed_s=v.elapsed_s_at(event.t_mono),
                    ride_last_resume_mono=None,
                )
            else:
                v = replace(v, paused=False, ride_last_resume_mono=event.t_mono)

        self._view = v
        return v
