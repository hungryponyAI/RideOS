"""Virtual gearing — the project's core value proposition.

effective_grade = real_grade / gear_factor  (Focus Project.md)

Factor curve is a geometric progression: 12 gears spanning 0.4 → 2.4
(a 6× ratio, wider than the original 0.5 → 1.8 / 3.6× range).
factor[i] = 0.4 * 6 ** ((i-1)/11), pinned to 3 decimal places.
Geometric (not linear) so every shift feels like the same relative jump.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple

# factor[i] = 0.4 * 6 ** ((i-1)/11) — pinned to 3 decimal places.
_FACTORS: Tuple[float, ...] = (
    0.400, 0.471, 0.554, 0.652, 0.767, 0.903,
    1.063, 1.251, 1.472, 1.733, 2.039, 2.400,
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
