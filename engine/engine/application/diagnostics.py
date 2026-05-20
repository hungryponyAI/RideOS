"""Engine black-box diagnostics for long-ride crash investigations."""
from __future__ import annotations

import asyncio
import json
import logging
import platform
import resource
import time
from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from engine.domain.events import DomainEvent

if TYPE_CHECKING:
    from engine.adapters.persistence.ride_repo_sink import RideRepoSink
    from engine.domain.projection import RideStateProjection
    from engine.transport.ws.server import RouteContext

_log = logging.getLogger("rideos.diagnostics")


class EngineDiagnostics:
    """Collects periodic backend state and persists the last samples to JSON."""

    def __init__(
        self,
        *,
        route_ctx: "RouteContext",
        projection: "RideStateProjection",
        broadcast_queue: "asyncio.Queue[dict]",
        ride_repo_sink: "RideRepoSink",
        output_path: Path,
        interval_s: float = 10.0,
        max_entries: int = 200,
        clock: Any = time.monotonic,
    ) -> None:
        self._route_ctx = route_ctx
        self._projection = projection
        self._broadcast_queue = broadcast_queue
        self._ride_repo_sink = ride_repo_sink
        self._output_path = output_path
        self._interval_s = max(1.0, float(interval_s))
        self._entries: deque[dict[str, Any]] = deque(maxlen=max_entries)
        self._event_counts: Counter[str] = Counter()
        self._last_event_counts: Counter[str] = Counter()
        self._device_counts: Counter[str] = Counter()
        self._last_device_counts: Counter[str] = Counter()
        self._gauges: dict[str, Any] = {}
        self._tasks: list[asyncio.Task[Any]] = []
        self._last_sqlite_write_count = 0
        self._last_exception: dict[str, Any] | None = None
        self._clock = clock
        self._log_handler: logging.Handler | None = None

    def on_event(self, event: DomainEvent) -> None:
        self._event_counts[type(event).__name__] += 1

    def increment(self, name: str, amount: int = 1) -> None:
        self._device_counts[name] += amount

    def set_gauge(self, name: str, value: Any) -> None:
        self._gauges[name] = value

    def set_tasks(self, tasks: list[asyncio.Task[Any]]) -> None:
        self._tasks = tasks

    def install_logging_capture(self) -> None:
        if self._log_handler is not None:
            return
        self._log_handler = _DiagnosticsLogHandler(self)
        logging.getLogger().addHandler(self._log_handler)

    def uninstall_logging_capture(self) -> None:
        if self._log_handler is None:
            return
        logging.getLogger().removeHandler(self._log_handler)
        self._log_handler = None

    def record_log_exception(self, record: logging.LogRecord) -> None:
        if record.name == _log.name:
            return
        self._last_exception = {
            "at": _utc_now(),
            "logger": record.name,
            "level": record.levelname,
            "message": record.getMessage(),
            "exc_text": logging.Formatter().formatException(record.exc_info)
            if record.exc_info
            else None,
        }

    async def run(self, stop_event: asyncio.Event) -> None:
        self.install_logging_capture()
        try:
            self.sample_and_persist()
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=self._interval_s)
                except asyncio.TimeoutError:
                    self.sample_and_persist()
        finally:
            self.sample_and_persist()
            self.uninstall_logging_capture()

    def sample_and_persist(self) -> dict[str, Any]:
        entry = self._sample()
        self._entries.append(entry)
        self._persist()
        self._log_entry(entry)
        return entry

    def _sample(self) -> dict[str, Any]:
        from engine.transport.ws.server import CLIENTS

        now = self._clock()
        view = self._projection.view
        event_deltas = {
            key: self._event_counts[key] - self._last_event_counts[key]
            for key in set(self._event_counts) | set(self._last_event_counts)
        }
        self._last_event_counts = self._event_counts.copy()
        device_deltas = {
            key: self._device_counts[key] - self._last_device_counts[key]
            for key in set(self._device_counts) | set(self._last_device_counts)
        }
        self._last_device_counts = self._device_counts.copy()

        sqlite_writes = getattr(self._ride_repo_sink, "write_count", 0)
        sqlite_writes_delta = sqlite_writes - self._last_sqlite_write_count
        self._last_sqlite_write_count = sqlite_writes

        tracker = self._route_ctx.tracker
        phase_task = self._route_ctx.phase_task
        tracker_task = self._route_ctx.tracker_task
        elapsed_s = view.elapsed_s_at(now) if view.ride_start_mono is not None else 0.0
        task_status = _task_statuses(self._tasks)
        pending_task_count = sum(1 for status in task_status.values() if status == "pending")
        done_task_count = sum(1 for status in task_status.values() if status == "done")
        cancelled_task_count = sum(1 for status in task_status.values() if status == "cancelled")

        return {
            "at": _utc_now(),
            "route_id": self._route_ctx.current_route_id or view.route_id,
            "ride_session_id": self._route_ctx.current_ride_session_id,
            "ride_phase": view.ride_phase,
            "paused": view.paused,
            "elapsed_s": round(elapsed_s, 1),
            "websocket_clients": len(CLIENTS),
            "broadcast_queue_size": self._broadcast_queue.qsize(),
            "broadcast_queue_maxsize": self._broadcast_queue.maxsize,
            "telemetry_events_per_interval": event_deltas.get("TelemetryReading", 0),
            "position_events_per_interval": event_deltas.get("PositionAdvanced", 0),
            "sqlite_writes_per_interval": sqlite_writes_delta,
            "event_deltas": event_deltas,
            "event_totals": dict(self._event_counts),
            "device_deltas": device_deltas,
            "device_totals": dict(self._device_counts),
            "device_gauges": dict(self._gauges),
            "kickr_scan_attempts_per_interval": device_deltas.get("kickr_scan_attempts", 0),
            "kickr_connect_attempts_per_interval": device_deltas.get("kickr_connect_attempts", 0),
            "kickr_connected": bool(self._gauges.get("kickr_connected", False)),
            "click_scan_attempts_per_interval": device_deltas.get("click_scan_attempts", 0),
            "click_connected": bool(self._gauges.get("click_connected", False)),
            "ble_errors_per_interval": device_deltas.get("ble_errors", 0),
            "control_writes_per_interval": device_deltas.get("control_writes", 0),
            "control_write_failures_per_interval": device_deltas.get("control_write_failures", 0),
            "sqlite_writes_total": sqlite_writes,
            "rss_memory_mb": _rss_memory_mb(),
            "ghost_active": self._route_ctx.ghost_tracker is not None,
            "tracker_active": tracker is not None,
            "tracker_position_m": round(tracker.position_m, 1) if tracker is not None else None,
            "phase_task_done": phase_task.done() if phase_task is not None else None,
            "tracker_task_done": tracker_task.done() if tracker_task is not None else None,
            "tasks": task_status,
            "task_count": len(task_status),
            "task_pending_count": pending_task_count,
            "task_done_count": done_task_count,
            "task_cancelled_count": cancelled_task_count,
            "last_exception": self._last_exception,
        }

    def _persist(self) -> None:
        payload = {
            "latest": self._entries[-1] if self._entries else None,
            "entries": list(self._entries),
        }
        self._output_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._output_path.with_suffix(self._output_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self._output_path)

    @staticmethod
    def _log_entry(entry: dict[str, Any]) -> None:
        _log.info(
            "ENGINE DIAG | ride_session=%s route=%s elapsed=%.1fs clients=%d queue=%d/%d "
            "telemetry_events_per_10s=%d position_events_per_10s=%d sqlite_writes_per_10s=%d "
            "control_writes_per_10s=%d control_write_failures_per_10s=%d ble_errors_per_10s=%d "
            "kickr_connected=%s click_connected=%s task_pending=%d rss_memory_mb=%.1f "
            "ghost_active=%s tracker_pos_m=%s last_exception=%s",
            entry["ride_session_id"] or "none",
            entry["route_id"] or "none",
            entry["elapsed_s"],
            entry["websocket_clients"],
            entry["broadcast_queue_size"],
            entry["broadcast_queue_maxsize"],
            entry["telemetry_events_per_interval"],
            entry["position_events_per_interval"],
            entry["sqlite_writes_per_interval"],
            entry["control_writes_per_interval"],
            entry["control_write_failures_per_interval"],
            entry["ble_errors_per_interval"],
            entry["kickr_connected"],
            entry["click_connected"],
            entry["task_pending_count"],
            entry["rss_memory_mb"],
            entry["ghost_active"],
            entry["tracker_position_m"],
            "yes" if entry["last_exception"] else "no",
        )


class _DiagnosticsLogHandler(logging.Handler):
    def __init__(self, diagnostics: EngineDiagnostics) -> None:
        super().__init__(level=logging.ERROR)
        self._diagnostics = diagnostics

    def emit(self, record: logging.LogRecord) -> None:
        self._diagnostics.record_log_exception(record)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _task_statuses(tasks: list[asyncio.Task[Any]]) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for idx, task in enumerate(tasks):
        name = task.get_name() or f"task_{idx}"
        if name in statuses:
            name = f"{name}#{idx}"
        if task.cancelled():
            statuses[name] = "cancelled"
        elif task.done():
            statuses[name] = "done"
        else:
            statuses[name] = "pending"
    return statuses


def _rss_memory_mb() -> float:
    rss = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if platform.system() == "Darwin":
        return rss / 1024 / 1024
    return rss / 1024
