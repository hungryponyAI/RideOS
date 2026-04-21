"""Tests for engine.route.loader — ROUTE-01 coverage.

Wave 0 scaffolding: these tests MUST fail with ImportError until Task 2
creates loader.py. This is the TDD RED commit.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_load_gpx_simple_returns_route_data():
    """ROUTE-01: load_gpx parses 3-point GPX into RouteData with all arrays aligned."""
    from engine.route.loader import load_gpx
    from engine.route.model import RouteData

    route = load_gpx(str(FIXTURES / "route_simple.gpx"))
    assert isinstance(route, RouteData)
    assert len(route.lats) == 3
    assert len(route.lons) == 3
    assert len(route.elevations_m) == 3
    assert len(route.cum_dist_m) == 3
    assert len(route.grades_pct) == 3
    assert route.lats[0] == pytest.approx(52.5200)
    assert route.lons[0] == pytest.approx(13.4050)
    assert route.elevations_m == (100.0, 110.0, 120.0)
    # cum_dist starts at 0
    assert route.cum_dist_m[0] == 0.0
    # Each hop across ~0.001 deg at lat 52 is ~130 m; total ~260 m
    assert 200.0 < route.total_dist_m < 350.0
    assert route.total_dist_m == route.cum_dist_m[-1]


def test_missing_elevation_coerced_to_zero(caplog):
    """ROUTE-01 Pitfall 1: missing <ele> tags become 0.0 with a warning log."""
    import logging
    from engine.route.loader import load_gpx

    with caplog.at_level(logging.WARNING, logger="rideos.route"):
        route = load_gpx(str(FIXTURES / "route_no_elevation.gpx"))
    assert route.elevations_m == (0.0, 0.0)
    # A warning about missing elevation must be logged
    assert any("elevation" in rec.message.lower() for rec in caplog.records)


def test_grade_clamp_enforces_kickr_range():
    """ROUTE-01 Pitfall 2: smoothed grades array is bounded to [-20.0, 20.0]."""
    from engine.route.loader import load_gpx

    route = load_gpx(str(FIXTURES / "route_simple.gpx"))
    for g in route.grades_pct:
        assert -20.0 <= g <= 20.0


def test_empty_gpx_raises_value_error(tmp_path):
    """ROUTE-01: GPX with no track points must raise ValueError, not silently return empty RouteData."""
    from engine.route.loader import load_gpx

    empty = tmp_path / "empty.gpx"
    empty.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>\n'
    )
    with pytest.raises(ValueError) as excinfo:
        load_gpx(str(empty))
    assert str(empty) in str(excinfo.value) or repr(str(empty)) in str(excinfo.value)


def test_rolling_mean_basic():
    """5-point rolling mean helper must exist and handle short inputs gracefully."""
    from engine.route.loader import _rolling_mean

    # Uniform input → uniform output
    assert _rolling_mean([1.0, 1.0, 1.0, 1.0, 1.0], window=5) == [1.0, 1.0, 1.0, 1.0, 1.0]
    # Single value → single value
    assert _rolling_mean([5.0], window=5) == [5.0]
    # Length must be preserved
    out = _rolling_mean([0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0], window=5)
    assert len(out) == 7
