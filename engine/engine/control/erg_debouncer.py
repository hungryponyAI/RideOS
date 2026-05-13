"""ErgDebouncer — owns ERG target power/cadence debouncing state.

In erg mode the control loop wants to track route-derived target power without
flapping every tick: it commits a target, holds it for at least 30 s, and only
then advances. The debouncer keeps the committed value, the pending value, and
the commit-at timestamp. It publishes ErgTargetCommitted on every transition.

This is the only state owner for erg debouncing — RideState no longer carries
those fields after Phase 4.
"""
from __future__ import annotations

from typing import Optional, Sequence

from engine.domain.events import ErgTargetCommitted
from engine.ports.eventbus import EventBusPort

_HOLD_S: float = 30.0
_POWER_EPSILON_W: float = 1.0


class ErgDebouncer:
    """Holds a per-grade-index power/cadence target with a 30 s commit delay."""

    def __init__(self, bus: EventBusPort) -> None:
        self._bus = bus
        self._power_table: Optional[Sequence[float]] = None
        self._cadence_table: Optional[Sequence[Optional[int]]] = None
        self._committed_power_w: Optional[float] = None
        self._committed_cadence: Optional[int] = None
        self._pending_power_w: Optional[float] = None
        self._pending_cadence: Optional[int] = None
        self._commit_at: float = 0.0

    # ── configuration ─────────────────────────────────────────────────────

    def configure(
        self,
        power_table: Sequence[float],
        cadence_table: Optional[Sequence[Optional[int]]],
    ) -> None:
        """Load the per-grade lookup tables at the start of an ERG ride."""
        self._power_table = power_table
        self._cadence_table = cadence_table
        self.reset()

    def reset(self) -> None:
        """Clear committed/pending state — call on ride end or mode exit."""
        self._committed_power_w = None
        self._committed_cadence = None
        self._pending_power_w = None
        self._pending_cadence = None
        self._commit_at = 0.0

    # ── tick / read accessors ─────────────────────────────────────────────

    def tick(self, grade_idx: int, now: float) -> Optional[float]:
        """Advance the debouncer using grade_idx, return currently-commanded power."""
        if self._power_table is None or not self._power_table:
            return None

        idx = min(grade_idx, len(self._power_table) - 1)
        raw_power = self._power_table[idx]
        raw_cadence = self._cadence_table[idx] if self._cadence_table else None

        if self._committed_power_w is None:
            # First tick: commit immediately.
            self._committed_power_w = raw_power
            self._committed_cadence = raw_cadence
            self._pending_power_w = None
            self._pending_cadence = None
            self._commit_at = 0.0
            self._bus.publish(ErgTargetCommitted(
                power_w=raw_power, cadence_rpm=raw_cadence, t_mono=now,
            ))
        elif abs(raw_power - self._committed_power_w) >= _POWER_EPSILON_W:
            if self._pending_power_w is None:
                self._pending_power_w = raw_power
                self._pending_cadence = raw_cadence
                self._commit_at = now + _HOLD_S
            elif now >= self._commit_at:
                self._committed_power_w = self._pending_power_w
                self._committed_cadence = self._pending_cadence
                self._pending_power_w = None
                self._pending_cadence = None
                self._commit_at = 0.0
                self._bus.publish(ErgTargetCommitted(
                    power_w=self._committed_power_w,
                    cadence_rpm=self._committed_cadence,
                    t_mono=now,
                ))
            # else: pending already scheduled, keep waiting
        else:
            # raw matches committed — cancel any pending change.
            self._pending_power_w = None
            self._pending_cadence = None
            self._commit_at = 0.0

        return self._committed_power_w

    @property
    def has_table(self) -> bool:
        return self._power_table is not None and bool(self._power_table)

    @property
    def committed_power_w(self) -> Optional[float]:
        return self._committed_power_w

    @property
    def committed_cadence(self) -> Optional[int]:
        return self._committed_cadence

    @property
    def pending_power_w(self) -> Optional[float]:
        return self._pending_power_w

    @property
    def commit_at(self) -> float:
        return self._commit_at
