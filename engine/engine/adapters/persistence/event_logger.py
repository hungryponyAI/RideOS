"""In-memory event log for debugging and testing.

Enable at runtime by setting RIDEOS_EVENT_LOG=1.
Phase 5 will replace this with a SQLite-backed sink.
"""
from __future__ import annotations

from typing import Sequence

from engine.domain.events import DomainEvent


class InMemoryEventLog:
    def __init__(self) -> None:
        self._events: list[DomainEvent] = []

    def record(self, event: DomainEvent) -> None:
        self._events.append(event)

    @property
    def events(self) -> Sequence[DomainEvent]:
        return list(self._events)

    def __len__(self) -> int:
        return len(self._events)
