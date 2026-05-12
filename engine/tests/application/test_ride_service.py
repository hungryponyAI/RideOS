"""RideService unit tests — shift, set_paused, start_ride, end_ride event flow."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.application.ride_service import RideService
from engine.control.state import RideState
from engine.domain.events import (
    GearShifted,
    RideEnded,
    RidePauseToggled,
    RidePhaseChanged,
    RideStarted,
)
from engine.gears.engine import GearEngine
from engine.route.library import RouteLibrary
from engine.ws.server import RouteContext

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _wire() -> tuple[RideService, AsyncioEventBus, RideState, dict[type, list]]:
    """Build a service with a fresh state, bus, and per-type recording."""
    bus = AsyncioEventBus()
    gear_engine = GearEngine()
    state = RideState(gear_engine=gear_engine)
    captured: dict[type, list] = {}
    for et in (GearShifted, RidePauseToggled, RideStarted, RideEnded, RidePhaseChanged):
        captured[et] = []
        bus.subscribe(et, captured[et].append)
    svc = RideService(state, gear_engine, bus, clock=lambda: 42.0)
    return svc, bus, state, captured


# ── shift ─────────────────────────────────────────────────────────────────────

def test_shift_up_publishes_event_with_resulting_gear():
    svc, _, state, captured = _wire()
    initial = state.gear_engine.current_gear

    new_gear = svc.shift("up")

    assert new_gear == initial + 1
    assert state.gear_engine.current_gear == new_gear
    assert len(captured[GearShifted]) == 1
    ev = captured[GearShifted][0]
    assert ev.direction == "up"
    assert ev.gear == new_gear
    assert ev.t_mono == 42.0


def test_shift_down_publishes_event_with_resulting_gear():
    svc, _, _, captured = _wire()
    svc.shift("up")  # nudge gear away from min so down works
    captured[GearShifted].clear()

    new_gear = svc.shift("down")

    assert captured[GearShifted][0].direction == "down"
    assert captured[GearShifted][0].gear == new_gear


# ── set_paused ────────────────────────────────────────────────────────────────

def test_set_paused_to_false_publishes_toggle():
    svc, _, state, captured = _wire()
    assert state.paused is True  # default

    svc.set_paused(False)

    assert state.paused is False
    assert len(captured[RidePauseToggled]) == 1
    assert captured[RidePauseToggled][0].paused is False


def test_set_paused_idempotent_publishes_nothing():
    svc, _, state, captured = _wire()
    assert state.paused is True

    svc.set_paused(True)  # already paused

    assert captured[RidePauseToggled] == []


def test_set_paused_then_resume_publishes_two_events():
    svc, _, _, captured = _wire()
    svc.set_paused(False)
    svc.set_paused(True)

    assert [e.paused for e in captured[RidePauseToggled]] == [False, True]


# ── start_ride / end_ride ─────────────────────────────────────────────────────

@pytest.fixture
def route_ctx_factory(tmp_path):
    """Build a RouteContext backed by a temp library + the simple GPX fixture."""

    def _make() -> tuple[RouteContext, RouteLibrary, str]:
        lib_dir = tmp_path / "routes"
        lib_dir.mkdir()
        library = RouteLibrary(lib_dir)
        gpx = (FIXTURES / "route_simple.gpx").read_text()
        from engine.route.loader import load_gpx_content
        route = load_gpx_content(gpx)
        entry = library.add_route("simple", gpx, route)

        # state/bus come from _wire() in each test; ctx only needs library wiring
        state = RideState(gear_engine=GearEngine())
        ctx = RouteContext(
            state=state,
            broadcast_queue=asyncio.Queue(maxsize=10),
            stop_event=asyncio.Event(),
            library=library,
        )
        return ctx, library, entry.id

    return _make


async def test_start_ride_publishes_ride_started(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    captured: list[RideStarted] = []
    bus.subscribe(RideStarted, captured.append)
    svc = RideService(ctx.state, ctx.state.gear_engine, bus, clock=lambda: 7.0)

    await svc.start_ride(ctx, {
        "route_id": route_id, "laps": 2, "warmup_s": 0, "cooldown_s": 0, "erg_mode": False,
    })

    assert len(captured) == 1
    ev = captured[0]
    assert ev.route_id == route_id
    assert ev.laps == 2
    assert ev.warmup_s == 0
    assert ev.erg_mode is False
    assert ev.t_mono == 7.0
    assert ctx.phase_task is not None

    # cleanup so the spawned task doesn't leak
    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)


async def test_start_ride_unknown_route_id_does_not_publish(route_ctx_factory):
    ctx, _, _ = route_ctx_factory()
    bus = AsyncioEventBus()
    captured: list[RideStarted] = []
    bus.subscribe(RideStarted, captured.append)
    svc = RideService(ctx.state, ctx.state.gear_engine, bus)

    await svc.start_ride(ctx, {"route_id": "nope"})

    assert captured == []
    # broadcast queue holds a route_error
    msg = ctx.broadcast_queue.get_nowait()
    assert msg["type"] == "route_error"


async def test_start_ride_publishes_phase_change_to_route(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    phase_events: list[RidePhaseChanged] = []
    bus.subscribe(RidePhaseChanged, phase_events.append)
    svc = RideService(ctx.state, ctx.state.gear_engine, bus)

    await svc.start_ride(ctx, {
        "route_id": route_id, "laps": 1, "warmup_s": 0, "cooldown_s": 0,
    })

    # Allow the phase machine to emit its first transition
    await asyncio.sleep(0.05)
    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)

    phases_seen = [e.phase for e in phase_events]
    assert "route" in phases_seen
    assert "done" in phases_seen


async def test_end_ride_cancels_phase_task_and_publishes(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    ended: list[RideEnded] = []
    bus.subscribe(RideEnded, ended.append)
    svc = RideService(ctx.state, ctx.state.gear_engine, bus)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1})
    await svc.end_ride(ctx)

    assert ctx.phase_task is None
    # Either run_phases' on_complete or end_ride's emit will fire RideEnded;
    # we accept both paths but require at least one event.
    assert len(ended) >= 1


async def test_cancel_active_ride_resets_state(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    svc = RideService(ctx.state, ctx.state.gear_engine, bus)

    await svc.start_ride(ctx, {
        "route_id": route_id, "laps": 1, "erg_mode": True, "warmup_s": 0, "cooldown_s": 0,
    })
    assert ctx.state.erg_mode is True

    await svc.cancel_active_ride(ctx)

    assert ctx.phase_task is None
    assert ctx.tracker is None
    assert ctx.current_route is None
    assert ctx.state.erg_mode is False
    assert ctx.state.lap_index == 0
