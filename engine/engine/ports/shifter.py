"""ShifterPort — interface for any gear-shifting input device."""
from __future__ import annotations

import asyncio
from typing import Protocol, runtime_checkable


@runtime_checkable
class ShifterPort(Protocol):
    """Listen for shift events and publish them to the event bus."""

    async def run(self, stop_event: asyncio.Event) -> None:
        """Run the shifter listener until stop_event is set."""
        ...
