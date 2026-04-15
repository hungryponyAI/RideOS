"""Virtual gearing — the project's core value proposition.

effective_grade = real_grade / gear_factor  (Focus Project.md)

Factor curve is a geometric progression anchored to the note's anchors:
G1 = 0.5, G10 = 1.8, so factor[i] = 0.5 * 3.6 ** ((i-1)/9), rounded to 3dp.
Geometric (not linear) so every shift feels like the same relative jump.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple

# factor[i] = 0.5 * 3.6 ** ((i-1)/9) — pinned to 3 decimal places.
_FACTORS: Tuple[float, ...] = (
    0.500, 0.578, 0.668, 0.772, 0.892,
    1.031, 1.192, 1.378, 1.593, 1.800,
)


@dataclass
class GearEngine:
    current_gear: int = 5
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
