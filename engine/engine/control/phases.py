"""Ride phase machine: warmup → route (with laps) → cooldown.

Spawned as a single asyncio.Task by the start_ride handler. Manages the
RouteTracker lifecycle internally and writes ride_phase / target_power_w
into RideState so run_control_loop can branch accordingly.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Callable, Optional

if TYPE_CHECKING:
    from engine.control.state import RideState
    from engine.route.model import RouteData
    from engine.route.tracker import RouteTracker

_log = logging.getLogger("rideos.phases")

_WARMUP_POWER_W: float = 90.0
_COOLDOWN_POWER_W: float = 90.0


async def run_phases(
    state: "RideState",
    route: "RouteData",
    stop_event: asyncio.Event,
    *,
    warmup_s: int = 0,
    cooldown_s: int = 0,
    laps: int = 1,
    on_tracker_ready: Optional[Callable[["RouteTracker"], None]] = None,
    on_tracker_done: Optional[Callable[[], None]] = None,
    on_complete: Optional[Callable[[int], None]] = None,
) -> None:
    """Run the full ride phase sequence, blocking until done or stop_event fires."""
    from engine.route.tracker import RouteTracker

    start_t = time.monotonic()
    state.ride_start_monotonic = start_t

    # ── Warmup ────────────────────────────────────────────────────────────
    if warmup_s > 0 and not stop_event.is_set():
        _log.info("Phase: WARMUP (%ds @ %.0fW)", warmup_s, _WARMUP_POWER_W)
        state.ride_phase = "warmup"
        state.target_power_w = _WARMUP_POWER_W
        state.phase_end_monotonic = time.monotonic() + float(warmup_s)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=float(warmup_s))
        except asyncio.TimeoutError:
            pass  # warmup timer elapsed normally
        state.phase_end_monotonic = None

    if stop_event.is_set():
        state.ride_phase = "done"
        state.target_power_w = None
        state.phase_end_monotonic = None
        return

    # ── Route ─────────────────────────────────────────────────────────────
    state.ride_phase = "route"
    state.target_power_w = None

    route_done_evt = asyncio.Event()
    elapsed_holder: list[int] = [0]

    def _on_route_complete(elapsed_s: int) -> None:
        elapsed_holder[0] = elapsed_s
        route_done_evt.set()

    tracker = RouteTracker(route, on_complete=_on_route_complete, laps=laps)
    if on_tracker_ready is not None:
        on_tracker_ready(tracker)

    tracker_task = asyncio.create_task(
        tracker.run(state, stop_event), name="route_tracker"
    )

    try:
        # Wait for tracker completion or stop signal
        await asyncio.wait({tracker_task}, return_when=asyncio.FIRST_COMPLETED)
    except asyncio.CancelledError:
        if not tracker_task.done():
            tracker_task.cancel()
            try:
                await tracker_task
            except Exception:
                pass
        state.ride_phase = "done"
        state.target_power_w = None
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
        state.ride_phase = "done"
        state.target_power_w = None
        return

    # ── Cooldown ──────────────────────────────────────────────────────────
    if cooldown_s > 0:
        _log.info("Phase: COOLDOWN (%ds @ %.0fW)", cooldown_s, _COOLDOWN_POWER_W)
        state.ride_phase = "cooldown"
        state.target_power_w = _COOLDOWN_POWER_W
        state.phase_end_monotonic = time.monotonic() + float(cooldown_s)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=float(cooldown_s))
        except asyncio.TimeoutError:
            pass
        state.phase_end_monotonic = None

    state.ride_phase = "done"
    state.target_power_w = None
    state.phase_end_monotonic = None
    total_elapsed = int(time.monotonic() - start_t)
    _log.info("Phase: DONE (total %ds)", total_elapsed)

    if on_complete is not None:
        on_complete(elapsed_holder[0])
