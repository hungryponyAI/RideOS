"""Virtual gearing — the project's core value proposition.

effective_grade = real_grade / gear_factor  (Focus Project.md)

Factor curve is a geometric progression: 12 gears spanning 0.8 → 4.8
(a 6× ratio). factor[i] = 0.8 * 6 ** ((i-1)/11), pinned to 3 decimal places.
Geometric (not linear) so every shift feels like the same relative jump.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple

# factor[i] = 0.8 * 6 ** ((i-1)/11) — pinned to 3 decimal places.
_FACTORS: Tuple[float, ...] = (
    0.800, 0.942, 1.108, 1.304, 1.535, 1.807,
    2.126, 2.502, 2.945, 3.465, 4.078, 4.800,
)


@dataclass
class GearEngine:
    current_gear: int = 6
    factors: Tuple[float, ...] = field(default_factory=lambda: _FACTORS)

    @property
    def factor(self) -> float:
        return self.factors[self.current_gear - 1]

    def shift_up(self) -> int:
        self.current_gear = min(len(self.factors), self.current_gear + 1)
        return self.current_gear

    def shift_down(self) -> int:
        self.current_gear = max(1, self.current_gear - 1)
        return self.current_gear

    def effective_grade(self, real_grade_percent: float) -> float:
        """effective_grade = real_grade / gear_factor (Focus Project.md)."""
        return real_grade_percent / self.factor
