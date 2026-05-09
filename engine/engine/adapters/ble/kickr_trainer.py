"""KickrTrainerAdapter — TrainerPort backed by FtmsController.

The controller is injected when the reconnect loop establishes a connection
and detached on disconnect. All write methods silently drop when disconnected.
"""
from __future__ import annotations

import logging
from typing import Optional

from engine.control.controller import FtmsController

_log = logging.getLogger("rideos.adapters.ble.kickr")


class KickrTrainerAdapter:
    """TrainerPort that delegates to FtmsController when connected.

    Call attach(controller) from the reconnect_loop on_client_ready callback
    and detach() from the disconnect callback.
    """

    def __init__(self) -> None:
        self._controller: Optional[FtmsController] = None

    def attach(self, controller: FtmsController) -> None:
        self._controller = controller
        _log.debug("KickrTrainerAdapter: controller attached")

    def detach(self) -> None:
        self._controller = None
        _log.debug("KickrTrainerAdapter: controller detached")

    @property
    def is_connected(self) -> bool:
        return self._controller is not None and self._controller.controlled

    async def set_grade(self, grade_pct: float) -> None:
        if self._controller is not None and self._controller.controlled:
            await self._controller.set_simulation_grade(grade_pct)

    async def set_target_power(self, power_w: float) -> None:
        if self._controller is not None and self._controller.controlled:
            await self._controller.set_target_power(int(power_w))

    async def set_basic_resistance(self, level: int) -> None:
        pass  # FTMS spec doesn't expose basic resistance on the KICKR Core
