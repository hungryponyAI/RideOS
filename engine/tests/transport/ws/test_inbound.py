"""Tests for transport/ws/inbound.py — pydantic validation and dispatch table."""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from engine.transport.ws.inbound import _DISPATCH, WSInbound
from engine.transport.ws.server import RouteContext

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ctx(**kwargs) -> RouteContext:
    q: asyncio.Queue[dict] = asyncio.Queue()
    ev = asyncio.Event()
    return RouteContext(broadcast_queue=q, stop_event=ev, **kwargs)


def _fake_ws() -> MagicMock:
    ws = MagicMock()
    ws.send = AsyncMock()
    return ws


# ---------------------------------------------------------------------------
# Dispatch table coverage
# ---------------------------------------------------------------------------

def test_dispatch_table_keys():
    """All expected message types are registered in _DISPATCH."""
    expected = {
        "gear_shift", "load_route", "load_route_content", "athlete_settings",
        "list_routes", "start_ride", "delete_route", "rename_route",
        "strava_get_auth_url", "strava_submit_code", "strava_sync",
        "set_paused", "strava_disconnect", "end_ride", "preview_route",
        "get_ride_summary", "list_rides", "get_ride",
        "get_analytics_overview", "get_ride_analytics",
    }
    assert set(_DISPATCH.keys()) == expected


# ---------------------------------------------------------------------------
# Validation: bad JSON / non-dict are silently dropped
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_handle_ignores_bad_json():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, "not json")
    ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_handle_ignores_json_list():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps([1, 2, 3]))
    ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_handle_ignores_unknown_type():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps({"type": "does_not_exist"}))
    ws.send.assert_not_called()


# ---------------------------------------------------------------------------
# gear_shift
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gear_shift_up_calls_ride_service():
    ride_service = MagicMock()
    ride_service.shift = MagicMock(return_value=7)
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "gear_shift", "direction": "up"}))

    ride_service.shift.assert_called_once_with("up")


@pytest.mark.asyncio
async def test_gear_shift_down_calls_ride_service():
    ride_service = MagicMock()
    ride_service.shift = MagicMock(return_value=5)
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "gear_shift", "direction": "down"}))

    ride_service.shift.assert_called_once_with("down")


@pytest.mark.asyncio
async def test_gear_shift_invalid_direction_rejected():
    """direction='sideways' fails pydantic validation and is silently dropped."""
    ride_service = MagicMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "gear_shift", "direction": "sideways"}))

    ride_service.shift.assert_not_called()


@pytest.mark.asyncio
async def test_gear_shift_no_ride_service_is_noop():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    # Should not raise
    await inbound.handle(ws, json.dumps({"type": "gear_shift", "direction": "up"}))


# ---------------------------------------------------------------------------
# athlete_settings
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_athlete_settings_calls_update():
    ride_service = MagicMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({
        "type": "athlete_settings",
        "weight_kg": 72.5,
        "ftp_w": 250.0,
    }))

    ride_service.update_athlete_settings.assert_called_once_with(
        weight_kg=72.5, height_cm=None, ftp_w=250.0,
    )


# ---------------------------------------------------------------------------
# set_paused
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_set_paused_delegates_to_ride_service():
    ride_service = MagicMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "set_paused", "paused": True}))

    ride_service.set_paused.assert_called_once_with(True)


@pytest.mark.asyncio
async def test_set_paused_missing_field_rejected():
    ride_service = MagicMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "set_paused"}))  # no paused field

    ride_service.set_paused.assert_not_called()


# ---------------------------------------------------------------------------
# list_routes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_routes_sends_snapshot_and_strava_status():
    route_service = MagicMock()
    route_service.library_snapshot = MagicMock(return_value={"type": "route_list", "routes": []})
    strava_service = MagicMock()
    strava_service.status_message = MagicMock(return_value={"type": "strava_status", "connected": False})
    ctx = _ctx(route_service=route_service, strava_service=strava_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "list_routes"}))

    assert ws.send.call_count == 2
    payloads = [json.loads(c.args[0]) for c in ws.send.call_args_list]
    types = {p["type"] for p in payloads}
    assert types == {"route_list", "strava_status"}


# ---------------------------------------------------------------------------
# strava_get_auth_url
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_strava_get_auth_url_sends_response():
    strava_service = MagicMock()
    strava_service.get_auth_url = MagicMock(return_value="https://strava.com/oauth?...")
    ctx = _ctx(strava_service=strava_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "strava_get_auth_url"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "strava_auth_url"
    assert "strava.com" in data["url"]


# ---------------------------------------------------------------------------
# strava_submit_code — validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_strava_submit_code_empty_sends_error():
    strava_service = MagicMock()
    ctx = _ctx(strava_service=strava_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "strava_submit_code", "code": ""}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "strava_error"


# ---------------------------------------------------------------------------
# start_ride — pydantic defaults propagated to service
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_ride_defaults_passed_to_service():
    """Pydantic defaults (laps=1, warmup_s=0, …) are forwarded via model_dump()."""
    ride_service = MagicMock()
    ride_service.start_ride = AsyncMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "start_ride", "route_id": "abc123"}))

    await asyncio.sleep(0.05)  # let task run

    ride_service.start_ride.assert_called_once()
    _ctx_arg, msg_arg = ride_service.start_ride.call_args.args
    assert msg_arg["route_id"] == "abc123"
    assert msg_arg["laps"] == 1
    assert msg_arg["erg_mode"] is False
    assert msg_arg["physics_mode"] is False
    assert msg_arg["reverse"] is False


@pytest.mark.asyncio
async def test_start_ride_physics_mode_passed_to_service():
    ride_service = MagicMock()
    ride_service.start_ride = AsyncMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(
        ws,
        json.dumps({"type": "start_ride", "route_id": "abc123", "physics_mode": True}),
    )

    await asyncio.sleep(0.05)

    _ctx_arg, msg_arg = ride_service.start_ride.call_args.args
    assert msg_arg["physics_mode"] is True


@pytest.mark.asyncio
async def test_start_ride_missing_route_id_rejected():
    ride_service = MagicMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "start_ride"}))  # route_id missing

    await asyncio.sleep(0.05)
    ride_service.start_ride.assert_not_called()


# ---------------------------------------------------------------------------
# end_ride
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_end_ride_calls_service():
    ride_service = MagicMock()
    ride_service.end_ride = AsyncMock()
    ctx = _ctx(ride_service=ride_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "end_ride"}))

    await asyncio.sleep(0.05)
    ride_service.end_ride.assert_called_once_with(ctx)


@pytest.mark.asyncio
async def test_end_ride_no_service_is_noop():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps({"type": "end_ride"}))
    ws.send.assert_not_called()


# ---------------------------------------------------------------------------
# rename_route — name is stripped
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rename_route_strips_whitespace():
    route_service = MagicMock()
    route_service.rename_route = MagicMock()
    route_service.library_snapshot = MagicMock(return_value=None)
    ctx = _ctx(route_service=route_service)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({
        "type": "rename_route",
        "route_id": "r1",
        "name": "  My Route  ",
    }))

    route_service.rename_route.assert_called_once_with(ctx, "r1", "My Route")


# ---------------------------------------------------------------------------
# get_ride_summary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_ride_summary_no_repo_is_noop():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps({"type": "get_ride_summary"}))
    ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_get_ride_summary_empty_returns_not_found():
    ride_repo = MagicMock()
    ride_repo.list_rides = MagicMock(return_value=[])
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "get_ride_summary"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "ride_summary"
    assert data["found"] is False


@pytest.mark.asyncio
async def test_get_ride_summary_returns_last_ride():
    row = MagicMock()
    row.__getitem__ = lambda self, k: {
        "duration_s": 3600.0,
        "distance_m": 25400.0,
        "avg_power_w": 185.0,
        "max_power_w": 310.0,
    }[k]
    ride_repo = MagicMock()
    ride_repo.list_rides = MagicMock(return_value=[row])
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "get_ride_summary"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "ride_summary"
    assert data["found"] is True
    assert data["avg_power_w"] == 185.0
    assert data["distance_m"] == 25400.0


# ---------------------------------------------------------------------------
# list_rides
# ---------------------------------------------------------------------------

def _fake_ride_row(
    ride_id: str = "r1",
    route_id: str | None = "route1",
    started_at: str = "2026-05-15T10:00:00+00:00",
    finished_at: str | None = "2026-05-15T11:00:00+00:00",
    duration_s: float | None = 3600.0,
    distance_m: float | None = 25000.0,
    avg_power_w: float | None = 185.0,
) -> MagicMock:
    data = {
        "id": ride_id,
        "route_id": route_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_s": duration_s,
        "distance_m": distance_m,
        "avg_power_w": avg_power_w,
    }
    row = MagicMock()
    row.__getitem__ = lambda self, k: data[k]
    return row


@pytest.mark.asyncio
async def test_list_rides_no_repo_is_noop():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps({"type": "list_rides"}))
    ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_list_rides_empty_returns_empty_list():
    ride_repo = MagicMock()
    ride_repo.list_rides = MagicMock(return_value=[])
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "list_rides"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "ride_list"
    assert data["rides"] == []


@pytest.mark.asyncio
async def test_list_rides_returns_rides_sorted_newest_first():
    rows = [
        _fake_ride_row("r2", started_at="2026-05-15T12:00:00+00:00"),
        _fake_ride_row("r1", started_at="2026-05-14T10:00:00+00:00"),
    ]
    ride_repo = MagicMock()
    ride_repo.list_rides = MagicMock(return_value=rows)
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "list_rides"}))

    data = json.loads(ws.send.call_args.args[0])
    assert data["rides"][0]["id"] == "r2"
    assert data["rides"][1]["id"] == "r1"


@pytest.mark.asyncio
async def test_list_rides_completed_flag():
    rows = [
        _fake_ride_row("r1", finished_at="2026-05-15T11:00:00+00:00"),
        _fake_ride_row("r2", finished_at=None),
    ]
    ride_repo = MagicMock()
    ride_repo.list_rides = MagicMock(return_value=rows)
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "list_rides"}))

    data = json.loads(ws.send.call_args.args[0])
    assert data["rides"][0]["completed"] is True
    assert data["rides"][1]["completed"] is False


# ---------------------------------------------------------------------------
# get_ride
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_ride_no_repo_is_noop():
    inbound = WSInbound(_ctx())
    ws = _fake_ws()
    await inbound.handle(ws, json.dumps({"type": "get_ride", "ride_id": "r1"}))
    ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_get_ride_not_found():
    ride_repo = MagicMock()
    ride_repo.get_ride = MagicMock(return_value=None)
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "get_ride", "ride_id": "missing"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "ride_detail"
    assert data["found"] is False


@pytest.mark.asyncio
async def test_get_ride_returns_ride_detail():
    data_map = {
        "id": "r1",
        "route_id": "route1",
        "started_at": "2026-05-15T10:00:00+00:00",
        "finished_at": "2026-05-15T11:00:00+00:00",
        "duration_s": 3600.0,
        "distance_m": 25000.0,
        "avg_power_w": 185.0,
        "max_power_w": 310.0,
    }
    row = MagicMock()
    row.__getitem__ = lambda self, k: data_map[k]
    ride_repo = MagicMock()
    ride_repo.get_ride = MagicMock(return_value=row)
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "get_ride", "ride_id": "r1"}))

    ws.send.assert_called_once()
    data = json.loads(ws.send.call_args.args[0])
    assert data["type"] == "ride_detail"
    assert data["found"] is True
    ride = data["ride"]
    assert ride["id"] == "r1"
    assert ride["duration_s"] == 3600.0
    assert ride["avg_power_w"] == 185.0
    assert ride["completed"] is True


@pytest.mark.asyncio
async def test_get_ride_missing_ride_id_rejected():
    ride_repo = MagicMock()
    ctx = _ctx(ride_repo=ride_repo)
    inbound = WSInbound(ctx)
    ws = _fake_ws()

    await inbound.handle(ws, json.dumps({"type": "get_ride"}))  # ride_id missing

    ws.send.assert_not_called()
    ride_repo.get_ride.assert_not_called()
