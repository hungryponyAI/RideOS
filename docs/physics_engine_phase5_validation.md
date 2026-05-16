# Physics Engine Phase 5 Validation

Phase 5 is the validation and calibration phase for `physics_mode`. Physics mode is now the default route progression path; speed mode remains available by explicitly sending `physics_mode: false`.

## Pre-Flight

- [ ] `cd engine && uv run pytest tests/ -q`
- [ ] `cd ui && npm test`
- [ ] `cd ui && npm run build`
- [ ] Confirm Node is 20+ with `node --version`
- [ ] Confirm the UI start ride message includes `physics_mode`
- [ ] Confirm default rides start with Physics on

## Offline Calibration Checks

Use the CLI helper before and after tuning defaults:

```bash
cd engine
uv run python -m engine.physics_calibration routes/example.gpx \
  --speed-kmh 25 \
  --power-w 200 \
  --weight-kg 75 \
  --height-cm 180 \
  --grade-scale 0.25
```

Or use `engine.domain.physics_validation` directly from Python.

Example:

```python
from engine.domain.physics import PhysicsConfig, estimate_cda
from engine.domain.physics_validation import compare_completion_times, validate_edge_cases
from engine.route.loader import load_gpx

route = load_gpx("routes/example.gpx")
config = PhysicsConfig(
    rider_mass_kg=75.0,
    cda_m2=max(0.40, estimate_cda(75.0, 180.0)),
    grade_scale=0.25,
    baseline_resistance_n=4.0,
)

comparison = compare_completion_times(
    route,
    speed_kmh=25.0,
    power_w=200.0,
    config=config,
    initial_speed_ms=25.0 / 3.6,
)
print(comparison)
print(validate_edge_cases(config))
```

Record:

| Route | Speed Mode | Physics Mode | Delta | Rider kg | Bike kg | CdA | Crr | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `Gravel-Fahrt_am_Abend_-_Rise_of_the_Phoe_92213377.gpx` | complete, `2547.0s`, `17,687.4m`, `25.0km/h` | complete, `1856.2s`, `17,687.4m`, `33.4km/h` final, `42.9km/h` max | `-690.7s` | `75.0` | `10.0` | `0.304` | `0.0040` | Initial run before calibration: full gradient effect and optimistic CdA made physics mode `11m 30.7s` faster at `200W`; route distance `17.69km`. |
| `Gravel-Fahrt_am_Abend_-_Rise_of_the_Phoe_92213377.gpx` | complete, `2547.0s`, `17,687.4m`, `25.0km/h` | complete, `1954.8s`, `17,687.4m`, `32.2km/h` final, `36.8km/h` max | `-592.2s` | `75.0` | `10.0` | `0.360` | `0.0040` | After calibration: `grade_scale=0.50` and CdA floor `0.360`; downhill max speed reduced by `6.1km/h`. |
| `Gravel-Fahrt_am_Abend_-_Rise_of_the_Phoe_92213377.gpx` | complete, `2547.0s`, `17,687.4m`, `25.0km/h` | complete, `2163.8s`, `17,687.4m`, `29.3km/h` final, `31.5km/h` max | `-383.2s` | `75.0` | `10.0` | `0.400` | `0.0040` | Second calibration: `grade_scale=0.25`, CdA floor `0.400`, baseline resistance `4.0N`; shallow descents retain positive load and uphill ramp is softer. |

Edge-case result from offline calibration:

| Edge Case | Result | Detail |
|---|---|---|
| Zero power on flat | PASS | `6.00 -> 5.62 m/s` |
| Missing power equals zero power | PASS | missing `5.62 m/s`, zero `5.62 m/s` |
| Steep climb, low power | PASS | `4.00 -> 3.60 m/s` |
| Steep climb, high power beats low power | PASS | low `3.60 m/s`, high `6.00 m/s` |
| Descent coasting accelerates | PASS | `4.00 -> 4.13 m/s` |

## Trainer Ride Matrix

Run each test twice when possible: once with Physics off, once with Physics on.

## Resistance Investigation

Finding: there was no watt/newton unit mix in the virtual progression model. The virtual physics path uses:

- rider power in watts
- drive force as `power_w / speed_ms`
- gravity, rolling resistance, and aerodynamic drag in newtons
- acceleration as `net_force_n / total_mass_kg`

The issue was that physical trainer resistance used a separate FTMS simulation path. Before calibration, the KICKR received:

- raw virtual-gear effective grade
- `crr=0.004`
- CdA from the Bassett estimate, which was only `0.304 m^2` for a `75 kg / 180 cm` rider
- no baseline load approximation

That explains the ride feel: flat/downhill felt too light because FTMS rolling and aero terms were low, while uphill got strong quickly because grade was not scaled.

Current FTMS trainer simulation calibration:

| Parameter | Value |
|---|---:|
| Grade sent to trainer | `effective_grade * 0.25` |
| CdA floor for `cw` | `0.40 m^2` |
| `cw` sent to FTMS at 75 kg / 180 cm | `0.49 kg/m` |
| Base Crr | `0.004` |
| Baseline load approximation | `4.0 N` |
| Equivalent Crr sent to FTMS at 75 kg + 10 kg bike | `0.0088` |

At gear 6, the calibrated grade sent to FTMS is:

| Route Grade | FTMS Grade |
|---:|---:|
| `-6.0%` | `-1.66%` |
| `-3.0%` | `-0.83%` |
| `-1.0%` | `-0.28%` |
| `0.0%` | `0.00%` |
| `+1.0%` | `+0.28%` |
| `+3.0%` | `+0.83%` |
| `+6.0%` | `+1.66%` |

| # | Case | Expected Physics Behavior | Actual | Status |
|---|---|---|---|---|
| 1 | Flat route, steady 150-200 W | Stable plausible virtual speed; no runaway acceleration | | PASS / FAIL |
| 2 | Flat route, zero power | Virtual speed decays toward zero | | PASS / FAIL |
| 3 | Steep climb, low power | Route progress slows noticeably | | PASS / FAIL |
| 4 | Steep climb, high power / low cadence | Progress is higher than low power, no unrealistic jump | | PASS / FAIL |
| 5 | Descent, coasting | Speed can rise from gravity but remains under clamp | | PASS / FAIL |
| 6 | Trainer telemetry dropout | Missing power behaves like zero power; no crash | | PASS / FAIL |
| 7 | Same route, speed vs physics | Completion times are explainable by rider power and grade | | PASS / FAIL |

## Calibration Defaults

Current defaults:

| Parameter | Default | Tune If |
|---|---:|---|
| Bike mass | `10.0 kg` | Climbs feel too easy or too hard for all riders |
| Rolling resistance | `0.004` | Flat-road speed is consistently too fast or too slow |
| CdA | `max(0.40, Bassett estimate)` unless overridden | Flat-road speed diverges mainly at higher speed |
| Grade scale | `0.25` | Small climbs/descents feel exaggerated or too muted |
| Baseline resistance | `4.0 N` | Flat/downhill feels like there is almost no load |
| Drivetrain efficiency | `0.97` | Power feels globally too generous |
| Speed clamp | `30 m/s` | Descents can exceed plausible indoor virtual speed |

Tuning order:

1. Confirm rider weight and height are correct.
2. Tune CdA for high-speed flat efforts.
3. Tune rolling resistance for moderate flat efforts.
4. Tune grade scale if small inclines/declines feel too aggressive.
5. Tune bike mass only if climbs are broadly off.
6. Leave the speed clamp conservative unless descent validation demands otherwise.

## Telemetry Decision

For Phase 5, simulated speed is **not** exposed in the UI or in `PositionAdvanced`. The current UI and projection contracts stay stable.

Use the offline validation helpers for numeric comparison. Add a dedicated `PhysicsStateUpdated` event later only if trainer validation shows that live simulated speed or acceleration needs to be visible for debugging.

## Sign-Off

- [ ] Physics remains default-on, with speed mode still available through `physics_mode: false`.
- [ ] Default speed-based tracking is unchanged.
- [x] Offline edge-case validation passes.
- [ ] Trainer ride matrix is recorded.
- [ ] Any tuned defaults are backed by before/after completion-time notes.

Signed: `<name>`  Date: `<YYYY-MM-DD>`
