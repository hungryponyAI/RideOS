# Oudena Smart Trainer Implementation Plan

## Summary

This plan translates `docs/guidelines/OUDENA_SMART_TRAINER_IMPLEMENTATION_GUIDELINE.md` into a phased roadmap for the current RideOS/Oudena repository.

The guideline describes a future TypeScript/Capacitor trainer architecture, but the current repo is a Python BLE/FTMS engine with a React UI connected through WebSockets. This plan therefore adapts the guideline to the existing architecture while keeping the design compatible with a later iOS/Capacitor port.

Primary MVP target:

- Wahoo KICKR CORE 2 as the officially tested reference trainer.
- BLE FTMS first.
- Capability-based behavior instead of model-specific ride logic.
- Generic support path for Garmin Tacx, Elite, Zwift Hub, JetBlack, Saris, and other standard-compatible FTMS trainers.
- ANT+ FE-C prepared as a future protocol, not implemented in the MVP.

## Current Architecture Context

The current implementation already contains several important pieces:

- Python engine owns BLE through `bleak`.
- React UI talks to the engine over WebSockets.
- Existing BLE flow scans for a Wahoo KICKR CORE, subscribes to FTMS Indoor Bike Data, and writes FTMS control commands.
- Existing control loop can send simulation grade and ERG target power.
- Virtual gearing exists through keyboard and Zwift Click input paths.
- The physics engine and route tracking are already being moved toward pure domain modules.

The implementation should preserve these working paths while replacing KICKR-specific assumptions with trainer capabilities.

## Key Interface Changes

The narrow current `TrainerPort` should grow into a capability-based trainer API covering:

- device discovery
- connection state
- telemetry
- control modes
- trainer capabilities
- safe fallback behavior
- command scheduling
- actionable error states

Add or expand domain/data models for:

- `TrainerDevice`
- `TrainerCapabilities`
- `TrainerTelemetry`
- `TrainerState`
- `TrainerError`
- `ConnectionQuality`
- `TrainerCommand`

Important architectural rules:

- BLE, FTMS parsing, reconnect, and command writes stay inside engine adapters.
- The UI consumes WebSocket state and sends high-level user intents only.
- The physics engine outputs grade, target watts, or resistance intent, but never checks trainer vendor or model.
- Zwift Click is treated as a separate input device, not as part of trainer connection state.

## Phase 0: Planning Artifact

### Goal

Create the implementation source of truth for trainer integration.

### Tasks

- Save this roadmap in `docs/oudena_smart_trainer_implementation_plan.md`.
- Document that the guideline's TypeScript interfaces are being mapped onto the current Python engine architecture.
- Record current constraints:
  - Python `bleak` owns BLE.
  - React UI communicates by WebSocket.
  - No Capacitor project exists yet.
  - Wahoo KICKR CORE 2 remains the reference physical trainer.

### Acceptance Criteria

- This docs file exists.
- The implementation target is clear enough for a coding agent or developer to start Phase 1 without choosing a new architecture.

## Phase 1: Trainer Domain Boundaries

### Goal

Replace KICKR-specific control assumptions with a generic trainer abstraction while keeping the current Wahoo flow working.

### Tasks

- Expand `engine/engine/ports/trainer.py` from write-only control into the public trainer abstraction.
- Add pure trainer domain models for device identity, capabilities, telemetry, state, control modes, support levels, and errors.
- Keep existing Wahoo behavior working through compatibility wrappers while the new abstraction lands.
- Move user-facing concepts from KICKR-specific status toward generic trainer status where practical.
- Preserve the rule that ride logic depends on capabilities, not trainer brand or model.

### Acceptance Criteria

- Current Wahoo ride flow still works.
- Core ride/control code can depend on capabilities instead of Wahoo/KICKR identity.
- No UI component writes BLE commands directly.
- No physics code checks trainer brand or model.

## Phase 2: FTMS Capability Detection

### Goal

Represent any detected FTMS trainer through explicit capabilities.

### Tasks

- Generalize scanner behavior from "find KICKR" to "discover trainer candidates".
- Detect FTMS service support.
- Read manufacturer and model metadata where available.
- Read supported FTMS features where available.
- Add safe device hints for:
  - Wahoo KICKR / KICKR CORE
  - Garmin Tacx NEO / FLUX
  - Elite Direto / Justo / Suito
  - Zwift Hub / Hub One
  - JetBlack Volt / Victory
  - Saris H3 / H4
- Classify devices as:
  - `officially-tested`
  - `standard-compatible`
  - `experimental`
- Never infer unsupported features from brand alone.

### Acceptance Criteria

- Wahoo KICKR CORE 2 is detected as officially tested.
- Unknown FTMS trainers can be represented without hardcoded model paths.
- Capability detection fails safely when services or feature reads are incomplete.

## Phase 3: Command Scheduler And Control Modes

### Goal

Make trainer control reliable across BLE timing constraints and mixed trainer capabilities.

### Tasks

- Introduce a trainer command scheduler that:
  - serializes BLE writes
  - throttles writes to 2-4 Hz
  - deduplicates repeated values
  - prioritizes safety decreases
  - avoids stale commands after reconnect
  - retries carefully on transient failures
- Support these explicit control modes:
  - Simulation
  - ERG
  - Resistance
  - Read-only
- Move current grade and ERG write behavior behind scheduled trainer commands.
- Implement fallback order:
  - Simulation Mode
  - Resistance Mode
  - ERG Mode when appropriate
  - Read-only ride

### Acceptance Criteria

- FTMS writes remain stable.
- No command spam occurs.
- Unsupported control modes degrade gracefully.
- Safety-critical decreases can bypass normal smoothing where needed.

## Phase 4: Reconnect, Telemetry Stability, And Safety

### Goal

Handle temporary BLE loss without losing the ride or leaving the trainer in an unsafe state.

### Tasks

- Promote reconnect state into generic `TrainerState`.
- Derive connection quality from packet age, update rate, and available signal metadata.
- On disconnect:
  - freeze latest trainer telemetry
  - mark connection as weak or lost
  - avoid increasing resistance
  - attempt reconnect
  - reapply control mode after reconnect
  - resend the latest safe command
- Replace KICKR-only WebSocket status with generic trainer status while preserving UI compatibility during migration.
- Use actionable user-facing errors for permission, disabled Bluetooth, connection timeout, missing FTMS service, unsupported device, command failure, telemetry timeout, and reconnect failure.

### Acceptance Criteria

- Temporary disconnect does not crash the ride.
- The UI can show clear trainer connection state.
- Reconnect resumes the previous safe control mode.
- Long telemetry loss prevents increasing resistance.

## Phase 5: Wahoo Reference Validation

### Goal

Make Wahoo KICKR CORE 2 the production-ready reference implementation.

### Tasks

- Validate scan and connect.
- Validate power, cadence, speed, and distance telemetry.
- Validate Simulation Mode.
- Validate ERG Mode.
- Validate Resistance Mode or document unsupported behavior clearly.
- Validate reconnect during a ride.
- Validate ride start/stop.
- Validate command smoothing.
- Validate safe shutdown reset.
- Document observed Wahoo behavior as reference validation, not app-wide logic.

### Acceptance Criteria

- Wahoo KICKR CORE 2 works through the new trainer abstraction.
- Wahoo KICKR CORE 2 is marked as officially tested.
- No Wahoo-specific logic leaks into physics or UI ride logic.

## Phase 6: Setup And Device UX

### Goal

Let a user pair and reuse a trainer without developer assistance.

### Tasks

- Add setup wizard behavior through the current React/WebSocket architecture:
  - Bluetooth or engine status check
  - trainer scan
  - trainer selection
  - capability summary
  - quick control test
  - save known device
  - reconnect to previous trainer
  - manual override
- Show:
  - device name
  - manufacturer
  - protocol
  - support level
  - recommended badge
  - connection quality when available
- Store known trainer profile locally in the engine persistence layer first.
- Leave Capacitor Preferences as later mobile-port work.

### Acceptance Criteria

- The user can pair and reuse a trainer.
- Officially tested, standard-compatible, and experimental devices are visually distinct.
- Previously paired trainer reconnect is preferred but can be manually overridden.

## Phase 7: Virtual Shifting And Auto Shifting

### Goal

Keep shifting independent from trainer hardware and support stable auto shifting.

### Tasks

- Keep virtual gearbox independent from trainer hardware.
- Route keyboard, touch UI, and Zwift Click events through one shift-input path.
- Keep Zwift Click connection state separate from trainer connection state.
- Expand from the current gear implementation toward the guideline default of 24 gears only if product fit is confirmed; otherwise document the current 10-gear model as MVP behavior.
- Add cadence-based auto shifting with:
  - preferred cadence default of 85 rpm
  - upper and lower deadbands
  - minimum shift interval
  - manual override timeout
  - no shifting during reconnect
  - no shifting during unstable telemetry
- Add user setting to enable or disable auto shifting.

### Acceptance Criteria

- Manual shifting works through all available inputs.
- Click disconnect does not block riding.
- Auto shifting does not oscillate.
- Manual shift temporarily overrides auto shifting.

## Phase 8: Diagnostics And Wider FTMS Compatibility

### Goal

Support standard-compatible trainers without owning every physical model.

### Tasks

- Add diagnostic export for unknown trainers, including:
  - app version
  - platform
  - device identity
  - services found
  - FTMS features found
  - capabilities detected
  - connection log
  - command log
  - telemetry sample
  - error history
- Add mock FTMS trainer scenarios for:
  - normal telemetry
  - missing cadence
  - missing speed
  - delayed notifications
  - disconnect
  - reconnect
  - command rejection
  - low update rate
  - changing gradients
  - unrealistic spikes
- Add public support wording that avoids overpromising:
  - Officially tested: Wahoo KICKR CORE 2.
  - Standard-compatible: most BLE FTMS smart trainers from Garmin Tacx, Elite, Zwift, JetBlack, Saris, and Wahoo should work where the trainer correctly implements the standard.
  - Experimental: older or non-standard trainers may have limited support.

### Acceptance Criteria

- Unknown FTMS trainers can produce useful diagnostics.
- Capability-based tests cover degraded modes.
- Support language does not claim that all Bluetooth trainers work.

## Phase 9: Later Mobile And ANT+ Preparation

### Goal

Keep future protocols and mobile packaging possible without changing ride logic.

### Tasks

- Keep the protocol abstraction ready for a future Capacitor BLE transport.
- Keep the protocol abstraction ready for a future ANT+ FE-C adapter.
- Do not implement ANT+ in the MVP.
- Document mobile-specific requirements separately:
  - iOS permissions
  - Bluetooth disabled state
  - background and foreground transitions
  - service discovery delay
  - characteristic write timing limits
  - local device registry storage
- Evaluate ANT+ hardware and platform feasibility before implementation.

### Acceptance Criteria

- Future iOS/Capacitor work does not require changing physics or UI ride logic.
- Future ANT+ FE-C work can enter through the same trainer abstraction.

## Test Plan

### Unit Tests

- Capability detection.
- FTMS parser and command encoding.
- Command scheduler throttling, deduplication, prioritization, and stale command handling.
- Error mapping.
- Fallback mode selection.
- Auto shifting deadband and anti-hunting behavior.

### Reconnect Tests

- Temporary disconnect.
- Reconnect failure.
- Stale telemetry.
- Safe command reapplication.
- Shutdown reset.

### Mock Trainer Tests

- Missing telemetry fields.
- Low update rate.
- Delayed notifications.
- Command rejection.
- Unknown FTMS device.
- Unrealistic telemetry spikes.

### UI Tests

- Trainer status display.
- Setup wizard states.
- Support badges.
- Degraded/read-only mode messaging.
- Separate trainer and Zwift Click connection states.

### Physical Validation

Use Wahoo KICKR CORE 2 for the MVP physical checklist:

- scan
- connect
- telemetry
- Simulation Mode
- ERG Mode
- Resistance Mode or documented unsupported behavior
- reconnect
- ride continuation
- setup wizard completion
- Zwift Click, keyboard, and touch shifting
- auto shifting enable/disable
- shutdown reset

## Assumptions

- The first implementation stays in the current Python engine plus React UI architecture.
- Wahoo KICKR CORE 2 remains the only officially tested physical trainer for MVP.
- Capacitor/iOS support is a later architecture target, not part of the immediate implementation.
- ANT+ FE-C remains out of MVP scope.
- The implementation should prefer existing repo patterns over a broad rewrite.
- The ride must remain usable without internet access.
- The LLM layer, if added later, must never control the trainer directly.

## Definition Of Done

The trainer implementation is done when:

- the current Wahoo KICKR CORE 2 still works
- the trainer integration is no longer Wahoo-specific
- the app can detect FTMS capabilities
- the app can degrade gracefully
- the physics engine controls resistance generically
- virtual shifting works from multiple inputs
- auto shifting works in a stable way
- the setup wizard makes pairing understandable
- diagnostic export exists
- new trainer brands can be added mostly through capability hints and tests
