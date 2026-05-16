"""Domain tests for engine.domain.route — RouteData, parsing, and transformations."""
import pytest
from engine.domain.route import (
    RouteData,
    extract_gpx_name,
    load_gpx_content,
    reverse_route,
    slice_route,
    _rolling_mean,
)

_SIMPLE_GPX = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="52.520" lon="13.405"><ele>100.0</ele></trkpt>
    <trkpt lat="52.521" lon="13.406"><ele>110.0</ele></trkpt>
    <trkpt lat="52.522" lon="13.407"><ele>120.0</ele></trkpt>
  </trkseg></trk>
</gpx>
"""

_NAMED_GPX = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>My Route</name><trkseg>
    <trkpt lat="52.520" lon="13.405"><ele>100.0</ele></trkpt>
    <trkpt lat="52.521" lon="13.406"><ele>110.0</ele></trkpt>
  </trkseg></trk>
</gpx>
"""

_EMPTY_GPX = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>
"""

_NO_ELE_GPX = """\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="52.520" lon="13.405"></trkpt>
    <trkpt lat="52.521" lon="13.406"></trkpt>
  </trkseg></trk>
</gpx>
"""


def test_load_gpx_content_basic():
    route = load_gpx_content(_SIMPLE_GPX)
    assert isinstance(route, RouteData)
    assert len(route.lats) == 3
    assert route.cum_dist_m[0] == 0.0
    assert route.total_dist_m == route.cum_dist_m[-1]
    assert route.total_dist_m > 0


def test_load_gpx_content_elevations():
    route = load_gpx_content(_SIMPLE_GPX)
    assert route.elevations_m == (100.0, 110.0, 120.0)


def test_load_gpx_content_empty_raises():
    with pytest.raises(ValueError, match="no track points"):
        load_gpx_content(_EMPTY_GPX)


def test_load_gpx_content_missing_elevation_coerced(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="rideos.route"):
        route = load_gpx_content(_NO_ELE_GPX)
    assert route.elevations_m == (0.0, 0.0)
    assert "no elevation" in caplog.text.lower()


def test_load_gpx_content_custom_source_label():
    with pytest.raises(ValueError) as exc:
        load_gpx_content(_EMPTY_GPX, source_label="my_file.gpx")
    assert "my_file.gpx" in str(exc.value)


def test_extract_gpx_name_from_root():
    assert extract_gpx_name(_NAMED_GPX) == "My Route"


def test_extract_gpx_name_fallback():
    name = extract_gpx_name(_SIMPLE_GPX)
    assert name.startswith("Route ")


def test_reverse_route():
    route = load_gpx_content(_SIMPLE_GPX)
    rev = reverse_route(route)
    assert rev.lats[0] == pytest.approx(route.lats[-1])
    assert rev.total_dist_m == pytest.approx(route.total_dist_m)
    assert rev.cum_dist_m[0] == 0.0


def test_reverse_route_single_point():
    r = RouteData(
        lats=(1.0,), lons=(1.0,), elevations_m=(0.0,),
        cum_dist_m=(0.0,), grades_pct=(0.0,), total_dist_m=0.0,
    )
    rev = reverse_route(r)
    assert rev is r  # returned unchanged


def test_slice_route():
    route = load_gpx_content(_SIMPLE_GPX)
    sliced = slice_route(route, 0.0, route.total_dist_m / 2)
    assert sliced.cum_dist_m[0] == 0.0
    assert sliced.total_dist_m < route.total_dist_m


def test_slice_route_interpolates_exact_cut_start_and_end():
    route = load_gpx_content(_SIMPLE_GPX)
    start_m = route.cum_dist_m[0] + (route.cum_dist_m[1] - route.cum_dist_m[0]) / 2
    end_m = route.cum_dist_m[1] + (route.cum_dist_m[2] - route.cum_dist_m[1]) / 2

    sliced = slice_route(route, start_m, end_m)

    assert sliced.cum_dist_m[0] == pytest.approx(0.0)
    assert sliced.total_dist_m == pytest.approx(end_m - start_m)
    assert sliced.lats[0] == pytest.approx((route.lats[0] + route.lats[1]) / 2)
    assert sliced.lons[0] == pytest.approx((route.lons[0] + route.lons[1]) / 2)
    assert sliced.elevations_m[0] == pytest.approx((route.elevations_m[0] + route.elevations_m[1]) / 2)
    assert sliced.lats[-1] == pytest.approx((route.lats[1] + route.lats[2]) / 2)
    assert sliced.lons[-1] == pytest.approx((route.lons[1] + route.lons[2]) / 2)


def test_slice_route_start_ge_end_raises():
    route = load_gpx_content(_SIMPLE_GPX)
    with pytest.raises(ValueError, match="start_m"):
        slice_route(route, 500.0, 100.0)


def test_rolling_mean_basic():
    result = _rolling_mean([1.0, 2.0, 3.0, 4.0, 5.0], window=3)
    assert len(result) == 5
    assert result[2] == pytest.approx(3.0)  # centered: (2+3+4)/3


def test_rolling_mean_empty():
    assert _rolling_mean([]) == []


def test_rolling_mean_single():
    assert _rolling_mean([7.0]) == [7.0]
