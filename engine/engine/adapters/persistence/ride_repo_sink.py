"""RideRepoSink — event bus subscriber that persists ride events to SQLite.

Subscribe on_event to every DomainEvent type via the EventBus.
On RideStarted: open a ride row and begin recording.
On each subsequent event: append to ride_events.
On RideEnded: compute summary stats and finalise the ride row.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from engine.domain.events import (
    DomainEvent,
    PositionAdvanced,
    RideEnded,
    RideStarted,
    TelemetryReading,
)

if __package__:
    from engine.ports.repos import RideRepoPort

_log = logging.getLogger("rideos.adapters.persistence.ride_repo_sink")


class RideRepoSink:
    """Listens to the event bus and persists every ride to SQLite."""

    def __init__(self, repo: "RideRepoPort") -> None:
        self._repo = repo
        self._ride_id: Optional[str] = None
        self._seq: int = 0
        self._start_t_mono: float = 0.0
        self._power_samples: list[int] = []
        self._last_position_m: float = 0.0

    @property
    def current_ride_id(self) -> Optional[str]:
        return self._ride_id

    def on_event(self, event: DomainEvent) -> None:
        try:
            self._handle(event)
        except Exception:
            _log.exception("RideRepoSink: failed to handle %s", type(event).__name__)

    def _handle(self, event: DomainEvent) -> None:
        if isinstance(event, RideStarted):
            self._open_ride(event)

        if self._ride_id is None:
            return

        self._append(event)

        if isinstance(event, TelemetryReading) and event.power_w is not None:
            self._power_samples.append(event.power_w)
        elif isinstance(event, PositionAdvanced):
            self._last_position_m = event.position_m
        elif isinstance(event, RideEnded):
            self._close_ride(event)

    def _open_ride(self, event: RideStarted) -> None:
        self._ride_id = str(uuid.uuid4())
        self._seq = 0
        self._start_t_mono = event.t_mono
        self._power_samples = []
        self._last_position_m = 0.0
        started_at = datetime.now(timezone.utc).isoformat()
        self._repo.start_ride(
            ride_id=self._ride_id,
            started_at=started_at,
            route_id=event.route_id,
            laps=event.laps,
            warmup_s=event.warmup_s,
            cooldown_s=event.cooldown_s,
            erg_mode=event.erg_mode,
        )

    def _append(self, event: DomainEvent) -> None:
        t_ms = int((event.t_mono - self._start_t_mono) * 1000)
        payload = json.dumps(dataclasses.asdict(event))
        self._repo.record_event(
            ride_id=self._ride_id,  # type: ignore[arg-type]
            seq=self._seq,
            t_ms=t_ms,
            event_type=type(event).__name__,
            payload=payload,
        )
        self._seq += 1

    def _close_ride(self, event: RideEnded) -> None:
        finished_at = datetime.now(timezone.utc).isoformat()
        avg_pwr = (
            sum(self._power_samples) / len(self._power_samples)
            if self._power_samples else None
        )
        max_pwr = float(max(self._power_samples)) if self._power_samples else None
        self._repo.finish_ride(
            ride_id=self._ride_id,  # type: ignore[arg-type]
            finished_at=finished_at,
            duration_s=float(event.elapsed_s),
            distance_m=self._last_position_m,
            avg_power_w=avg_pwr,
            max_power_w=max_pwr,
        )
        _log.info(
            "RideRepoSink: ride %s persisted — %d events, %.0fs, %.0fm",
            self._ride_id, self._seq, event.elapsed_s, self._last_position_m,
        )
        self._ride_id = None
