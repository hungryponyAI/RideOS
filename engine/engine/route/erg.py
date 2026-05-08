"""Backward-compat shim — real code lives in engine.domain.erg."""
from engine.domain.erg import (  # noqa: F401
    compute_target_power_table,
    compute_cadence_table,
)
