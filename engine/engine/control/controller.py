"""FTMS write path: handshake state machine + 4 Hz grade control loop.

Source: RESEARCH.md §Pattern 1, §Pattern 2, §Pattern 3; §Code Examples.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Awaitable, Callable, Optional

from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

from engine.control.athlete import AthleteProfile
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.projection import RideStateProjection
from engine.ftms.control_point import (
    FMCP_UUID,
    OpCode,
    ResultCode,
    encode_request_control,
    encode_reset,
    encode_set_simulation_parameters,
    encode_set_target_power,
    encode_start_or_resume,
    encode_stop_or_pause,
    parse_control_point_response,
)

if TYPE_CHECKING:
    from engine.gears.engine import GearEngine

_log = logging.getLogger(__name__)


class FtmsControlError(RuntimeError):
    def __init__(self, op: OpCode, result: ResultCode) -> None:
        super().__init__(f"FTMS {op.name} -> {result.name}")
        self.op = op
        self.result = result


class FtmsController:
    _TICK_S: float = 0.25
    _EPSILON_PCT: float = 0.05
    _KEEPALIVE_S: float = 1.0
    _RESPONSE_TIMEOUT_S: float = 2.0

    def __init__(self, client: BleakClient) -> None:
        self._client = client
        self._pending: Optional[asyncio.Future] = None
        self._subscribed = False
        self._controlled = False

    @property
    def controlled(self) -> bool:
        return self._controlled

    async def start(self) -> None:
        """Subscribe to FMCP indications and run Request Control + Start."""
        await self._client.start_notify(FMCP_UUID, self._on_fmcp_indication)
        self._subscribed = True
        await self._send(encode_request_control(), OpCode.REQUEST_CONTROL)
        await self._send(encode_start_or_resume(), OpCode.START_OR_RESUME)
        self._controlled = True
        _log.info("FTMS handshake complete; control loop may begin")

    async def set_simulation_grade(
        self, grade_percent: float, *, crr: float = 0.0, cw: float = 0.0
    ) -> None:
        payload = encode_set_simulation_parameters(grade_percent=grade_percent, crr=crr, cw=cw)
        await self._send(payload, OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)

    async def set_target_power(self, watts: int) -> None:
        payload = encode_set_target_power(watts)
        await self._send(payload, OpCode.SET_TARGET_POWER)

    async def shutdown(self) -> None:
        """INFRA-02: best-effort Stop + Reset before disconnect. NEVER raises."""
        for payload, op in (
            (encode_stop_or_pause(pause=False), OpCode.STOP_OR_PAUSE),
            (encode_reset(),                    OpCode.RESET),
        ):
            try:
                await self._send(payload, op, timeout=1.0)
            except Exception:  # noqa: BLE001 — shutdown must not raise
                _log.exception("FTMS %s during shutdown failed (continuing)", op.name)
        self._controlled = False

    # --- internals --------------------------------------------------------

    def _on_fmcp_indication(
        self, _: Optional[BleakGATTCharacteristic], data: bytearray
    ) -> None:
        # SYNC callback — never await. (Phase 1 Pitfall 3.)
        if self._pending is not None and not self._pending.done():
            self._pending.set_result(bytes(data))

    async def _send(
        self, payload: bytes, op: OpCode, *, timeout: Optional[float] = None
    ) -> None:
        loop = asyncio.get_running_loop()
        self._pending = loop.create_future()
        try:
            await self._client.write_gatt_char(FMCP_UUID, payload, response=True)
            data = await asyncio.wait_for(
                self._pending, timeout=timeout or self._RESPONSE_TIMEOUT_S
            )
        finally:
            self._pending = None
        resp = parse_control_point_response(data)
        if resp.request_op != op:
            raise FtmsControlError(op, ResultCode.OPERATION_FAILED)
        if resp.result != ResultCode.SUCCESS:
            raise FtmsControlError(op, resp.result)


def _estimate_cw(weight_kg: float, height_cm: float) -> float:
    """Wind resistance coefficient = CdA × ρ (kg/m).

    Uses Bassett (1999) frontal-area estimate for a cyclist in hoods position.
    CdA ≈ frontal_area × Cd, Cd ≈ 1.15, ρ = 1.225 kg/m³.
    """
    h_m = height_cm / 100.0
    frontal_area = 0.0276 * (h_m ** 0.725) * (weight_kg ** 0.425)
    cda = frontal_area * 1.15
    return cda * 1.225


async def run_control_loop(
    controller: FtmsController,
    athlete: AthleteProfile,
    stop_event: asyncio.Event,
    *,
    projection: RideStateProjection,
    erg_debouncer: ErgDebouncer,
    gear_engine: "GearEngine",
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    """4 Hz tick: grade sim or erg/target-power, sourced from the projection view."""
    last_sent_grade: Optional[float] = None
    last_sent_power: Optional[float] = None
    last_write_t: float = 0.0
    crr = 0.004

    while not stop_event.is_set():
        now = clock()
        stale = (now - last_write_t) >= FtmsController._KEEPALIVE_S
        v = projection.view

        if not v.paused and v.target_power_w is not None:
            # Phase-level override: warmup or cooldown fixed power.
            power = v.target_power_w
            changed = last_sent_power is None or abs(power - last_sent_power) >= 1.0
            if changed or stale:
                try:
                    await controller.set_target_power(int(power))
                    last_sent_power = power
                    last_sent_grade = None
                    last_write_t = now
                except Exception:
                    pass  # trainer may not support Set Target Power; ignore

        elif not v.paused and v.erg_mode and erg_debouncer.has_table:
            erg_power = erg_debouncer.tick(v.grade_idx, now)
            if erg_power is not None:
                changed = last_sent_power is None or abs(erg_power - last_sent_power) >= 1.0
                if changed or stale:
                    try:
                        await controller.set_target_power(int(erg_power))
                        last_sent_power = erg_power
                        last_sent_grade = None
                        last_write_t = now
                    except Exception:
                        pass

        else:
            # Normal grade-simulation path (also used when paused → grade=0).
            grade = 0.0 if v.paused else gear_engine.effective_grade(v.real_grade_pct)
            cw = _estimate_cw(athlete.weight_kg, athlete.height_cm)
            changed = last_sent_grade is None or abs(grade - last_sent_grade) >= FtmsController._EPSILON_PCT
            if changed or stale:
                await controller.set_simulation_grade(grade, crr=crr, cw=cw)
                last_sent_grade = grade
                last_sent_power = None
                last_write_t = now

        await sleep(FtmsController._TICK_S)
