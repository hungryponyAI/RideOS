"""Virtual gearing — the project's core value proposition.

effective_grade = real_grade / gear_factor  (Focus Project.md)

Factor curve is a geometric progression: 12 gears spanning 0.8 → 4.8
(a 6× ratio). factor[i] = 0.8 * 6 ** ((i-1)/11), pinned to 3 decimal places.
Geometric (not linear) so every shift feels like the same relative jump.

Virtual-descent offsets shift the flat-ground baseline so the KICKR naturally
reports higher speed in low gears and lower speed in high gears.  Gear 6 = 0%.
Tune _GRADE_OFFSETS_PCT to match real-world target speeds per gear.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple

# factor[i] = 0.8 * 6 ** ((i-1)/11) — pinned to 3 decimal places.
_FACTORS: Tuple[float, ...] = (
    0.800, 0.942, 1.108, 1.304, 1.535, 1.807,
    2.126, 2.502, 2.945, 3.465, 4.078, 4.800,
)

# Per-gear grade offset added to effective_grade before FTMS write (% grade).
# Gear 1 (index 0) gets −5.5 % → trainer sees virtual descent → higher speed.
# Gear 12 (index 11) gets +6.0 % → trainer sees virtual climb → lower speed.
# Linear ladder: step ≈ 1.05 % per gear, calibrated for ≈50 km/h / ≈18 km/h
# at 100 RPM on flat.  Adjust per-gear if real-world speeds differ.
_GRADE_OFFSETS_PCT: Tuple[float, ...] = (
    -5.5, -4.45, -3.4, -2.35, -1.3, 0.0,
     1.05,  2.1,  3.15,  4.2,  5.1, 6.0,
)


@dataclass
class GearEngine:
    current_gear: int = 6
    factors: Tuple[float, ...] = field(default_factory=lambda: _FACTORS)
    grade_offsets_pct: Tuple[float, ...] = field(default_factory=lambda: _GRADE_OFFSETS_PCT)

    @property
    def factor(self) -> float:
        return self.factors[self.current_gear - 1]

    @property
    def grade_offset_pct(self) -> float:
        """Virtual-descent offset for the current gear (% grade)."""
        return self.grade_offsets_pct[self.current_gear - 1]

    def shift_up(self) -> int:
        self.current_gear = min(len(self.factors), self.current_gear + 1)
        return self.current_gear

    def shift_down(self) -> int:
        self.current_gear = max(1, self.current_gear - 1)
        return self.current_gear

    def effective_grade(self, real_grade_percent: float) -> float:
        """effective_grade = real_grade / gear_factor (Focus Project.md)."""
        return real_grade_percent / self.factor
