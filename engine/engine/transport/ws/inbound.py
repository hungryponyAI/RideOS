"""Inbound WebSocket message dispatcher.

Maps message type → service method. Adding a new message type is a one-file
change: add a model to schemas.py, add a handler method here, add one entry
to _DISPATCH at the bottom.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Awaitable, Callable

from pydantic import ValidationError

from engine.transport.ws.schemas import (
    AthleteSettingsMsg,
    DeleteRouteMsg,
    EndRideMsg,
    GearShiftMsg,
    GetRideMsg,
    GetRideSummaryMsg,
    ListRidesMsg,
    ListRoutesMsg,
    LoadRouteContentMsg,
    LoadRouteMsg,
    PreviewRouteMsg,
    RenameRouteMsg,
    SetPausedMsg,
    StartRideMsg,
    StravaDisconnectMsg,
    StravaGetAuthUrlMsg,
    StravaSubmitCodeMsg,
    StravaSyncMsg,
)

if TYPE_CHECKING:
    from websockets.asyncio.server import ServerConnection

    from engine.transport.ws.server import RouteContext

_log = logging.getLogger("rideos.transport.ws.inbound")

_Handler = Callable[["WSInbound", "ServerConnection", dict], Awaitable[None]]


class WSInbound:
    """Validates and dispatches inbound WS messages to application services."""

    def __init__(self, ctx: "RouteContext") -> None:
        self._ctx = ctx

    async def handle(self, ws: "ServerConnection", raw: str | bytes) -> None:
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(data, dict):
            return
        mtype: str | None = data.get("type")
        if not isinstance(mtype, str):
            return
        handler = _DISPATCH.get(mtype)
        if handler is None:
            return
        try:
            await handler(self, ws, data)
        except Exception:
            _log.exception("Inbound handler for %r failed", mtype)

    # ── handlers ────────────────────────────────────────────────────────────

    async def _gear_shift(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = GearShiftMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.ride_service is None:
            return
        new = ctx.ride_service.shift(msg.direction)
        _log.info("WS gear shift %s -> gear %d", msg.direction.upper(), new)

    async def _load_route(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = LoadRouteMsg.model_validate(data)
        except ValidationError:
            _log.warning("load_route: invalid message")
            return
        if self._ctx.route_service is None:
            _log.warning("load_route ignored: no route_service wired")
            return
        asyncio.create_task(
            self._ctx.route_service.load_route(self._ctx, msg.path),
            name="load_route",
        )

    async def _load_route_content(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = LoadRouteContentMsg.model_validate(data)
        except ValidationError:
            _log.warning("load_route_content: invalid message")
            return
        if self._ctx.route_service is None:
            _log.warning("load_route_content ignored: no route_service wired")
            return
        _log.info("load_route_content received (%d bytes), spawning task", len(msg.content))
        asyncio.create_task(
            self._ctx.route_service.load_route_content(self._ctx, msg.content),
            name="load_route_content",
        )

    async def _athlete_settings(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = AthleteSettingsMsg.model_validate(data)
        except ValidationError:
            return
        if self._ctx.ride_service is None:
            return
        self._ctx.ride_service.update_athlete_settings(
            weight_kg=msg.weight_kg,
            height_cm=msg.height_cm,
            ftp_w=msg.ftp_w,
        )

    async def _list_routes(self, ws: "ServerConnection", data: dict) -> None:
        ctx = self._ctx
        if ctx.route_service is not None:
            snap = ctx.route_service.library_snapshot(ctx)
            if snap is not None:
                await ws.send(json.dumps(snap))
        if ctx.strava_service is not None:
            await ws.send(json.dumps(ctx.strava_service.status_message(ctx)))

    async def _start_ride(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = StartRideMsg.model_validate(data)
        except ValidationError:
            _log.warning("start_ride: invalid message")
            return
        if self._ctx.ride_service is None:
            return
        asyncio.create_task(
            self._ctx.ride_service.start_ride(self._ctx, msg.model_dump()),
            name="start_ride",
        )

    async def _delete_route(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = DeleteRouteMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.route_service is None:
            return
        ctx.route_service.delete_route(ctx, msg.route_id)
        snap = ctx.route_service.library_snapshot(ctx)
        if snap is not None:
            await ws.send(json.dumps(snap))

    async def _rename_route(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = RenameRouteMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.route_service is None:
            return
        ctx.route_service.rename_route(ctx, msg.route_id, msg.name.strip())
        snap = ctx.route_service.library_snapshot(ctx)
        if snap is not None:
            await ws.send(json.dumps(snap))

    async def _strava_get_auth_url(self, ws: "ServerConnection", data: dict) -> None:
        ctx = self._ctx
        if ctx.strava_service is None:
            return
        url = ctx.strava_service.get_auth_url(ctx)
        await ws.send(json.dumps({"type": "strava_auth_url", "url": url}))

    async def _strava_submit_code(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = StravaSubmitCodeMsg.model_validate(data)
        except ValidationError:
            await ws.send(json.dumps({"type": "strava_error", "message": "Kein Code angegeben"}))
            return
        ctx = self._ctx
        if ctx.strava_service is None:
            return
        if not msg.code.strip():
            await ws.send(json.dumps({"type": "strava_error", "message": "Kein Code angegeben"}))
            return
        asyncio.create_task(
            ctx.strava_service.exchange_code_and_sync(ctx, msg.code),
            name="strava_auth",
        )

    async def _strava_sync(self, ws: "ServerConnection", data: dict) -> None:
        ctx = self._ctx
        if ctx.strava_service is None:
            return
        asyncio.create_task(
            ctx.strava_service.sync(ctx),
            name="strava_sync",
        )

    async def _set_paused(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = SetPausedMsg.model_validate(data)
        except ValidationError:
            return
        if self._ctx.ride_service is None:
            return
        self._ctx.ride_service.set_paused(msg.paused)

    async def _strava_disconnect(self, ws: "ServerConnection", data: dict) -> None:
        ctx = self._ctx
        if ctx.strava_service is not None:
            ctx.strava_service.disconnect(ctx)

    async def _end_ride(self, ws: "ServerConnection", data: dict) -> None:
        try:
            EndRideMsg.model_validate(data)
        except Exception:
            return
        if self._ctx.ride_service is None:
            return
        asyncio.create_task(
            self._ctx.ride_service.end_ride(self._ctx),
            name="end_ride",
        )

    async def _preview_route(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = PreviewRouteMsg.model_validate(data)
        except ValidationError:
            return
        if self._ctx.route_service is None:
            return
        result = await self._ctx.route_service.preview_route(self._ctx, msg.route_id)
        if result is not None:
            await ws.send(json.dumps(result))

    async def _list_rides(self, ws: "ServerConnection", data: dict) -> None:
        try:
            ListRidesMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.ride_repo is None:
            return
        rows = ctx.ride_repo.list_rides()
        rides = []
        for row in rows:
            route_name: str | None = None
            if ctx.library is not None and row["route_id"]:
                entry = ctx.library._routes.get(row["route_id"])
                if entry is not None:
                    route_name = entry.name
            rides.append({
                "id": row["id"],
                "route_id": row["route_id"],
                "route_name": route_name,
                "started_at": row["started_at"],
                "finished_at": row["finished_at"],
                "duration_s": row["duration_s"],
                "distance_m": row["distance_m"],
                "avg_power_w": row["avg_power_w"],
                "completed": row["finished_at"] is not None,
            })
        await ws.send(json.dumps({"type": "ride_list", "rides": rides}))

    async def _get_ride(self, ws: "ServerConnection", data: dict) -> None:
        try:
            msg = GetRideMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.ride_repo is None:
            return
        row = ctx.ride_repo.get_ride(msg.ride_id)
        if row is None:
            await ws.send(json.dumps({"type": "ride_detail", "found": False}))
            return
        route_name: str | None = None
        if ctx.library is not None and row["route_id"]:
            entry = ctx.library._routes.get(row["route_id"])
            if entry is not None:
                route_name = entry.name
        await ws.send(json.dumps({
            "type": "ride_detail",
            "found": True,
            "ride": {
                "id": row["id"],
                "route_id": row["route_id"],
                "route_name": route_name,
                "started_at": row["started_at"],
                "finished_at": row["finished_at"],
                "duration_s": row["duration_s"],
                "distance_m": row["distance_m"],
                "avg_power_w": row["avg_power_w"],
                "max_power_w": row["max_power_w"],
                "completed": row["finished_at"] is not None,
            },
        }))

    async def _get_ride_summary(self, ws: "ServerConnection", data: dict) -> None:
        try:
            GetRideSummaryMsg.model_validate(data)
        except ValidationError:
            return
        ctx = self._ctx
        if ctx.ride_repo is None:
            return
        rides = ctx.ride_repo.list_rides()
        if not rides:
            await ws.send(json.dumps({"type": "ride_summary", "found": False}))
            return
        last = rides[0]
        await ws.send(json.dumps({
            "type": "ride_summary",
            "found": True,
            "duration_s": last["duration_s"],
            "distance_m": last["distance_m"],
            "avg_power_w": last["avg_power_w"],
            "max_power_w": last["max_power_w"],
        }))


# Dispatch table: one entry per supported message type.
_DISPATCH: dict[str, _Handler] = {
    "gear_shift": WSInbound._gear_shift,
    "load_route": WSInbound._load_route,
    "load_route_content": WSInbound._load_route_content,
    "athlete_settings": WSInbound._athlete_settings,
    "list_routes": WSInbound._list_routes,
    "start_ride": WSInbound._start_ride,
    "delete_route": WSInbound._delete_route,
    "rename_route": WSInbound._rename_route,
    "strava_get_auth_url": WSInbound._strava_get_auth_url,
    "strava_submit_code": WSInbound._strava_submit_code,
    "strava_sync": WSInbound._strava_sync,
    "set_paused": WSInbound._set_paused,
    "strava_disconnect": WSInbound._strava_disconnect,
    "end_ride": WSInbound._end_ride,
    "preview_route": WSInbound._preview_route,
    "get_ride_summary": WSInbound._get_ride_summary,
    "list_rides": WSInbound._list_rides,
    "get_ride": WSInbound._get_ride,
}
