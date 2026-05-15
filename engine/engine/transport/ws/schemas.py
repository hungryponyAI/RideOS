"""Pydantic models for inbound WebSocket messages.

Adding a new message type: add a model here + one entry in inbound._DISPATCH.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class GearShiftMsg(BaseModel):
    type: Literal["gear_shift"]
    direction: Literal["up", "down"]


class LoadRouteMsg(BaseModel):
    type: Literal["load_route"]
    path: str


class LoadRouteContentMsg(BaseModel):
    type: Literal["load_route_content"]
    content: str


class AthleteSettingsMsg(BaseModel):
    type: Literal["athlete_settings"]
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    ftp_w: Optional[float] = None


class ListRoutesMsg(BaseModel):
    type: Literal["list_routes"]


class StartRideMsg(BaseModel):
    type: Literal["start_ride"]
    route_id: str
    reverse: bool = False
    cutout_start_m: Optional[float] = None
    cutout_end_m: Optional[float] = None
    laps: int = 1
    warmup_s: int = 0
    cooldown_s: int = 0
    erg_mode: bool = False
    ghost: bool = False
    physics_mode: bool = False
    paused: bool = False


class DeleteRouteMsg(BaseModel):
    type: Literal["delete_route"]
    route_id: str


class RenameRouteMsg(BaseModel):
    type: Literal["rename_route"]
    route_id: str
    name: str


class StravaGetAuthUrlMsg(BaseModel):
    type: Literal["strava_get_auth_url"]


class StravaSubmitCodeMsg(BaseModel):
    type: Literal["strava_submit_code"]
    code: str


class StravaSyncMsg(BaseModel):
    type: Literal["strava_sync"]


class SetPausedMsg(BaseModel):
    type: Literal["set_paused"]
    paused: bool


class StravaDisconnectMsg(BaseModel):
    type: Literal["strava_disconnect"]


class EndRideMsg(BaseModel):
    type: Literal["end_ride"]


class PreviewRouteMsg(BaseModel):
    type: Literal["preview_route"]
    route_id: str


class GetRideSummaryMsg(BaseModel):
    type: Literal["get_ride_summary"]


class ListRidesMsg(BaseModel):
    type: Literal["list_rides"]


class GetRideMsg(BaseModel):
    type: Literal["get_ride"]
    ride_id: str


class GetAnalyticsOverviewMsg(BaseModel):
    type: Literal["get_analytics_overview"]


class GetRideAnalyticsMsg(BaseModel):
    type: Literal["get_ride_analytics"]
    ride_id: str
