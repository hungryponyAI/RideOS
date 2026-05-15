"""RideService unit tests — shift, set_paused, start_ride, end_ride event flow."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.application.ride_service import RideService
from engine.control.athlete import AthleteProfile
from engine.control.erg_debouncer import ErgDebouncer
from engine.domain.events import (
    GearShifted,
    RideEnded,
    RidePauseToggled,
    RidePhaseChanged,
    RideStarted,
    TelemetryReading,
)
from engine.domain.projection import RideStateProjection
from engine.gears.engine import GearEngine
from engine.route.library import RouteLibrary
from engine.ws.server import RouteContext

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _wire() -> tuple[RideService, AsyncioEventBus, GearEngine, RideStateProjection, dict[type, list]]:
    """Build a service with a fresh athlete profile, bus, projection, and per-type recording."""
    bus = AsyncioEventBus()
    gear_engine = GearEngine()
    projection = RideStateProjection()
    captured: dict[type, list] = {}
    for et in (GearShifted, RidePauseToggled, RideStarted, RideEnded, RidePhaseChanged):
        captured[et] = []
        bus.subscribe(et, captured[et].append)
    bus.subscribe(RidePauseToggled, projection.apply)
    svc = RideService(AthleteProfile(), gear_engine, bus, ErgDebouncer(bus), projection, clock=lambda: 42.0)
    return svc, bus, gear_engine, projection, captured


def _make_svc(bus: AsyncioEventBus, gear_engine: GearEngine | None = None) -> RideService:
    ge = gear_engine or GearEngine()
    proj = RideStateProjection()
    return RideService(AthleteProfile(), ge, bus, ErgDebouncer(bus), proj)


# ── shift ─────────────────────────────────────────────────────────────────────

def test_shift_up_publishes_event_with_resulting_gear():
    svc, _, gear_engine, _, captured = _wire()
    initial = gear_engine.current_gear

    new_gear = svc.shift("up")

    assert new_gear == initial + 1
    assert gear_engine.current_gear == new_gear
    assert len(captured[GearShifted]) == 1
    ev = captured[GearShifted][0]
    assert ev.direction == "up"
    assert ev.gear == new_gear
    assert ev.t_mono == 42.0


def test_shift_down_publishes_event_with_resulting_gear():
    svc, _, _, _, captured = _wire()
    svc.shift("up")  # nudge gear away from min so down works
    captured[GearShifted].clear()

    new_gear = svc.shift("down")

    assert captured[GearShifted][0].direction == "down"
    assert captured[GearShifted][0].gear == new_gear


# ── set_paused ────────────────────────────────────────────────────────────────

def test_set_paused_to_false_publishes_toggle():
    svc, _, _, projection, captured = _wire()
    assert projection.view.paused is True  # default

    svc.set_paused(False)

    assert projection.view.paused is False
    assert len(captured[RidePauseToggled]) == 1
    assert captured[RidePauseToggled][0].paused is False


def test_set_paused_idempotent_publishes_nothing():
    svc, _, _, projection, captured = _wire()
    assert projection.view.paused is True

    svc.set_paused(True)  # already paused

    assert captured[RidePauseToggled] == []


def test_set_paused_then_resume_publishes_two_events():
    svc, _, _, _, captured = _wire()
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

        ctx = RouteContext(
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
    proj = RideStateProjection()
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj, clock=lambda: 7.0)

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


async def test_start_ride_can_begin_paused_for_countdown(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    captured: list[RideStarted] = []
    bus.subscribe(RideStarted, captured.append)
    proj = RideStateProjection()
    bus.subscribe(RideStarted, proj.apply)
    bus.subscribe(RidePauseToggled, proj.apply)
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj, clock=lambda: 7.0)

    await svc.start_ride(ctx, {
        "route_id": route_id, "laps": 1, "warmup_s": 0, "cooldown_s": 0, "paused": True,
    })

    assert captured[0].paused is True
    assert proj.view.paused is True

    svc.set_paused(False)
    assert proj.view.paused is False

    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)


async def test_start_ride_paused_freezes_tracker_until_resume(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    proj = RideStateProjection()
    bus.subscribe(RideStarted, proj.apply)
    bus.subscribe(RidePauseToggled, proj.apply)
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj, clock=lambda: 7.0)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1, "paused": True})
    proj.apply(TelemetryReading(speed_kmh=36.0, power_w=180, cadence_rpm=90.0, t_mono=7.1))
    await asyncio.sleep(0.35)

    assert ctx.tracker is not None
    assert ctx.tracker.position_m == pytest.approx(0.0)

    svc.set_paused(False)
    await asyncio.sleep(0.35)

    assert ctx.tracker.position_m > 0.0

    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)


async def test_start_ride_without_physics_mode_keeps_default_tracker(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    proj = RideStateProjection()
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1})
    await asyncio.sleep(0.05)

    assert ctx.tracker is not None
    assert ctx.tracker._physics_config is None

    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)


async def test_start_ride_with_physics_mode_configures_tracker(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    proj = RideStateProjection()
    athlete = AthleteProfile(weight_kg=82.0, height_cm=186.0, ftp_w=240.0)
    svc = RideService(athlete, GearEngine(), bus, ErgDebouncer(bus), proj)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1, "physics_mode": True})
    await asyncio.sleep(0.05)

    assert ctx.tracker is not None
    assert ctx.tracker._physics_config is not None
    assert ctx.tracker._physics_config.rider_mass_kg == 82.0
    assert ctx.tracker._physics_config.cda_m2 is not None

    ctx.stop_event.set()
    if ctx.phase_task is not None:
        await asyncio.wait_for(ctx.phase_task, timeout=2.0)


async def test_start_ride_unknown_route_id_does_not_publish(route_ctx_factory):
    ctx, _, _ = route_ctx_factory()
    bus = AsyncioEventBus()
    captured: list[RideStarted] = []
    bus.subscribe(RideStarted, captured.append)
    svc = _make_svc(bus)

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
    svc = _make_svc(bus)

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
    svc = _make_svc(bus)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1})
    await svc.end_ride(ctx)

    assert ctx.phase_task is None
    assert len(ended) >= 1
    assert any(e.reason == "user_ended" for e in ended)


async def test_end_ride_reason_is_user_ended(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    ended: list[RideEnded] = []
    bus.subscribe(RideEnded, ended.append)
    proj = RideStateProjection()
    bus.subscribe(RideEnded, proj.apply)
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj, clock=lambda: 99.0)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1})
    await svc.end_ride(ctx)

    user_ended = [e for e in ended if e.reason == "user_ended"]
    assert len(user_ended) >= 1
    assert proj.view.ended_reason == "user_ended"


async def test_end_ride_uses_active_elapsed_excluding_paused_time(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    now = 0.0

    def clock() -> float:
        return now

    bus = AsyncioEventBus()
    ended: list[RideEnded] = []
    proj = RideStateProjection()
    for event_type in (RideStarted, RidePauseToggled, RideEnded):
        bus.subscribe(event_type, proj.apply)
    bus.subscribe(RideEnded, ended.append)
    svc = RideService(AthleteProfile(), GearEngine(), bus, ErgDebouncer(bus), proj, clock=clock)

    await svc.start_ride(ctx, {"route_id": route_id, "laps": 1, "paused": True})
    now = 10.0
    svc.set_paused(False)
    now = 25.0
    svc.set_paused(True)
    now = 100.0
    await svc.end_ride(ctx)

    user_ended = [e for e in ended if e.reason == "user_ended"]
    assert user_ended[-1].elapsed_s == 15


async def test_cancel_active_ride_cleans_up_context(route_ctx_factory):
    ctx, _, route_id = route_ctx_factory()
    bus = AsyncioEventBus()
    erg = ErgDebouncer(bus)
    proj = RideStateProjection()
    svc = RideService(AthleteProfile(), GearEngine(), bus, erg, proj)

    await svc.start_ride(ctx, {
        "route_id": route_id, "laps": 1, "erg_mode": True, "warmup_s": 0, "cooldown_s": 0,
    })

    await svc.cancel_active_ride(ctx)

    assert ctx.phase_task is None
    assert ctx.tracker is None
    assert ctx.current_route is None
    # Erg debouncer is reset after cancel
    assert erg.committed_power_w is None
