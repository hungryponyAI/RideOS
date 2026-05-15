"""Tests for AnalyticsService."""
from __future__ import annotations

import json

import pytest

from engine.adapters.persistence.sqlite.connection import get_connection
from engine.adapters.persistence.sqlite.ride_repo import SqliteRideRepo
from engine.application.analytics_service import AnalyticsService


@pytest.fixture
def repo(tmp_path):
    conn = get_connection(tmp_path / "test.db")
    return SqliteRideRepo(conn)


@pytest.fixture
def service(repo):
    return AnalyticsService(repo)


def _add_ride(repo, ride_id, started_at, finished_at=None, duration_s=None,
               distance_m=None, avg_power_w=None, max_power_w=None):
    repo.start_ride(ride_id, started_at, None, 1, 0, 0, False)
    if finished_at is not None:
        repo.finish_ride(ride_id, finished_at, duration_s or 0.0, distance_m or 0.0,
                         avg_power_w, max_power_w)


def _add_telemetry_events(repo, ride_id, readings):
    """readings: list of (power_w, cadence_rpm) tuples."""
    for seq, (power_w, cadence_rpm) in enumerate(readings):
        payload = json.dumps({
            "speed_kmh": 25.0,
            "power_w": power_w,
            "cadence_rpm": cadence_rpm,
            "t_mono": seq * 0.25,
        })
        repo.record_event(ride_id, seq, seq * 250, "TelemetryReading", payload)


# ── get_overview ─────────────────────────────────────────────────────────────

def test_overview_empty(service):
    result = service.get_overview()
    assert result["type"] == "analytics_overview"
    assert result["total_rides"] == 0
    assert result["total_distance_m"] == 0.0
    assert result["total_duration_s"] == 0.0
    assert result["avg_power_w"] is None
    assert result["rides_last_7_days"] == 0
    assert result["rides_last_30_days"] == 0
    assert result["power_trend"] == []


def test_overview_counts_rides(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 180.0, 320.0)
    _add_ride(repo, "r2", "2026-05-14T10:00:00+00:00", "2026-05-14T11:30:00+00:00",
              5400, 35000, 200.0, 350.0)
    result = service.get_overview()
    assert result["total_rides"] == 2
    assert result["total_distance_m"] == 60000.0
    assert result["total_duration_s"] == 9000.0


def test_overview_avg_power(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 100.0, 200.0)
    _add_ride(repo, "r2", "2026-05-14T10:00:00+00:00", "2026-05-14T11:00:00+00:00",
              3600, 20000, 200.0, 300.0)
    result = service.get_overview()
    assert result["avg_power_w"] == pytest.approx(150.0)


def test_overview_power_trend_oldest_first(repo, service):
    _add_ride(repo, "r1", "2026-05-13T10:00:00+00:00", "2026-05-13T11:00:00+00:00",
              3600, 25000, 160.0, 280.0)
    _add_ride(repo, "r2", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 190.0, 320.0)
    result = service.get_overview()
    # oldest first in power_trend
    assert result["power_trend"][0]["avg_power_w"] == 160.0
    assert result["power_trend"][1]["avg_power_w"] == 190.0


def test_overview_excludes_incomplete_rides_from_stats(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00")  # no finish
    result = service.get_overview()
    assert result["total_rides"] == 1
    assert result["total_distance_m"] == 0.0
    assert result["avg_power_w"] is None


def test_overview_rides_last_7_days(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 180.0, 320.0)
    _add_ride(repo, "r2", "2026-01-01T10:00:00+00:00", "2026-01-01T11:00:00+00:00",
              3600, 25000, 180.0, 320.0)
    result = service.get_overview()
    assert result["rides_last_7_days"] == 1
    assert result["rides_last_30_days"] == 1


# ── get_ride_analytics ────────────────────────────────────────────────────────

def test_ride_analytics_not_found(service):
    result = service.get_ride_analytics("nonexistent")
    assert result is None


def test_ride_analytics_basic(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 185.0, 310.0)
    result = service.get_ride_analytics("r1")
    assert result is not None
    assert result["type"] == "ride_analytics"
    assert result["found"] is True
    assert result["ride_id"] == "r1"
    assert result["avg_power_w"] == pytest.approx(185.0)
    assert result["max_power_w"] == pytest.approx(310.0)


def test_ride_analytics_cadence_cv(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 185.0, 310.0)
    # uniform cadence → cv near 0
    _add_telemetry_events(repo, "r1", [(185, 90.0)] * 20)
    result = service.get_ride_analytics("r1")
    assert result["cadence_cv"] is not None
    assert result["cadence_cv"] == pytest.approx(0.0, abs=1e-3)


def test_ride_analytics_power_timeline(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 185.0, 310.0)
    _add_telemetry_events(repo, "r1", [(200, 90.0)] * 10)
    result = service.get_ride_analytics("r1")
    assert len(result["power_timeline"]) > 0
    assert all(p == 200 for p in result["power_timeline"])


def test_ride_analytics_no_events(repo, service):
    _add_ride(repo, "r1", "2026-05-15T10:00:00+00:00", "2026-05-15T11:00:00+00:00",
              3600, 25000, 185.0, 310.0)
    result = service.get_ride_analytics("r1")
    assert result["cadence_cv"] is None
    assert result["power_timeline"] == []
