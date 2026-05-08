"""ClockPort — injectable clock for deterministic testing."""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class ClockPort(Protocol):
    """Read the current time in monotonic or wall-clock form."""

    def monotonic(self) -> float:
        """Return monotonic time in seconds (same epoch as time.monotonic())."""
        ...

    def wall(self) -> float:
        """Return wall-clock time as a Unix timestamp (same epoch as time.time())."""
        ...
