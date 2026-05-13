"""Ride phase machine: warmup → route (with laps) → cooldown.

Spawned as a single asyncio.Task by the start_ride handler. Publishes
RidePhaseChanged events on every transition; the projection and the
control loop read from those events.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable, Optional

if TYPE_CHECKING:
    from engine.ports.eventbus import EventBusPort
    from engine.route.model import RouteData
    from engine.route.tracker import RouteTracker

_log = logging.getLogger("rideos.phases")

_WARMUP_POWER_W: float = 90.0
_COOLDOWN_POWER_W: float = 90.0


async def run_phases(
    route: "RouteData",
    stop_event: asyncio.Event,
    speed_fn: Callable[[], Optional[float]],
    *,
    warmup_s: int = 0,
    cooldown_s: int = 0,
    laps: int = 1,
    bus: Optional["EventBusPort"] = None,
    on_tracker_ready: Optional[Callable[["RouteTracker"], None]] = None,
    on_tracker_done: Optional[Callable[[], None]] = None,
    on_complete: Optional[Callable[[int], None]] = None,
    on_phase_change: Optional[Callable[[str, Optional[float], Optional[float]], None]] = None,
) -> None:
    """Run the full ride phase sequence, blocking until done or stop_event fires.

    on_phase_change is invoked with (phase, target_power_w, phase_end_mono) every
    time the phase machine transitions. RideService subscribes to publish a
    RidePhaseChanged event.
    """
    from engine.route.tracker import RouteTracker

    def _emit(phase: str, target_w: Optional[float], end_mono: Optional[float]) -> None:
        if on_phase_change is not None:
            on_phase_change(phase, target_w, end_mono)

    start_t = time.monotonic()

    # ── Warmup ────────────────────────────────────────────────────────────
    if warmup_s > 0 and not stop_event.is_set():
        _log.info("Phase: WARMUP (%ds @ %.0fW)", warmup_s, _WARMUP_POWER_W)
        end_mono = time.monotonic() + float(warmup_s)
        _emit("warmup", _WARMUP_POWER_W, end_mono)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=float(warmup_s))
        except asyncio.TimeoutError:
            pass

    if stop_event.is_set():
        _emit("done", None, None)
        return

    # ── Route ─────────────────────────────────────────────────────────────
    _emit("route", None, None)

    route_done_evt = asyncio.Event()
    elapsed_holder: list[int] = [0]

    def _on_route_complete(elapsed_s: int) -> None:
        elapsed_holder[0] = elapsed_s
        route_done_evt.set()

    tracker = RouteTracker(route, on_complete=_on_route_complete, laps=laps, bus=bus)
    if on_tracker_ready is not None:
        on_tracker_ready(tracker)

    tracker_task = asyncio.create_task(
        tracker.run(speed_fn, stop_event), name="route_tracker"
    )

    try:
        await asyncio.wait({tracker_task}, return_when=asyncio.FIRST_COMPLETED)
    except asyncio.CancelledError:
        if not tracker_task.done():
            tracker_task.cancel()
            try:
                await tracker_task
            except Exception:
                pass
        if on_tracker_done is not None:
            on_tracker_done()
        raise

    if not tracker_task.done():
        tracker_task.cancel()
        try:
            await tracker_task
        except Exception:
            pass

    if on_tracker_done is not None:
        on_tracker_done()

    if stop_event.is_set():
        _emit("done", None, None)
        return

    # ── Cooldown ──────────────────────────────────────────────────────────
    if cooldown_s > 0:
        _log.info("Phase: COOLDOWN (%ds @ %.0fW)", cooldown_s, _COOLDOWN_POWER_W)
        end_mono = time.monotonic() + float(cooldown_s)
        _emit("cooldown", _COOLDOWN_POWER_W, end_mono)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=float(cooldown_s))
        except asyncio.TimeoutError:
            pass

    total_elapsed = int(time.monotonic() - start_t)
    _log.info("Phase: DONE (total %ds)", total_elapsed)
    _emit("done", None, None)

    if on_complete is not None:
        on_complete(elapsed_holder[0])
