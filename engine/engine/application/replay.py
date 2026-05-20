"""Replay telemetry source for full-stack stress runs without BLE hardware."""
from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from engine.ftms.parsers import IndoorBikeData

_log = logging.getLogger("rideos.replay")


@dataclass(frozen=True)
class ReplayConfig:
    enabled: bool = False
    time_scale: float = 8.0
    telemetry_hz: float = 4.0
    base_power_w: int = 220
    cadence_rpm: float = 88.0
    speed_kmh: float = 28.0

    @classmethod
    def from_env(cls) -> "ReplayConfig":
        return cls(
            enabled=_env_truthy("RIDEOS_REPLAY_RIDE"),
            time_scale=_float_env("RIDEOS_REPLAY_SPEED", 8.0, 0.1, 50.0),
            telemetry_hz=_float_env("RIDEOS_REPLAY_TELEMETRY_HZ", 4.0, 1.0, 30.0),
            base_power_w=int(_float_env("RIDEOS_REPLAY_POWER_W", 220.0, 0.0, 1500.0)),
            cadence_rpm=_float_env("RIDEOS_REPLAY_CADENCE_RPM", 88.0, 0.0, 220.0),
            speed_kmh=_float_env("RIDEOS_REPLAY_SPEED_KMH", 28.0, 0.0, 120.0),
        )


async def run_replay_telemetry(
    stop_event: asyncio.Event,
    on_reading: Callable[[IndoorBikeData], None],
    *,
    config: ReplayConfig,
    on_state_change: Callable[[bool], None] | None = None,
) -> None:
    """Emit fake trainer telemetry through the same handler used by BLE readings."""
    if on_state_change is not None:
        on_state_change(True)
    tick_s = 1.0 / config.telemetry_hz
    started = time.monotonic()
    _log.info(
        "Replay telemetry enabled: scale=%.1fx hz=%.1f power=%dW cadence=%.1frpm speed=%.1fkm/h",
        config.time_scale,
        config.telemetry_hz,
        config.base_power_w,
        config.cadence_rpm,
        config.speed_kmh,
    )
    try:
        while not stop_event.is_set():
            t = (time.monotonic() - started) * config.time_scale
            power = max(0, int(config.base_power_w + 35.0 * math.sin(t / 17.0)))
            cadence = max(0.0, config.cadence_rpm + 5.0 * math.sin(t / 11.0))
            speed = max(0.0, config.speed_kmh + 3.0 * math.sin(t / 19.0))
            on_reading(IndoorBikeData(
                speed_kmh=speed,
                cadence_rpm=cadence,
                power_watts=power,
            ))
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=tick_s)
            except asyncio.TimeoutError:
                pass
    finally:
        if on_state_change is not None:
            on_state_change(False)


async def run_ble_scan_stress(
    stop_event: asyncio.Event,
    find_device: Callable[[], Awaitable[Any]],
    *,
    diagnostics: Any | None = None,
    interval_s: float = 2.0,
) -> None:
    """Repeatedly scan for the KICKR without connecting during replay stress runs."""
    _log.info("BLE scan stress enabled: interval=%.1fs", interval_s)
    while not stop_event.is_set():
        _diag_increment(diagnostics, "kickr_scan_attempts")
        try:
            device = await find_device()
        except Exception as exc:
            _diag_increment(diagnostics, "ble_errors")
            _diag_increment(diagnostics, "kickr_scan_errors")
            _diag_set(diagnostics, "kickr_last_error", str(exc))
            _log.warning("BLE scan stress failed: %s", exc)
        else:
            if device is None:
                _diag_increment(diagnostics, "kickr_scan_misses")
                _diag_set(diagnostics, "kickr_scan_last_device", "none")
            else:
                _diag_increment(diagnostics, "kickr_scan_hits")
                _diag_set(diagnostics, "kickr_scan_last_device", getattr(device, "name", str(device)))
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=max(0.1, interval_s))
        except asyncio.TimeoutError:
            pass


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _float_env(name: str, default: float, min_value: float, max_value: float) -> float:
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    if not math.isfinite(value):
        return default
    return min(max_value, max(min_value, value))


def _diag_increment(diagnostics: Any | None, name: str, amount: int = 1) -> None:
    if diagnostics is not None:
        diagnostics.increment(name, amount)


def _diag_set(diagnostics: Any | None, name: str, value: Any) -> None:
    if diagnostics is not None:
        diagnostics.set_gauge(name, value)
