"""AutoShiftController — cadence-primary auto-shift for virtual gearing.

Runs as a sibling asyncio task at 2 Hz while the engine is live.
Only fires shifts when gear_engine.mode is AUTO; silently skips otherwise.

Shift logic:
  - Debounce: cadence must be outside the target band for >= DEBOUNCE_S
    before a shift fires (prevents hunting on transient spikes).
  - Cooldown: min COOLDOWN_S between consecutive auto-shifts.
  - Power safety: if power > FTP * POWER_SAFETY_FACTOR, force shift_up
    (easier gear) regardless of cadence, to protect the rider.
  - Manual override: if user manually shifted within the last
    MANUAL_OVERRIDE_S seconds, auto-shift is suppressed.
  - Startup grace: suppress for STARTUP_GRACE_S after ride resumes from
    pause, and while cadence < CADENCE_MIN_ACTIVE.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable, Optional

if TYPE_CHECKING:
    from engine.application.ride_service import RideService
    from engine.domain.projection import RideStateProjection
    from engine.gears.engine import GearEngine

_log = logging.getLogger("rideos.application.auto_shift")

TICK_S: float = 0.5            # poll interval
DEBOUNCE_S: float = 1.5        # cadence must be out-of-band for this long
COOLDOWN_S: float = 2.0        # min gap between auto-shifts
MANUAL_OVERRIDE_S: float = 10.0
STARTUP_GRACE_S: float = 5.0
CADENCE_MIN_ACTIVE: float = 30.0   # below this cadence, auto-shift sleeps
POWER_SAFETY_FACTOR: float = 1.5   # FTP multiple that forces easier gear


class AutoShiftController:
    """Watches cadence + power and auto-shifts to keep rider in target band."""

    def __init__(
        self,
        ride_service: "RideService",
        projection: "RideStateProjection",
        gear_engine: "GearEngine",
        *,
        cadence_min_rpm: int = 82,
        cadence_max_rpm: int = 92,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._svc = ride_service
        self._proj = projection
        self._gears = gear_engine
        self.cadence_min_rpm = cadence_min_rpm
        self.cadence_max_rpm = cadence_max_rpm
        self._clock = clock

        self._last_auto_shift_t: float = 0.0
        self._out_of_band_since: Optional[float] = None  # None = currently in band
        self._out_of_band_dir: Optional[str] = None      # "up" or "down"
        self._manual_override_until: float = 0.0
        self._was_paused: bool = False
        self._resume_grace_until: float = 0.0

    def register_manual_shift(self) -> None:
        """Call when user manually shifts — suppresses auto for MANUAL_OVERRIDE_S."""
        self._manual_override_until = self._clock() + MANUAL_OVERRIDE_S
        _log.debug("Auto-shift suppressed for %.0fs (manual override)", MANUAL_OVERRIDE_S)

    async def run(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            try:
                self._tick()
            except Exception:
                _log.exception("AutoShiftController tick failed")
            await asyncio.sleep(TICK_S)

    def _tick(self) -> None:
        from engine.domain.gears import ShiftMode

        if self._gears.mode is not ShiftMode.AUTO:
            self._reset_band_tracking()
            return

        v = self._proj.view
        now = self._clock()

        # Startup grace after unpause
        if v.paused:
            self._was_paused = True
            self._reset_band_tracking()
            return
        if self._was_paused:
            self._was_paused = False
            self._resume_grace_until = now + STARTUP_GRACE_S
        if now < self._resume_grace_until:
            return

        cadence = v.cadence_rpm
        if cadence is None or cadence < CADENCE_MIN_ACTIVE:
            self._reset_band_tracking()
            return

        if now < self._manual_override_until:
            self._reset_band_tracking()
            return

        if now - self._last_auto_shift_t < COOLDOWN_S:
            return

        # Power safety override — force easier gear if hammering too hard
        ftp = getattr(self._svc, "_athlete", None)
        ftp_w = getattr(ftp, "ftp_w", None) if ftp else None
        if ftp_w and v.power_w and v.power_w > ftp_w * POWER_SAFETY_FACTOR:
            if self._gears.current_gear < len(self._gears.factors):
                _log.info(
                    "AUTO power safety: %.0fW > %.0f%% FTP → shift up",
                    v.power_w, POWER_SAFETY_FACTOR * 100,
                )
                self._fire_shift("up", now)
            self._reset_band_tracking()
            return

        # Cadence band logic with debounce
        desired_dir: Optional[str] = None
        if cadence > self.cadence_max_rpm:
            desired_dir = "up"
        elif cadence < self.cadence_min_rpm:
            desired_dir = "down"

        if desired_dir is None:
            self._reset_band_tracking()
            return

        if self._out_of_band_dir != desired_dir:
            self._out_of_band_since = now
            self._out_of_band_dir = desired_dir
            return

        if self._out_of_band_since is None:
            self._out_of_band_since = now
            return

        if now - self._out_of_band_since >= DEBOUNCE_S:
            self._fire_shift(desired_dir, now)

    def _fire_shift(self, direction: str, now: float) -> None:
        from typing import Literal
        dir_typed: Literal["up", "down"] = "up" if direction == "up" else "down"
        new_gear = self._svc.shift(dir_typed, automatic=True)
        self._last_auto_shift_t = now
        self._reset_band_tracking()
        _log.info(
            "AUTO shift %s → gear %d (cadence min=%d max=%d)",
            direction.upper(), new_gear, self.cadence_min_rpm, self.cadence_max_rpm,
        )

    def _reset_band_tracking(self) -> None:
        self._out_of_band_since = None
        self._out_of_band_dir = None
