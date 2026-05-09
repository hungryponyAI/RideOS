"""EventBusPort — interface for the in-process pub/sub event bus."""
from __future__ import annotations

from typing import Any, Callable, Protocol, Type, runtime_checkable

Handler = Callable[[Any], Any]


@runtime_checkable
class EventBusPort(Protocol):
    """Publish domain events and subscribe typed handlers."""

    def subscribe(self, event_type: Type[Any], handler: Handler) -> None:
        """Register handler to be called when event_type is published."""
        ...

    def publish(self, event: Any) -> None:
        """Dispatch event synchronously to all subscribers of its type."""
        ...
