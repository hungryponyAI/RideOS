"""In-process synchronous event bus for use on the asyncio event loop.

All publish() calls must happen on the event loop thread — no cross-thread
safety is provided. Handlers are called synchronously in the order subscribed.
Exceptions in handlers are caught and logged so one bad handler can't silence
the rest.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Callable, Type

_log = logging.getLogger("rideos.eventbus")

Handler = Callable[[Any], None]


class AsyncioEventBus:
    """Simple synchronous pub/sub bus — the concrete EventBusPort implementation."""

    def __init__(self) -> None:
        self._handlers: dict[type, list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: Type[Any], handler: Handler) -> None:
        """Register handler to be called whenever event_type is published."""
        self._handlers[event_type].append(handler)

    def publish(self, event: Any) -> None:
        """Dispatch event to all handlers registered for its exact type."""
        for handler in self._handlers.get(type(event), []):
            try:
                handler(event)
            except Exception:
                _log.exception("Event handler raised for %s", type(event).__name__)

    def subscriber_count(self, event_type: Type[Any]) -> int:
        """Return how many handlers are registered for event_type (test helper)."""
        return len(self._handlers.get(event_type, []))
