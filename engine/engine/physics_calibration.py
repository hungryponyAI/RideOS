"""Command-line helper for offline physics calibration checks."""
from __future__ import annotations

import argparse

from engine.domain.physics import PhysicsConfig, estimate_cda
from engine.domain.physics_validation import compare_completion_times, validate_edge_cases
from engine.route.loader import load_gpx


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare speed and physics route completion.")
    parser.add_argument("gpx_path", help="Path to a GPX route")
    parser.add_argument("--speed-kmh", type=float, default=25.0)
    parser.add_argument("--power-w", type=float, default=200.0)
    parser.add_argument("--weight-kg", type=float, default=75.0)
    parser.add_argument("--height-cm", type=float, default=180.0)
    parser.add_argument("--bike-kg", type=float, default=10.0)
    parser.add_argument("--crr", type=float, default=0.004)
    parser.add_argument("--dt-s", type=float, default=0.25)
    args = parser.parse_args(argv)

    config = PhysicsConfig(
        rider_mass_kg=args.weight_kg,
        bike_mass_kg=args.bike_kg,
        crr=args.crr,
        cda_m2=estimate_cda(args.weight_kg, args.height_cm),
    )
    route = load_gpx(args.gpx_path)
    comparison = compare_completion_times(
        route,
        speed_kmh=args.speed_kmh,
        power_w=args.power_w,
        config=config,
        dt_s=args.dt_s,
        initial_speed_ms=args.speed_kmh / 3.6,
    )

    print(f"Route distance: {route.total_dist_m / 1000.0:.2f} km")
    print(f"Config: rider={args.weight_kg:.1f} kg bike={args.bike_kg:.1f} kg crr={args.crr:.4f} cda={config.cda_m2:.3f} m^2")
    print(f"Speed mode:   {_format_estimate(comparison.speed_mode)}")
    print(f"Physics mode: {_format_estimate(comparison.physics_mode)}")
    if comparison.delta_s is not None:
        print(f"Delta:        {comparison.delta_s:+.1f} s")
    else:
        print("Delta:        n/a; at least one mode did not complete")

    print("Edge cases:")
    for result in validate_edge_cases(config):
        status = "PASS" if result.passed else "FAIL"
        print(f"  {status} {result.name}: {result.detail}")
    return 0


def _format_estimate(estimate) -> str:
    status = "complete" if estimate.completed else "incomplete"
    return (
        f"{status}, {estimate.elapsed_s:.1f}s, "
        f"final={estimate.final_position_m:.1f}m, "
        f"speed={estimate.final_speed_ms * 3.6:.1f}km/h "
        f"(max {estimate.max_speed_ms * 3.6:.1f})"
    )


if __name__ == "__main__":
    raise SystemExit(main())
