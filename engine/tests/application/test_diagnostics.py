from __future__ import annotations

import asyncio
import json
import sys

import pytest

from engine.application.diagnostics import EngineDiagnostics
from engine.domain.events import PositionAdvanced, RideStarted, TelemetryReading
from engine.domain.projection import RideStateProjection
from engine.transport.ws.server import RouteContext


class FakeRideRepoSink:
    def __init__(self) -> None:
        self.write_count = 0


def test_engine_diagnostics_samples_and_persists_json(tmp_path):
    projection = RideStateProjection()
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
        current_route_id="route-1",
        current_ride_session_id="session-1",
        projection=projection,
    )
    sink = FakeRideRepoSink()
    diagnostics = EngineDiagnostics(
        route_ctx=ctx,
        projection=projection,
        broadcast_queue=ctx.broadcast_queue,
        ride_repo_sink=sink,  # type: ignore[arg-type]
        output_path=tmp_path / "last_engine_diag.json",
        clock=lambda: 15.0,
    )

    started = RideStarted(
        route_id="route-1",
        laps=1,
        warmup_s=0,
        cooldown_s=0,
        erg_mode=False,
        t_mono=10.0,
    )
    telemetry = TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=11.0)
    position = PositionAdvanced(position_m=50.0, grade_idx=0, grade_pct=0.0, lap_index=0, t_mono=12.0)
    for event in (started, telemetry, position):
        projection.apply(event)
        diagnostics.on_event(event)
    sink.write_count = 4

    entry = diagnostics.sample_and_persist()

    assert entry["ride_session_id"] == "session-1"
    assert entry["route_id"] == "route-1"
    assert entry["telemetry_events_per_interval"] == 1
    assert entry["position_events_per_interval"] == 1
    assert entry["sqlite_writes_per_interval"] == 4
    payload = json.loads((tmp_path / "last_engine_diag.json").read_text())
    assert payload["latest"]["ride_session_id"] == "session-1"
    assert len(payload["entries"]) == 1


def test_engine_diagnostics_captures_logged_exceptions(tmp_path):
    projection = RideStateProjection()
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
        projection=projection,
    )
    diagnostics = EngineDiagnostics(
        route_ctx=ctx,
        projection=projection,
        broadcast_queue=ctx.broadcast_queue,
        ride_repo_sink=FakeRideRepoSink(),  # type: ignore[arg-type]
        output_path=tmp_path / "diag.json",
    )

    import logging

    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = logging.getLogger("rideos.test").makeRecord(
            "rideos.test",
            logging.ERROR,
            __file__,
            1,
            "failure happened",
            (),
            exc_info=sys.exc_info(),
        )
    diagnostics.record_log_exception(record)
    entry = diagnostics.sample_and_persist()

    assert entry["last_exception"]["message"] == "failure happened"
    assert "RuntimeError: boom" in entry["last_exception"]["exc_text"]


@pytest.mark.asyncio
async def test_engine_diagnostics_reports_device_counters_and_task_health(tmp_path):
    projection = RideStateProjection()
    ctx = RouteContext(
        broadcast_queue=asyncio.Queue(maxsize=10),
        stop_event=asyncio.Event(),
        projection=projection,
    )
    diagnostics = EngineDiagnostics(
        route_ctx=ctx,
        projection=projection,
        broadcast_queue=ctx.broadcast_queue,
        ride_repo_sink=FakeRideRepoSink(),  # type: ignore[arg-type]
        output_path=tmp_path / "diag.json",
    )
    pending = asyncio.create_task(asyncio.Event().wait(), name="pending_probe")
    diagnostics.set_tasks([pending])
    diagnostics.increment("kickr_scan_attempts", 2)
    diagnostics.increment("ble_errors")
    diagnostics.increment("control_writes", 3)
    diagnostics.increment("control_write_failures")
    diagnostics.set_gauge("kickr_connected", True)

    try:
        entry = diagnostics.sample_and_persist()
    finally:
        pending.cancel()
        try:
            await pending
        except asyncio.CancelledError:
            pass

    assert entry["kickr_scan_attempts_per_interval"] == 2
    assert entry["ble_errors_per_interval"] == 1
    assert entry["control_writes_per_interval"] == 3
    assert entry["control_write_failures_per_interval"] == 1
    assert entry["kickr_connected"] is True
    assert entry["tasks"]["pending_probe"] == "pending"
    assert entry["task_pending_count"] == 1
