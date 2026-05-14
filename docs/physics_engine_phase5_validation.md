# Physics Engine Phase 5 Validation

Phase 5 is the validation and calibration phase for `physics_mode`. The code path remains opt-in until real trainer rides confirm that route progression feels plausible.

## Pre-Flight

- [ ] `cd engine && uv run pytest tests/ -q`
- [ ] `cd ui && npm test`
- [ ] `cd ui && npm run build`
- [ ] Confirm Node is 20+ with `node --version`
- [ ] Confirm the UI start ride message includes `physics_mode`
- [ ] Confirm default rides start with Physics off

## Offline Calibration Checks

Use the CLI helper before and after tuning defaults:

```bash
cd engine
uv run python -m engine.physics_calibration routes/example.gpx \
  --speed-kmh 25 \
  --power-w 200 \
  --weight-kg 75 \
  --height-cm 180
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
    cda_m2=estimate_cda(75.0, 180.0),
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
| | | | | | | | | |

## Trainer Ride Matrix

Run each test twice when possible: once with Physics off, once with Physics on.

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
| CdA | Bassett estimate from rider height and weight | Flat-road speed diverges mainly at higher speed |
| Drivetrain efficiency | `0.97` | Power feels globally too generous |
| Speed clamp | `30 m/s` | Descents can exceed plausible indoor virtual speed |

Tuning order:

1. Confirm rider weight and height are correct.
2. Tune CdA for high-speed flat efforts.
3. Tune rolling resistance for moderate flat efforts.
4. Tune bike mass only if climbs are broadly off.
5. Leave the speed clamp conservative unless descent validation demands otherwise.

## Telemetry Decision

For Phase 5, simulated speed is **not** exposed in the UI or in `PositionAdvanced`. The current UI and projection contracts stay stable.

Use the offline validation helpers for numeric comparison. Add a dedicated `PhysicsStateUpdated` event later only if trainer validation shows that live simulated speed or acceleration needs to be visible for debugging.

## Sign-Off

- [ ] Physics remains default-off.
- [ ] Default speed-based tracking is unchanged.
- [ ] Offline edge-case validation passes.
- [ ] Trainer ride matrix is recorded.
- [ ] Any tuned defaults are backed by before/after completion-time notes.

Signed: `<name>`  Date: `<YYYY-MM-DD>`
