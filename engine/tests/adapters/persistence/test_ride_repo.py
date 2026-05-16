"""Tests for SqliteRideRepo and RideRepoSink."""
from __future__ import annotations

import json
import time

import pytest

from engine.adapters.persistence.ride_repo_sink import RideRepoSink
from engine.adapters.persistence.sqlite.connection import get_connection
from engine.adapters.persistence.sqlite.ride_repo import SqliteRideRepo
from engine.domain.events import (
    GearShifted,
    PositionAdvanced,
    RideEnded,
    RideStarted,
    TelemetryReading,
)


@pytest.fixture
def repo(tmp_path):
    conn = get_connection(tmp_path / "test.db")
    return SqliteRideRepo(conn)


@pytest.fixture
def sink(repo):
    return RideRepoSink(repo)


# ── SqliteRideRepo unit tests ─────────────────────────────────────────────────

def test_list_rides_empty(repo):
    assert repo.list_rides() == []


def test_start_ride_creates_row(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", "route-abc", 1, 0, 0, False)
    ride = repo.get_ride("r1")
    assert ride is not None
    assert ride["id"] == "r1"
    assert ride["route_id"] == "route-abc"
    assert ride["finished_at"] is None


def test_record_event_appends(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", None, 1, 0, 0, False)
    repo.record_event("r1", 0, 0, "TelemetryReading", '{"speed_kmh": 30.0}')
    repo.record_event("r1", 1, 250, "TelemetryReading", '{"speed_kmh": 31.0}')

    events = repo.get_ride_events("r1")
    assert len(events) == 2
    assert events[0]["seq"] == 0
    assert events[1]["t_ms"] == 250


def test_finish_ride_updates_row(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", None, 1, 0, 0, False)
    repo.finish_ride("r1", "2026-01-01T01:00:00+00:00", 3600.0, 25000.0, 180.5, 320.0)

    ride = repo.get_ride("r1")
    assert ride["finished_at"] == "2026-01-01T01:00:00+00:00"
    assert ride["duration_s"] == pytest.approx(3600.0)
    assert ride["distance_m"] == pytest.approx(25000.0)
    assert ride["avg_power_w"] == pytest.approx(180.5)
    assert ride["max_power_w"] == pytest.approx(320.0)


def test_get_ride_events_filtered_by_type(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", None, 1, 0, 0, False)
    repo.record_event("r1", 0, 0, "TelemetryReading", "{}")
    repo.record_event("r1", 1, 250, "GearShifted", "{}")
    repo.record_event("r1", 2, 500, "TelemetryReading", "{}")

    telemetry = repo.get_ride_events("r1", event_type="TelemetryReading")
    assert len(telemetry) == 2

    gear = repo.get_ride_events("r1", event_type="GearShifted")
    assert len(gear) == 1


def test_delete_ride_removes_row_and_events(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", None, 1, 0, 0, False)
    repo.record_event("r1", 0, 0, "TelemetryReading", "{}")

    assert repo.delete_ride("r1") is True

    assert repo.get_ride("r1") is None
    assert repo.get_ride_events("r1") == []


def test_delete_ride_missing_returns_false(repo):
    assert repo.delete_ride("missing") is False


def test_delete_all_rides_removes_rows_and_events(repo):
    repo.start_ride("r1", "2026-01-01T00:00:00+00:00", None, 1, 0, 0, False)
    repo.record_event("r1", 0, 0, "TelemetryReading", "{}")
    repo.start_ride("r2", "2026-01-02T00:00:00+00:00", None, 1, 0, 0, False)

    assert repo.delete_all_rides() == 2

    assert repo.list_rides() == []
    assert repo.get_ride_events("r1") == []


# ── RideRepoSink integration tests ───────────────────────────────────────────

def _t(offset: float = 0.0) -> float:
    return 100.0 + offset


def test_sink_no_ride_before_started(sink, repo):
    sink.on_event(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=_t()))
    assert repo.list_rides() == []


def test_sink_opens_ride_on_started(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    assert len(repo.list_rides()) == 1
    ride = repo.get_ride(sink.current_ride_id)
    assert ride["route_id"] == "r1"
    assert ride["laps"] == 1


def test_sink_records_events_during_ride(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    sink.on_event(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=_t(1.0)))
    sink.on_event(GearShifted(gear=7, direction="up", t_mono=_t(2.0)))

    ride_id = sink.current_ride_id
    events = repo.get_ride_events(ride_id)
    # RideStarted + TelemetryReading + GearShifted
    assert len(events) == 3
    assert events[0]["event_type"] == "RideStarted"
    assert events[1]["event_type"] == "TelemetryReading"
    assert events[2]["event_type"] == "GearShifted"


def test_sink_t_ms_relative_to_ride_start(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    sink.on_event(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=_t(2.5)))

    ride_id = sink.current_ride_id
    events = repo.get_ride_events(ride_id, event_type="TelemetryReading")
    assert events[0]["t_ms"] == 2500


def test_sink_finalises_ride_on_ended(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    ride_id = sink.current_ride_id
    sink.on_event(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=_t(1.0)))
    sink.on_event(TelemetryReading(speed_kmh=32.0, power_w=240, cadence_rpm=92.0, t_mono=_t(2.0)))
    sink.on_event(PositionAdvanced(position_m=150.0, grade_idx=5, grade_pct=2.0, lap_index=0, t_mono=_t(3.0)))
    sink.on_event(RideEnded(elapsed_s=600, t_mono=_t(600.0)))

    assert sink.current_ride_id is None

    ride = repo.get_ride(ride_id)
    assert ride["finished_at"] is not None
    assert ride["duration_s"] == pytest.approx(600.0)
    assert ride["distance_m"] == pytest.approx(150.0)
    assert ride["avg_power_w"] == pytest.approx(220.0)
    assert ride["max_power_w"] == pytest.approx(240.0)


def test_sink_payload_is_valid_json(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    sink.on_event(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=_t(1.0)))

    events = repo.get_ride_events(sink.current_ride_id)
    for row in events:
        parsed = json.loads(row["payload"])
        assert isinstance(parsed, dict)


def test_sink_handles_no_power_samples(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    ride_id = sink.current_ride_id
    sink.on_event(RideEnded(elapsed_s=60, t_mono=_t(60.0)))

    ride = repo.get_ride(ride_id)
    assert ride["avg_power_w"] is None
    assert ride["max_power_w"] is None


def test_sink_new_ride_after_previous_ends(sink, repo):
    sink.on_event(RideStarted(route_id="r1", laps=1, warmup_s=0, cooldown_s=0, erg_mode=False, t_mono=_t()))
    sink.on_event(RideEnded(elapsed_s=60, t_mono=_t(60.0)))

    sink.on_event(RideStarted(route_id="r2", laps=2, warmup_s=120, cooldown_s=60, erg_mode=True, t_mono=_t(120.0)))
    ride_id2 = sink.current_ride_id

    rides = repo.list_rides()
    assert len(rides) == 2
    ride2 = repo.get_ride(ride_id2)
    assert ride2["route_id"] == "r2"
    assert ride2["laps"] == 2
    assert ride2["erg_mode"] == 1


def test_migration_creates_rides_table(tmp_path):
    """Verify that migrations 002 and 003 run correctly on a fresh DB."""
    conn = get_connection(tmp_path / "fresh.db")
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "rides" in tables
    assert "ride_events" in tables
    user_ver = conn.execute("PRAGMA user_version").fetchone()[0]
    assert user_ver >= 3
