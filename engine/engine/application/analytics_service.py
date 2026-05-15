"""AnalyticsService — computes aggregate and per-ride metrics from ride_events."""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from engine.adapters.persistence.sqlite.ride_repo import SqliteRideRepo


class AnalyticsService:
    def __init__(self, repo: "SqliteRideRepo") -> None:
        self._repo = repo

    def get_overview(self) -> dict:
        rides = self._repo.list_rides()  # newest first
        completed = [r for r in rides if r["finished_at"] is not None]

        total_rides = len(rides)
        total_distance_m = sum(r["distance_m"] or 0.0 for r in completed)
        total_duration_s = sum(r["duration_s"] or 0.0 for r in completed)

        power_values = [r["avg_power_w"] for r in completed if r["avg_power_w"] is not None]
        avg_power_w: Optional[float] = (
            sum(power_values) / len(power_values) if power_values else None
        )

        now = datetime.now(timezone.utc)
        seven_ago = now - timedelta(days=7)
        thirty_ago = now - timedelta(days=30)

        def _parse(s: str) -> datetime:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        rides_last_7 = sum(1 for r in rides if _parse(r["started_at"]) > seven_ago)
        rides_last_30 = sum(1 for r in rides if _parse(r["started_at"]) > thirty_ago)

        # last 10 completed rides with power (oldest→newest for chart rendering)
        with_power = [
            {"started_at": r["started_at"], "avg_power_w": r["avg_power_w"]}
            for r in completed[:10]
            if r["avg_power_w"] is not None
        ]
        power_trend = list(reversed(with_power))

        return {
            "type": "analytics_overview",
            "total_rides": total_rides,
            "total_distance_m": total_distance_m,
            "total_duration_s": total_duration_s,
            "avg_power_w": avg_power_w,
            "rides_last_7_days": rides_last_7,
            "rides_last_30_days": rides_last_30,
            "power_trend": power_trend,
        }

    def get_ride_analytics(self, ride_id: str) -> Optional[dict]:
        ride = self._repo.get_ride(ride_id)
        if ride is None:
            return None

        events = self._repo.get_ride_events(ride_id, "TelemetryReading")
        power_samples: list[int] = []
        cadence_samples: list[float] = []

        for ev in events:
            try:
                payload = json.loads(ev["payload"])
                if payload.get("power_w") is not None:
                    power_samples.append(int(payload["power_w"]))
                if payload.get("cadence_rpm") is not None:
                    cadence_samples.append(float(payload["cadence_rpm"]))
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

        cadence_cv: Optional[float] = None
        if len(cadence_samples) >= 2:
            mean = sum(cadence_samples) / len(cadence_samples)
            if mean > 0:
                variance = sum((x - mean) ** 2 for x in cadence_samples) / len(cadence_samples)
                cadence_cv = round(math.sqrt(variance) / mean, 4)

        # downsample power timeline to ≤50 points
        power_timeline: list[int] = []
        if power_samples:
            step = max(1, len(power_samples) // 50)
            power_timeline = [power_samples[i] for i in range(0, len(power_samples), step)]

        return {
            "type": "ride_analytics",
            "found": True,
            "ride_id": ride_id,
            "avg_power_w": ride["avg_power_w"],
            "max_power_w": ride["max_power_w"],
            "cadence_cv": cadence_cv,
            "power_timeline": power_timeline,
        }
