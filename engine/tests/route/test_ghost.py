"""Tests for engine.route.ghost — GhostSnapshot.dist_m and GhostTracker."""
from __future__ import annotations

import pytest

from engine.route.ghost import GhostSnapshot, GhostTracker, preprocess_strava_streams


def _linear_tracker(total_dist_m: float = 1000.0, total_time_s: float = 100.0) -> GhostTracker:
    """Ghost that moves at uniform pace over a straight 5-point route."""
    lats = [52.520 + i * 0.001 for i in range(5)]
    lons = [13.400 + i * 0.001 for i in range(5)]
    step = total_dist_m / 4
    cum = [step * i for i in range(5)]
    return GhostTracker.from_fallback(lats, lons, cum, total_time_s)


# ------------------------------------------------------------------
# GhostSnapshot.dist_m
# ------------------------------------------------------------------

def test_snapshot_dist_m_at_start():
    """At elapsed=0 ghost should be at dist_m=0."""
    gt = _linear_tracker()
    snap = gt.snapshot(rider_position_m=0.0)
    assert snap.dist_m == pytest.approx(0.0, abs=1.0)


def test_snapshot_dist_m_at_halfway():
    """At elapsed=50s ghost should be near 500 m on a 1000 m / 100 s route."""
    gt = _linear_tracker(total_dist_m=1000.0, total_time_s=100.0)
    # Advance ghost clock by 50 s
    gt._elapsed_s = 50.0
    snap = gt.snapshot(rider_position_m=500.0)
    assert snap.dist_m == pytest.approx(500.0, abs=5.0)


def test_snapshot_dist_m_at_end():
    """At elapsed=total_time ghost should be at or near total_dist_m."""
    gt = _linear_tracker(total_dist_m=1000.0, total_time_s=100.0)
    gt._elapsed_s = 100.0
    snap = gt.snapshot(rider_position_m=1000.0)
    # Modulo behaviour: laps at total time → wraps back to 0
    assert snap.dist_m == pytest.approx(0.0, abs=10.0)


def test_snapshot_dist_m_midway_no_modulo():
    """dist_m is within [0, total_dist_m] for elapsed in (0, total_time)."""
    gt = _linear_tracker(total_dist_m=2000.0, total_time_s=200.0)
    gt._elapsed_s = 75.0
    snap = gt.snapshot(rider_position_m=500.0)
    assert 0.0 <= snap.dist_m <= 2000.0


def test_snapshot_empty_tracker_returns_zero_dist():
    """Empty tracker returns GhostSnapshot with dist_m=0."""
    gt = GhostTracker([], [], [], [])
    snap = gt.snapshot(rider_position_m=0.0)
    assert snap.dist_m == 0.0


def test_ghost_snapshot_named_tuple_has_dist_m():
    """GhostSnapshot exposes dist_m as a named field."""
    snap = GhostSnapshot(lat=1.0, lng=2.0, bearing_deg=90.0, time_gap_s=3.0, dist_m=250.0)
    assert snap.dist_m == 250.0


# ------------------------------------------------------------------
# _dist_at_time helper
# ------------------------------------------------------------------

def test_dist_at_time_interpolates():
    """_dist_at_time interpolates linearly between waypoints."""
    gt = _linear_tracker(total_dist_m=1000.0, total_time_s=100.0)
    # At t=25 s (quarter of route) should be ~250 m
    dist = gt._dist_at_time(25.0)
    assert dist == pytest.approx(250.0, abs=5.0)


def test_dist_at_time_before_start():
    """elapsed_s <= 0 returns first cum_dist entry."""
    gt = _linear_tracker()
    assert gt._dist_at_time(0.0) == pytest.approx(0.0)


def test_dist_at_time_beyond_end():
    """elapsed_s > total_time clamped to last cum_dist."""
    gt = _linear_tracker(total_dist_m=1000.0, total_time_s=100.0)
    dist = gt._dist_at_time(999.0)
    assert dist == pytest.approx(1000.0, abs=1.0)


# ------------------------------------------------------------------
# Strava ghost preprocessing
# ------------------------------------------------------------------

def test_preprocess_removes_no_progress_waiting_time():
    """A traffic-light-style wait is compressed out of the corrected timeline."""
    times = list(range(0, 29))
    distances = [float(min(t * 5, 20)) for t in times]
    for t in range(5, 26):
        distances[t] = 20.0
    for t in range(26, 29):
        distances[t] = 20.0 + (t - 25) * 5.0
    latlng = [[52.0 + d / 111_000.0, 13.0] for d in distances]
    streams = {
        "time": {"data": times},
        "distance": {"data": distances},
        "latlng": {"data": latlng},
    }

    profile = preprocess_strava_streams(streams)

    assert profile.summary.removed_stop_count >= 1
    assert profile.summary.removed_stop_time_s >= 15.0
    assert profile.times_s[-1] < times[-1] - 10.0
    assert profile.cum_dist_m[-1] == pytest.approx(distances[-1])


def test_preprocess_preserves_slow_uphill_progress():
    """Slow riding with real distance progress is not classified as a stop."""
    times = list(range(0, 31))
    distances = [t * 1.2 for t in times]
    latlng = [[52.0 + d / 111_000.0, 13.0] for d in distances]
    streams = {
        "time": {"data": times},
        "distance": {"data": distances},
        "latlng": {"data": latlng},
    }

    profile = preprocess_strava_streams(streams)

    assert profile.summary.removed_stop_count == 0
    assert profile.summary.corrected_duration_s == pytest.approx(profile.summary.raw_duration_s)


def test_preprocess_interpolates_single_point_gps_spike_without_distance_stream():
    """A one-sample GPS jump does not create a huge fallback-distance teleport."""
    latlng = [
        [52.0, 13.0],
        [52.00005, 13.0],
        [52.02, 13.02],
        [52.00010, 13.0],
        [52.00015, 13.0],
    ]
    streams = {
        "time": {"data": [0, 1, 2, 3, 4]},
        "latlng": {"data": latlng},
    }

    profile = preprocess_strava_streams(streams)

    assert profile.cum_dist_m[-1] < 30.0
    assert any("interpolated_gps_spikes" in warning for warning in profile.summary.warnings)
