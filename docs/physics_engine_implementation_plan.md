# Physics Engine Implementation Plan

## Context

`docs/physics_engine_guideline.md` is currently empty, so this plan is derived from the existing RideOS engine architecture and the likely physics goals implied by the current ride loop:

- The trainer publishes telemetry through BLE.
- `RideStateProjection` stores the current speed, power, cadence, route position, grade, and phase state.
- `RouteTracker` advances virtual position from trainer speed and publishes `PositionAdvanced`.
- The FTMS control loop sends either route grade simulation or ERG target power.

The implementation should keep that flow intact. The physics engine should be added as a small pure-domain layer, not as a broad architecture rewrite.

## Goals

- Improve virtual position behavior by deriving route progress from a simple cycling physics model.
- Keep trainer control behavior stable: FTMS grade simulation remains the normal output path.
- Preserve existing route, phase, projection, event bus, and WebSocket boundaries.
- Make the model testable without BLE, asyncio, or UI dependencies.
- Allow the physics model to be enabled gradually with a fallback to the existing speed-based tracker.

## Non-Goals

- Do not restructure `engine/engine` folders.
- Do not migrate the engine to TypeScript in this phase.
- Do not replace the BLE, FTMS, event bus, route loader, or WebSocket architecture.
- Do not add a full rigid-body or drivetrain simulation.
- Do not make the UI responsible for physics calculations.

## Proposed Design

### 1. Add Pure Physics Functions

Add a new domain module:

```text
engine/engine/domain/physics.py
engine/tests/domain/test_physics.py
```

This module should contain only dataclasses and pure functions. Suggested API:

```python
@dataclass(frozen=True)
class PhysicsConfig:
    rider_mass_kg: float
    bike_mass_kg: float = 10.0
    crr: float = 0.004
    air_density_kg_m3: float = 1.225
    cda_m2: float | None = None
    drivetrain_efficiency: float = 0.97
    gravity_ms2: float = 9.80665


@dataclass(frozen=True)
class PhysicsState:
    speed_ms: float


def estimate_cda(weight_kg: float, height_cm: float) -> float:
    ...


def resistive_force_n(speed_ms: float, grade_pct: float, config: PhysicsConfig) -> float:
    ...


def advance_physics(
    state: PhysicsState,
    power_w: float | None,
    grade_pct: float,
    dt: float,
    config: PhysicsConfig,
) -> PhysicsState:
    ...
```

The first implementation should be intentionally simple:

- Convert grade percent to slope angle.
- Calculate gravity, rolling resistance, and aerodynamic drag.
- Convert rider power into drive force.
- Integrate acceleration with semi-implicit Euler.
- Clamp speed to a sane range, for example `0 <= speed_ms <= 30`.
- Treat missing power as zero power.

### 2. Extend Position Advance Without Replacing It

Keep `engine.domain.tracker.advance_position()` as the simple speed-based helper. Add a sibling helper instead of changing callers broadly:

```python
def advance_position_with_physics(
    position_m: float,
    physics_state: PhysicsState,
    power_w: float | None,
    grade_pct: float,
    dt: float,
    total_dist_m: float,
    config: PhysicsConfig,
) -> tuple[float, PhysicsState]:
    ...
```

This keeps the existing tracker tests meaningful and gives the route tracker one narrow optional integration point.

### 3. Add an Optional Tracker Mode

Update `engine/engine/route/tracker.py` conservatively:

- Add optional constructor parameters:
  - `physics_config: PhysicsConfig | None = None`
  - `initial_speed_ms: float = 0.0`
- Keep existing `run(speed_fn, stop_event, tick_s=...)` behavior unchanged when `physics_config is None`.
- Add an optional `power_fn` parameter to `run()`:

```python
async def run(
    self,
    speed_fn: Callable[[], Optional[float]],
    stop_event: asyncio.Event,
    *,
    tick_s: float = 0.25,
    power_fn: Callable[[], Optional[float]] | None = None,
) -> None:
```

Behavior:

- Without physics config: use current speed-based `advance_position()`.
- With physics config and `power_fn`: advance using power plus current grade.
- With physics config but no power: fall back to speed-based advance.

This avoids forcing the full ride lifecycle to adopt physics immediately.

### 4. Wire Physics Through Ride Startup Behind a Flag

Update `RideService.start_ride()` with a narrow, opt-in flag from the start message:

```python
use_physics = bool(msg.get("physics_mode", False))
```

When enabled:

- Build `PhysicsConfig` from `AthleteProfile`.
- Pass it into `RouteTracker`.
- Pass `power_fn=lambda: self._projection.view.power_w` into `tracker.run()`.

When disabled:

- Preserve current speed-based behavior exactly.

This makes the first release safe and easy to compare against the current tracker.

### 5. Keep Events Stable Initially

Do not change `PositionAdvanced` in the first implementation. Existing UI and projection code can continue reading:

- `position_m`
- `grade_idx`
- `grade_pct`
- `lap_index`

If visibility into simulated speed is needed later, add a separate event after the base model is validated:

```python
@dataclass(frozen=True)
class PhysicsStateUpdated:
    simulated_speed_kmh: float
    acceleration_ms2: float
    t_mono: float
```

That should be a second step, not part of the first minimal integration.

## Implementation Phases

### Phase 1: Pure Physics Core

Files:

- `engine/engine/domain/physics.py`
- `engine/tests/domain/test_physics.py`

Tasks:

- Add `PhysicsConfig` and `PhysicsState`.
- Add CdA estimate helper, reusing the formula currently embedded in `engine/engine/control/controller.py`.
- Add force and integration functions.
- Test flat road acceleration, uphill deceleration at low power, downhill coasting, missing power, and speed clamps.

Acceptance criteria:

- Physics tests pass deterministically.
- No asyncio, BLE, FTMS, route, or UI dependencies are introduced into `engine.domain.physics`.

### Phase 2: Tracker Integration

Files:

- `engine/engine/domain/tracker.py`
- `engine/engine/route/tracker.py`
- `engine/tests/domain/test_tracker.py`
- `engine/tests/route/test_tracker.py`

Tasks:

- Add `advance_position_with_physics()`.
- Add optional physics state to `RouteTracker`.
- Preserve default speed-based route tracking.
- Add route tracker tests for physics-enabled progress.

Acceptance criteria:

- All existing tracker tests still pass.
- Physics mode advances from power and grade when enabled.
- Existing mode remains byte-for-byte compatible at the behavior level.

### Phase 3: RideService Opt-In Wiring

Files:

- `engine/engine/application/ride_service.py`
- `engine/tests/application/test_ride_service.py`
- possibly `ui/src/types/telemetry.ts` or start-ride request types if a typed request already exists

Tasks:

- Accept `physics_mode` in `start_ride`.
- Create `PhysicsConfig` from `AthleteProfile`.
- Pass `power_fn` to `RouteTracker.run()` only when physics mode is active.
- Keep current route start payloads valid when `physics_mode` is absent.

Acceptance criteria:

- Starting a ride without `physics_mode` behaves as today.
- Starting a ride with `physics_mode: true` uses power-based progression.
- Tests cover both paths.

### Phase 4: UI Toggle And Telemetry Visibility

Files:

- `ui/src/components/RideOptions.tsx`
- related UI state in `ui/src/App.tsx` or existing start-ride payload builder
- optional protocol tests in `ui/src/__tests__/protocol.test.ts`

Tasks:

- Add a restrained "Physics" toggle near existing ride options.
- Include `physics_mode` in the start ride WebSocket message.
- Keep the default off until trainer testing validates the model.

Acceptance criteria:

- Users can start a route with or without physics mode.
- No layout or protocol regressions.

### Phase 5: Validation And Calibration

Tasks:

- Compare route completion times for the same route in speed mode vs physics mode.
- Validate at low cadence/high power, zero power, steep climbs, descents, and trainer telemetry dropouts.
- Tune defaults for bike mass, rolling resistance, CdA, drivetrain efficiency, and speed clamps.
- Decide whether simulated speed should be exposed in UI/debug logs.

Acceptance criteria:

- Physics mode feels plausible on real trainer rides.
- Default mode remains the current stable speed-based tracker until physics mode is proven.

## Risk Controls

- Keep physics behind `physics_mode` until validated.
- Keep FTMS control loop unchanged in the first pass.
- Keep `PositionAdvanced` unchanged in the first pass.
- Prefer pure functions and focused tests before wiring into ride lifecycle.
- Reuse `AthleteProfile` instead of introducing a new settings model.
- Reuse existing folders: `domain`, `route`, `application`, and tests.

## Suggested Test Commands

From `engine/`:

```bash
uv run python -m pytest tests/domain/test_physics.py -q
uv run python -m pytest tests/domain/test_tracker.py tests/route/test_tracker.py -q
uv run python -m pytest tests/application/test_ride_service.py -q
uv run python -m pytest tests/ -q
```

From `ui/`, if the UI toggle is added:

```bash
npm test -- --run
```

## Open Questions

- Should physics mode use only rider power, or blend trainer speed and rider power during dropouts?
- Should downhill simulated speed be allowed to exceed trainer-reported speed?
- Should braking or trainer flywheel behavior be modeled, or should speed simply decay through resistive forces?
- Should virtual gear affect only trainer grade, or also physics progression through an effective grade?
- Should physics mode eventually become default after validation?
