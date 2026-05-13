"""StravaService — OAuth handshake, status broadcast, activity sync.

Wraps StravaAuth + StravaImporter + StravaClient. Owns the "syncing" flag and
guards against concurrent syncs. Encapsulates every Strava-related I/O so the
WS transport stays a thin dispatcher.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

from engine.ports.eventbus import EventBusPort

if TYPE_CHECKING:
    from engine.strava.auth import StravaAuth
    from engine.strava.importer import StravaImporter
    from engine.ws.server import RouteContext

_log = logging.getLogger("rideos.application.strava")


def _put(queue: "asyncio.Queue[dict]", msg: dict) -> None:
    try:
        queue.put_nowait(msg)
    except asyncio.QueueFull:
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        queue.put_nowait(msg)


class StravaService:
    """Owns Strava OAuth + sync. Pulls auth/importer/library off RouteContext."""

    def __init__(self, bus: EventBusPort) -> None:
        self._bus = bus  # reserved for future StravaSynced / StravaImported events

    # ── status / connection ───────────────────────────────────────────────

    def status_message(self, ctx: "RouteContext", *, syncing: Optional[bool] = None) -> dict:
        auth = ctx.strava_auth
        return {
            "type": "strava_status",
            "connected": auth.is_connected if auth else False,
            "athlete_name": auth.athlete_name if auth else None,
            "syncing": ctx.strava_syncing if syncing is None else syncing,
        }

    def broadcast_status(self, ctx: "RouteContext", *, syncing: Optional[bool] = None) -> None:
        _put(ctx.broadcast_queue, self.status_message(ctx, syncing=syncing))

    def get_auth_url(self, ctx: "RouteContext") -> Optional[str]:
        if ctx.strava_auth is None:
            return None
        return ctx.strava_auth.get_auth_url()

    def disconnect(self, ctx: "RouteContext") -> None:
        if ctx.strava_auth is None:
            return
        ctx.strava_auth.disconnect()
        self.broadcast_status(ctx)

    # ── OAuth exchange + sync ─────────────────────────────────────────────

    async def exchange_code_and_sync(self, ctx: "RouteContext", code: str) -> None:
        """OAuth code exchange followed by an initial activity sync."""
        if ctx.strava_auth is None:
            return
        try:
            await asyncio.to_thread(ctx.strava_auth.exchange_code, code)
        except Exception as exc:
            _log.warning("Strava code exchange failed: %s", exc)
            _put(ctx.broadcast_queue, {"type": "strava_error", "message": str(exc)})
            return
        self.broadcast_status(ctx)
        await self.sync(ctx)

    async def sync(self, ctx: "RouteContext") -> None:
        """Pull recent activities into the library; broadcast progress/result."""
        if ctx.strava_auth is None or ctx.strava_importer is None:
            return
        if not ctx.strava_auth.is_connected:
            return
        if ctx.strava_syncing:
            _log.info("Strava sync already in progress, ignoring duplicate request")
            return

        ctx.strava_syncing = True
        self.broadcast_status(ctx, syncing=True)

        imported = 0
        try:
            from engine.strava.client import StravaClient
            client = StravaClient(ctx.strava_auth)
            activities = await asyncio.to_thread(client.fetch_activities, 50)

            for act in activities:
                strava_id = str(act["id"])
                if ctx.strava_importer.already_imported(strava_id):
                    continue
                streams = await asyncio.to_thread(client.fetch_streams, act["id"])
                entry = await asyncio.to_thread(
                    ctx.strava_importer.import_activity, act, streams,
                )
                if entry is not None:
                    imported += 1
                    if ctx.library:
                        _put(ctx.broadcast_queue, ctx.library.to_ws_message())
        except Exception as exc:
            _log.error("Strava sync error: %s", exc)
            _put(ctx.broadcast_queue, {
                "type": "strava_error",
                "message": f"Sync fehlgeschlagen: {exc}",
            })
        finally:
            ctx.strava_syncing = False

        self.broadcast_status(ctx, syncing=False)
        if ctx.library:
            _put(ctx.broadcast_queue, ctx.library.to_ws_message())
        _log.info("Strava sync complete: %d new activities imported", imported)
