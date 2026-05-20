from __future__ import annotations

import asyncio
from collections import Counter
from types import SimpleNamespace

from engine.application.replay import ReplayConfig, run_ble_scan_stress, run_replay_telemetry


class _FakeDiagnostics:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self.gauges: dict[str, object] = {}

    def increment(self, name: str, amount: int = 1) -> None:
        self.counts[name] += amount

    def set_gauge(self, name: str, value: object) -> None:
        self.gauges[name] = value


def test_replay_config_reads_env(monkeypatch):
    monkeypatch.setenv("RIDEOS_REPLAY_RIDE", "1")
    monkeypatch.setenv("RIDEOS_REPLAY_SPEED", "12")
    monkeypatch.setenv("RIDEOS_REPLAY_TELEMETRY_HZ", "8")
    monkeypatch.setenv("RIDEOS_REPLAY_POWER_W", "260")

    config = ReplayConfig.from_env()

    assert config.enabled is True
    assert config.time_scale == 12
    assert config.telemetry_hz == 8
    assert config.base_power_w == 260


async def test_replay_telemetry_emits_readings_and_state_changes():
    stop_event = asyncio.Event()
    readings = []
    states = []

    def on_reading(reading):
        readings.append(reading)
        stop_event.set()

    await asyncio.wait_for(
        run_replay_telemetry(
            stop_event,
            on_reading,
            config=ReplayConfig(enabled=True, telemetry_hz=30.0, base_power_w=210),
            on_state_change=states.append,
        ),
        timeout=1.0,
    )

    assert states == [True, False]
    assert len(readings) == 1
    assert readings[0].power_watts is not None
    assert readings[0].power_watts >= 0
    assert readings[0].cadence_rpm is not None
    assert readings[0].speed_kmh is not None


async def test_ble_scan_stress_counts_scan_results():
    stop_event = asyncio.Event()
    diagnostics = _FakeDiagnostics()

    async def find_device():
        stop_event.set()
        return SimpleNamespace(name="KICKR CORE")

    await asyncio.wait_for(
        run_ble_scan_stress(
            stop_event,
            find_device,
            diagnostics=diagnostics,
            interval_s=0.01,
        ),
        timeout=1.0,
    )

    assert diagnostics.counts["kickr_scan_attempts"] == 1
    assert diagnostics.counts["kickr_scan_hits"] == 1
    assert diagnostics.gauges["kickr_scan_last_device"] == "KICKR CORE"
