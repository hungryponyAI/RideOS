"""TrainerPort — interface for any FTMS-compatible smart trainer."""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class TrainerPort(Protocol):
    """Send resistance commands to the trainer and receive BLE notifications."""

    async def set_grade(self, grade_pct: float) -> None:
        """Set simulated road grade in percent (negative = downhill)."""
        ...

    async def set_target_power(self, power_w: float) -> None:
        """Set ERG target power in watts."""
        ...

    async def set_basic_resistance(self, level: int) -> None:
        """Set basic resistance level (0–100)."""
        ...
