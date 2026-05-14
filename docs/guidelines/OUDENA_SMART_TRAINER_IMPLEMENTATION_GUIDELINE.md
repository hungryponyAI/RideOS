# Oudena Smart Trainer Integration — Implementation Guideline

**Target audience:** Junior developer / coding agent  
**App:** Oudena  
**Current working trainer:** Wahoo KICKR CORE 2  
**Primary platform:** Capacitor app, iOS-first  
**Primary protocol:** Bluetooth Low Energy (BLE), Fitness Machine Service (FTMS) first  
**Future protocol:** ANT+ FE-C planned later  
**Design principle:** Capability-based trainer abstraction, not model-specific implementation

---

## 1. Goal

Oudena should support a broad range of smart trainers without creating high maintenance cost or trainer-specific complexity.

The app should not be designed around individual trainer models.

Instead, it should support:

1. Standard BLE FTMS trainers
2. A small set of officially tested trainer families
3. Capability-based behavior
4. Optional vendor adapters only where strictly needed
5. Future ANT+ FE-C support through the same internal API

---

## 2. Market Coverage Strategy

### 2.1 Officially Tested Devices

The first officially tested device is:

- Wahoo KICKR CORE 2

This device is the reference implementation for:

- BLE connection
- FTMS discovery
- trainer control
- power/cadence/speed readout
- simulation resistance
- ERG mode
- resistance mode
- reconnect behavior
- device setup UX

### 2.2 Official Support Targets

The app should aim to support the following trainer families:

| Priority | Brand / Family | Support Strategy |
|---|---|---|
| P0 | Wahoo KICKR / KICKR CORE | Officially tested first |
| P1 | Garmin Tacx NEO / FLUX | Generic FTMS/FE-C support |
| P1 | Elite Direto / Justo / Suito | Generic FTMS support |
| P1 | Zwift Hub / Hub One | Generic FTMS support |
| P1 | JetBlack Volt / Victory | Generic FTMS support |
| P2 | Saris H3 / H4 | Generic FTMS support |
| P2 | Other FTMS trainers | Community-compatible |

### 2.3 Garmin Clarification

Garmin should be handled as **Garmin Tacx**.

Relevant trainer families:

- Tacx NEO
- Tacx NEO 2T
- Tacx NEO 3M
- Tacx FLUX S
- Tacx FLUX 2

Garmin watches, Edge devices, and head units are not trainer targets for the first implementation. They may become relevant later for sensor pairing, activity sync, or export workflows, but not for trainer control.

### 2.4 Support Categories

Use three support levels:

#### Officially Tested

A trainer model has been physically tested by the Oudena team.

Example:

```text
Wahoo KICKR CORE 2 — officially tested
```

#### Standard Compatible

A trainer supports BLE FTMS and should work through the generic adapter, but has not been physically tested.

Example:

```text
Garmin Tacx NEO 2T — FTMS-compatible, not yet officially tested
```

#### Experimental

A trainer requires vendor-specific behavior, incomplete FTMS support, or uncertain behavior.

Example:

```text
Legacy trainer with partial BLE support — experimental
```

---

## 3. Core Architecture

### 3.1 Architectural Layers

Use this layered architecture:

```text
UI Layer
  ↓
Ride Control Layer
  ↓
Physics Engine
  ↓
Trainer Control Abstraction
  ↓
Capability Layer
  ↓
Protocol Adapter Layer
  ↓
BLE Transport Layer
  ↓
Native Capacitor BLE Plugin
```

### 3.2 Rule

Only the protocol adapter knows about BLE characteristics.

Only the capability layer knows what the trainer can do.

The physics engine must not know which trainer model is connected.

The UI must not directly write BLE commands.

---

## 4. Recommended Folder Structure

```text
src/
  trainer/
    index.ts

    transport/
      BleTransport.ts
      CapacitorBleTransport.ts
      MockBleTransport.ts

    protocols/
      ftms/
        FtmsAdapter.ts
        FtmsTypes.ts
        FtmsParser.ts
        FtmsCommandBuilder.ts
        FtmsConstants.ts
      antfec/
        AntFecAdapter.placeholder.ts

    capabilities/
      TrainerCapabilities.ts
      CapabilityDetector.ts
      CapabilityProfiles.ts

    control/
      TrainerController.ts
      TrainerState.ts
      TrainerCommands.ts
      TrainerTelemetry.ts

    devices/
      DeviceScanner.ts
      DeviceRegistry.ts
      DeviceIdentity.ts
      DeviceSetupWizard.ts

    shifting/
      VirtualGearbox.ts
      AutoShiftingController.ts
      ShiftInputManager.ts
      ZwiftClickInput.ts
      KeyboardShiftInput.ts
      TouchShiftInput.ts

    qa/
      TrainerTestScenarios.ts
      TrainerTestMatrix.ts

  physics/
    PhysicsEngine.ts
    ResistanceModel.ts
    GradeToResistance.ts
    BikeRiderModel.ts

  ride/
    RideLoop.ts
    RideSession.ts
    RideDataRecorder.ts

  ui/
    device-setup/
    ride-hud/
    settings/
```

---

## 5. Transport Layer

### 5.1 Purpose

The transport layer handles low-level communication only.

It is responsible for:

- scanning BLE devices
- connecting
- disconnecting
- reconnecting
- discovering services
- subscribing to notifications
- reading characteristics
- writing characteristics
- exposing connection state
- handling iOS permission errors
- handling background/foreground transitions

It must not contain trainer logic.

### 5.2 Interface

```ts
export interface BleTransport {
  scan(filters: BleScanFilter[]): Promise<BleDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  isConnected(deviceId: string): Promise<boolean>;

  discoverServices(deviceId: string): Promise<BleService[]>;

  readCharacteristic(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string
  ): Promise<DataView>;

  writeCharacteristic(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    data: Uint8Array,
    withResponse: boolean
  ): Promise<void>;

  subscribe(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    onData: (data: DataView) => void
  ): Promise<() => Promise<void>>;
}
```

### 5.3 Capacitor Implementation

Use a Capacitor BLE plugin as the implementation backend.

The rest of the app should depend only on `BleTransport`, never directly on the plugin.

### 5.4 iOS-Specific Requirements

The iOS implementation must handle:

- Bluetooth permission request
- Bluetooth disabled state
- app entering background
- app returning to foreground
- device disconnected while screen is locked
- reconnect after temporary BLE loss
- duplicate BLE advertisements
- services not immediately available after connect
- iOS characteristic write timing limitations

---

## 6. Protocol Layer

### 6.1 Primary Protocol: BLE FTMS

The first implementation should support BLE FTMS.

The FTMS adapter should expose a generic trainer API to the upper layers.

### 6.2 Future Protocol: ANT+ FE-C

ANT+ FE-C should not be implemented in the first version, but the architecture must allow it.

Do not put FTMS-specific assumptions into the physics engine or UI.

### 6.3 Protocol Adapter Interface

```ts
export interface TrainerProtocolAdapter {
  readonly protocol: 'ble-ftms' | 'ant-fec' | 'vendor-wahoo' | 'vendor-tacx';

  connect(device: TrainerDevice): Promise<void>;
  disconnect(): Promise<void>;

  getCapabilities(): Promise<TrainerCapabilities>;

  startTelemetry(onTelemetry: (data: TrainerTelemetry) => void): Promise<void>;
  stopTelemetry(): Promise<void>;

  setErgMode(targetWatts: number): Promise<void>;
  setSimulationMode(input: SimulationControlInput): Promise<void>;
  setResistanceMode(input: ResistanceControlInput): Promise<void>;

  requestCalibration?(): Promise<void>;
}
```

---

## 7. Capability Layer

### 7.1 Purpose

The capability layer is the most important part of the architecture.

It prevents model-specific logic from spreading across the codebase.

The app should ask:

```ts
trainer.capabilities.supportsSimulationMode
```

not:

```ts
trainer.model === 'Wahoo KICKR CORE 2'
```

### 7.2 Capability Model

```ts
export interface TrainerCapabilities {
  protocol: 'ble-ftms' | 'ant-fec' | 'vendor';

  supportsPower: boolean;
  supportsCadence: boolean;
  supportsSpeed: boolean;
  supportsDistance: boolean;
  supportsHeartRate: boolean;

  supportsErgMode: boolean;
  supportsSimulationMode: boolean;
  supportsResistanceMode: boolean;

  supportsCalibration: boolean;
  supportsVirtualShifting: boolean;
  supportsAutoShifting: boolean;

  supportsConnectionQuality: boolean;
  supportsTrainerStatus: boolean;

  maxPowerWatts?: number;
  minResistanceLevel?: number;
  maxResistanceLevel?: number;
  maxGradientPercent?: number;
  minGradientPercent?: number;

  updateRateHz: number;

  vendor?: 'wahoo' | 'garmin-tacx' | 'elite' | 'zwift' | 'jetblack' | 'saris' | 'unknown';
  modelName?: string;
  firmwareVersion?: string;

  supportLevel: 'officially-tested' | 'standard-compatible' | 'experimental';
}
```

### 7.3 Capability Detection

Capability detection should happen in this order:

1. Read BLE services and characteristics
2. Identify FTMS support
3. Read supported FTMS features
4. Parse manufacturer name if available
5. Parse model number if available
6. Apply generic FTMS capability profile
7. Apply known safe vendor hints if available
8. Never assume unsupported features

### 7.4 Known Device Profiles

Known device profiles are hints, not hardcoded behavior.

Example:

```ts
export const KNOWN_DEVICE_HINTS: DeviceCapabilityHint[] = [
  {
    match: {
      manufacturerIncludes: 'Wahoo',
      modelIncludes: 'KICKR CORE'
    },
    vendor: 'wahoo',
    supportLevel: 'officially-tested',
    preferredUpdateRateHz: 4
  },
  {
    match: {
      manufacturerIncludes: 'Tacx'
    },
    vendor: 'garmin-tacx',
    supportLevel: 'standard-compatible',
    preferredUpdateRateHz: 4
  },
  {
    match: {
      manufacturerIncludes: 'Elite'
    },
    vendor: 'elite',
    supportLevel: 'standard-compatible',
    preferredUpdateRateHz: 4
  },
  {
    match: {
      manufacturerIncludes: 'JetBlack'
    },
    vendor: 'jetblack',
    supportLevel: 'standard-compatible',
    preferredUpdateRateHz: 4
  }
];
```

---

## 8. Trainer Controller

### 8.1 Purpose

The trainer controller is the single public API used by the ride system.

It hides:

- BLE
- FTMS
- device-specific quirks
- reconnect behavior
- command throttling
- telemetry parsing

### 8.2 Public API

```ts
export interface TrainerController {
  scan(): Promise<TrainerDevice[]>;
  connect(deviceId: string): Promise<TrainerConnectionResult>;
  disconnect(): Promise<void>;

  getState(): TrainerState;
  getCapabilities(): TrainerCapabilities | null;

  onTelemetry(callback: (data: TrainerTelemetry) => void): Unsubscribe;
  onStateChange(callback: (state: TrainerState) => void): Unsubscribe;

  setTargetPower(watts: number): Promise<void>;
  setVirtualGrade(gradePercent: number): Promise<void>;
  setResistanceLevel(level: number): Promise<void>;

  enableSimulationMode(): Promise<void>;
  enableErgMode(): Promise<void>;
  enableResistanceMode(): Promise<void>;

  calibrate?(): Promise<void>;
}
```

### 8.3 State Model

```ts
export interface TrainerState {
  connectionState:
    | 'idle'
    | 'scanning'
    | 'connecting'
    | 'connected'
    | 'ready'
    | 'reconnecting'
    | 'disconnecting'
    | 'disconnected'
    | 'error';

  controlMode: 'none' | 'simulation' | 'erg' | 'resistance';

  device?: TrainerDevice;
  capabilities?: TrainerCapabilities;

  lastTelemetryAt?: number;
  lastCommandAt?: number;

  error?: TrainerError;
}
```

---

## 9. Telemetry Model

### 9.1 Required Live Values

The app should support all of the following live values:

- power
- cadence
- speed
- distance
- heart rate
- trainer status
- connection quality

External power meters or sensors are not required for the first version.

### 9.2 Telemetry Interface

```ts
export interface TrainerTelemetry {
  timestampMs: number;

  powerWatts?: number;
  cadenceRpm?: number;
  speedKph?: number;
  distanceMeters?: number;
  heartRateBpm?: number;

  trainerStatus?: TrainerStatus;
  connectionQuality?: ConnectionQuality;

  raw?: unknown;
}
```

### 9.3 Connection Quality

Connection quality should be derived from available data.

```ts
export interface ConnectionQuality {
  level: 'excellent' | 'good' | 'weak' | 'lost';
  lastPacketAgeMs: number;
  packetsPerSecond?: number;
  missedPacketEstimate?: number;
  rssi?: number;
}
```

### 9.4 Telemetry Update Rate

Target update rate:

```text
4 Hz preferred
1–2 Hz acceptable fallback
```

The ride loop should not depend on exact BLE packet rate.

Use interpolation or last-known values where needed.

---

## 10. Physics Engine Integration

### 10.1 Responsibility Split

The physics engine is responsible for calculating the required resistance.

The trainer is only the actuator.

The physics engine should compute resistance from:

- rider mass
- bike mass
- current speed
- gradient
- rolling resistance
- aerodynamic drag
- drivetrain loss
- virtual gearing
- braking
- acceleration
- route profile
- drafting, if added later

### 10.2 Important Rule

The trainer should not decide the riding physics.

Oudena should decide the physics and send control commands to the trainer.

### 10.3 Physics Output

The physics engine should output:

```ts
export interface PhysicsOutput {
  timestampMs: number;

  virtualSpeedKph: number;
  virtualDistanceMeters: number;
  gradientPercent: number;

  targetResistanceWatts?: number;
  targetBrakeForceNewton?: number;
  targetTrainerGradePercent?: number;

  recommendedControlMode: 'simulation' | 'erg' | 'resistance';
}
```

### 10.4 Mapping to Trainer Commands

The ride control layer maps physics output to trainer commands.

```ts
if (capabilities.supportsSimulationMode) {
  await trainer.setVirtualGrade(output.targetTrainerGradePercent);
} else if (capabilities.supportsResistanceMode) {
  await trainer.setResistanceLevel(mappedResistanceLevel);
} else if (capabilities.supportsErgMode) {
  await trainer.setTargetPower(output.targetResistanceWatts);
}
```

### 10.5 Command Rate

Do not send trainer commands at every render frame.

Recommended:

```text
Physics loop: 20–60 Hz internal
Trainer command loop: 2–4 Hz
Telemetry loop: ideally 4 Hz, fallback 1–2 Hz
UI loop: 30–60 Hz
```

### 10.6 Command Smoothing

Use smoothing to avoid unpleasant resistance jumps.

Requirements:

- limit grade changes per second
- limit target watt changes per second
- debounce small changes
- avoid command spam
- immediately react to safety-critical decreases

Example:

```ts
const MAX_GRADE_CHANGE_PER_SECOND = 3.0;
const MAX_POWER_CHANGE_PER_SECOND = 100;
const COMMAND_INTERVAL_MS = 250;
```

---

## 11. Control Modes

### 11.1 Required Modes

Oudena should support:

1. Simulation Mode
2. ERG Mode
3. Resistance Mode
4. Read-only Mode

### 11.2 Simulation Mode

Used for route riding.

Input:

```ts
export interface SimulationControlInput {
  gradePercent: number;
  windSpeedMps?: number;
  rollingResistanceCoefficient?: number;
  windResistanceCoefficient?: number;
}
```

### 11.3 ERG Mode

Used for structured training or auto-controlled power.

Input:

```ts
export interface ErgControlInput {
  targetWatts: number;
}
```

### 11.4 Resistance Mode

Fallback mode where simulation mode is not available.

Input:

```ts
export interface ResistanceControlInput {
  level: number;
  normalizedResistance: number;
}
```

### 11.5 Read-Only Mode

Used when a trainer or sensor can provide telemetry but cannot be controlled.

The app should still allow riding in degraded mode.

---

## 12. Virtual Shifting

### 12.1 Goal

Oudena should support virtual shifting and auto shifting.

Supported shift inputs:

- Zwift Click
- keyboard
- touch UI

### 12.2 Virtual Gearbox

The virtual gearbox should be independent from the trainer hardware.

```ts
export interface VirtualGearbox {
  currentGear: number;
  minGear: number;
  maxGear: number;

  shiftUp(): void;
  shiftDown(): void;
  setGear(gear: number): void;

  getGearRatio(): number;
}
```

### 12.3 Gear Model

Start simple.

Recommended first implementation:

```text
24 virtual gears
gear 1 = easiest
gear 24 = hardest
```

Later, allow presets:

- compact road bike
- endurance road bike
- gravel
- pro road
- custom

### 12.4 Shift Input Manager

All inputs should go through a common manager.

```ts
export interface ShiftInput {
  source: 'zwift-click' | 'keyboard' | 'touch-ui';
  direction: 'up' | 'down';
  timestampMs: number;
}
```

```ts
export interface ShiftInputManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  onShift(callback: (input: ShiftInput) => void): Unsubscribe;
}
```

### 12.5 Zwift Click

Zwift Click should be treated as an input device, not as a trainer.

Implementation requirements:

- pair separately from trainer
- expose only shift up / shift down events
- do not mix Click connection state with trainer connection state
- allow keyboard/touch fallback
- handle encrypted or unavailable Click modes gracefully
- never block riding if Click is unavailable

### 12.6 Keyboard Shifting

Keyboard controls:

```text
Arrow Up / +     shift up
Arrow Down / -   shift down
```

### 12.7 Touch UI Shifting

Touch UI requirements:

- large buttons
- reachable with sweaty hands
- no precision gestures
- haptic feedback on mobile if available
- current gear always visible
- fallback if Zwift Click disconnects

---

## 13. Auto Shifting

### 13.1 Goal

Auto shifting should help the rider stay in a comfortable cadence and effort range.

It should not constantly shift.

### 13.2 Inputs

Auto shifting may use:

- current cadence
- current power
- current speed
- gradient
- target effort
- current virtual gear
- rider preference

### 13.3 First Implementation

Simple cadence-based logic:

```text
If cadence > preferredCadence + upperDeadband:
  shift up

If cadence < preferredCadence - lowerDeadband:
  shift down
```

Recommended defaults:

```ts
const PREFERRED_CADENCE_RPM = 85;
const LOWER_DEADBAND_RPM = 8;
const UPPER_DEADBAND_RPM = 8;
const MIN_SHIFT_INTERVAL_MS = 2500;
```

### 13.4 Anti-Hunting

Auto shifting must avoid oscillation.

Rules:

- minimum time between shifts
- wider deadband after a shift
- no shifting during unstable telemetry
- no shifting during reconnect
- no shifting immediately after manual shift
- manual shift temporarily overrides auto shift

Example:

```ts
const MANUAL_OVERRIDE_MS = 15000;
```

### 13.5 Auto Shifting Interface

```ts
export interface AutoShiftingController {
  enabled: boolean;

  update(input: AutoShiftInput): ShiftDecision | null;
}
```

```ts
export interface AutoShiftInput {
  timestampMs: number;
  cadenceRpm?: number;
  powerWatts?: number;
  speedKph?: number;
  gradePercent: number;
  currentGear: number;
  telemetryStable: boolean;
}
```

---

## 14. Device Discovery and Pairing UX

### 14.1 Setup Wizard

A setup wizard is recommended for the first version.

Steps:

1. Bluetooth permission check
2. Bluetooth enabled check
3. Scan for trainer
4. Show trainer candidates
5. User selects trainer
6. App connects
7. App detects capabilities
8. App performs quick control test
9. Optional: pair Zwift Click
10. Optional: test shifting
11. Save device profile

### 14.2 Device Selection UI

Show:

- device name
- manufacturer
- signal quality if available
- support level
- detected protocol
- recommended badge

Example:

```text
Wahoo KICKR CORE 2
Officially tested · BLE FTMS · Recommended
```

```text
Tacx NEO 2T
Standard compatible · BLE FTMS
```

### 14.3 Auto Detection

The app should automatically select the best device candidate.

Priority:

1. Previously paired trainer
2. Officially tested trainer
3. BLE FTMS trainer
4. Known smart trainer manufacturer
5. Strongest signal
6. Unknown BLE fitness device

The user must still be able to manually override.

### 14.4 Multiple Devices

The app should support multiple connected devices conceptually.

First implementation:

- trainer
- Zwift Click

Later:

- heart rate sensor
- power meter
- cadence sensor

Important:

The system must clearly distinguish between:

```text
controllable trainer
input device
sensor
```

---

## 15. Device Registry

### 15.1 Purpose

Persist known devices locally.

Store:

- device ID
- display name
- manufacturer
- model
- protocol
- capabilities
- last connected timestamp
- support level
- user nickname
- preferred control mode
- Zwift Click pairing association

### 15.2 Local Storage

For iOS/Capacitor, store the device registry locally on the device.

Recommended:

- Capacitor Preferences for simple data
- SQLite if the app already uses local database storage

### 15.3 Device Registry Interface

```ts
export interface DeviceRegistry {
  getKnownDevices(): Promise<SavedTrainerDevice[]>;
  saveDevice(device: SavedTrainerDevice): Promise<void>;
  removeDevice(deviceId: string): Promise<void>;
  getLastTrainer(): Promise<SavedTrainerDevice | null>;
}
```

---

## 16. Error Handling

### 16.1 Error Categories

```ts
export type TrainerErrorCode =
  | 'bluetooth-permission-denied'
  | 'bluetooth-disabled'
  | 'device-not-found'
  | 'connection-timeout'
  | 'service-discovery-failed'
  | 'unsupported-device'
  | 'unsupported-control-mode'
  | 'command-failed'
  | 'telemetry-timeout'
  | 'device-disconnected'
  | 'reconnect-failed'
  | 'unknown';
```

### 16.2 UX Requirements

Errors must be actionable.

Bad:

```text
Error 104
```

Good:

```text
Trainer disconnected. Move your phone closer to the trainer or reconnect manually.
```

### 16.3 Fallback Behavior

If Simulation Mode fails:

1. Try Resistance Mode
2. Try ERG Mode if appropriate
3. Fall back to read-only ride
4. Inform user clearly

---

## 17. Reconnect Strategy

### 17.1 Requirements

The app should support reconnect without losing the ride.

On disconnect:

1. Freeze latest trainer telemetry
2. Mark connection as weak/lost
3. Continue virtual ride for a short grace period if safe
4. Start reconnect attempts
5. Re-apply control mode after reconnect
6. Re-send latest control command
7. Resume normal operation

### 17.2 Reconnect Timing

```ts
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 2000;
const TELEMETRY_TIMEOUT_MS = 3000;
```

### 17.3 Ride Safety

If telemetry is lost for too long:

- stop sending increasing resistance
- reduce or freeze target resistance
- show warning
- allow manual ride pause

---

## 18. Command Scheduler

### 18.1 Why Needed

Trainer commands should be throttled and serialized.

BLE writes can fail if sent too quickly.

### 18.2 Requirements

The command scheduler should:

- serialize commands
- throttle to 2–4 Hz
- deduplicate repeated values
- prioritize safety commands
- retry failed commands carefully
- avoid stale commands after reconnect

### 18.3 Interface

```ts
export interface TrainerCommandScheduler {
  enqueue(command: TrainerCommand): void;
  clear(): void;
  pause(): void;
  resume(): void;
}
```

---

## 19. Testing Strategy

### 19.1 Test Philosophy

Do not try to physically test every trainer at the beginning.

Test:

1. One physical trainer deeply
2. Protocol parser with mocks
3. Capability combinations
4. Command scheduling
5. Reconnect behavior
6. Degraded modes

### 19.2 Physical Test Device

Initial physical test device:

```text
Wahoo KICKR CORE 2
```

### 19.3 Mock Trainer

Build a mock FTMS trainer early.

It should simulate:

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

### 19.4 Test Matrix

| Scenario | Required |
|---|---|
| Scan finds Wahoo KICKR CORE 2 | Yes |
| Connect succeeds | Yes |
| Capabilities detected | Yes |
| Power telemetry received | Yes |
| Cadence telemetry received | Yes |
| Speed telemetry received | Yes |
| Distance telemetry received | Yes |
| Simulation mode command works | Yes |
| ERG command works | Yes |
| Resistance command works | Yes |
| Reconnect after disconnect | Yes |
| Ride continues after temporary disconnect | Yes |
| Setup wizard completes | Yes |
| Zwift Click shift up/down works | Yes |
| Keyboard shift works | Yes |
| Touch shift works | Yes |
| Auto shifting does not oscillate | Yes |
| Unknown FTMS trainer works in standard mode | Yes |
| Unsupported trainer shows clear message | Yes |

### 19.5 Capability-Based Test Matrix

| Capability Set | Expected Behavior |
|---|---|
| Power only | Read-only ride |
| Power + cadence | Read-only ride with cadence |
| Resistance mode only | Route ride via resistance mapping |
| ERG only | Workout mode only |
| Simulation mode | Full route mode |
| Simulation + ERG + Resistance | Full support |
| No telemetry | Unsupported |
| No control | Read-only fallback |

---

## 20. Acceptance Criteria

### 20.1 MVP Acceptance Criteria

The MVP is acceptable when:

- Wahoo KICKR CORE 2 can be discovered
- Wahoo KICKR CORE 2 can be connected on iOS via Capacitor
- power, cadence, speed, and distance are displayed
- trainer can be controlled in Simulation Mode
- trainer can be controlled in ERG Mode
- trainer can be controlled in Resistance Mode
- physics engine sends resistance/grade commands through abstraction
- UI does not access BLE directly
- trainer model is not hardcoded in ride logic
- setup wizard can pair the trainer
- reconnect works after a temporary disconnect
- Zwift Click, keyboard, and touch shifting are routed through one input manager
- auto shifting can be enabled and disabled
- unsupported devices fail gracefully
- unknown FTMS devices can run as standard-compatible where possible

### 20.2 Architecture Acceptance Criteria

Code review should reject implementation if:

- UI writes BLE commands directly
- physics engine checks trainer brand/model
- FTMS parsing is mixed into ride logic
- Wahoo-specific logic is spread across the app
- trainer command writes are not throttled
- reconnect is not handled
- capabilities are not represented explicitly
- Zwift Click is coupled to trainer connection state

---

## 21. Implementation Roadmap

### Phase 0 — Cleanup and Boundaries

Goal:

Create clean architectural boundaries before expanding trainer support.

Tasks:

- create `/trainer` module
- define `BleTransport`
- define `TrainerProtocolAdapter`
- define `TrainerCapabilities`
- define `TrainerController`
- define `TrainerTelemetry`
- remove direct BLE logic from UI
- remove trainer-specific checks from physics engine
- document current Wahoo behavior

Deliverable:

```text
Trainer abstraction compiles and current Wahoo flow still works.
```

---

### Phase 1 — FTMS Foundation

Goal:

Implement generic BLE FTMS support.

Tasks:

- implement FTMS service discovery
- implement FTMS feature reading
- implement telemetry subscriptions
- implement indoor bike data parsing
- implement control point writes
- implement command scheduler
- implement capability detector
- implement generic FTMS profile
- add mock FTMS trainer tests

Deliverable:

```text
Any detected FTMS trainer can be represented as a capability-based trainer.
```

---

### Phase 2 — Wahoo Reference Support

Goal:

Make Wahoo KICKR CORE 2 the reference officially tested trainer.

Tasks:

- validate scan/connect
- validate telemetry
- validate Simulation Mode
- validate ERG Mode
- validate Resistance Mode
- validate reconnect
- validate ride start/stop
- validate command smoothing
- save Wahoo as officially tested profile

Deliverable:

```text
Wahoo KICKR CORE 2 is production-ready.
```

---

### Phase 3 — Pairing UX

Goal:

Create user-friendly setup.

Tasks:

- Bluetooth permission screen
- trainer scan screen
- trainer selection screen
- support level badges
- capability summary screen
- quick control test
- save device profile
- reconnect to previous trainer
- manual override

Deliverable:

```text
User can pair and reuse a trainer without developer assistance.
```

---

### Phase 4 — Virtual Shifting

Goal:

Support multiple shift input sources.

Tasks:

- implement virtual gearbox
- implement keyboard shifting
- implement touch UI shifting
- implement Zwift Click input adapter
- route all shift events through `ShiftInputManager`
- show current gear in UI
- provide fallback if Click disconnects

Deliverable:

```text
Manual virtual shifting works through Zwift Click, keyboard, and touch UI.
```

---

### Phase 5 — Auto Shifting

Goal:

Implement basic cadence-based auto shifting.

Tasks:

- implement auto shifting controller
- add user setting for target cadence
- add anti-hunting logic
- add manual override timeout
- add enable/disable setting
- add tests for oscillation prevention

Deliverable:

```text
Auto shifting works without annoying constant gear changes.
```

---

### Phase 6 — Wider Standard Compatibility

Goal:

Support more trainer brands generically.

Tasks:

- add known hints for Garmin Tacx
- add known hints for Elite
- add known hints for Zwift Hub
- add known hints for JetBlack
- add known hints for Saris
- avoid vendor-specific implementations unless necessary
- add community-compatible label
- build user feedback/export diagnostics

Deliverable:

```text
Oudena can support many FTMS trainers without physical certification.
```

---

### Phase 7 — ANT+ FE-C Preparation

Goal:

Prepare but do not yet implement ANT+ FE-C.

Tasks:

- keep protocol interface generic
- add placeholder adapter
- document ANT+ hardware requirements
- evaluate iOS feasibility
- evaluate desktop/Android feasibility
- decide whether ANT+ is worth product complexity

Deliverable:

```text
ANT+ FE-C can be added later without changing the physics engine or UI.
```

---

## 22. Product Support Policy

### 22.1 Recommended Public Wording

Use wording like:

```text
Officially tested:
- Wahoo KICKR CORE 2

Standard-compatible:
- Most BLE FTMS smart trainers from Garmin Tacx, Elite, Zwift, JetBlack, Saris, and Wahoo should work, but may not yet be physically tested.

Experimental:
- Older or non-standard trainers may have limited support.
```

### 22.2 Avoid Overpromising

Do not claim that all trainers work.

Use:

```text
FTMS-compatible trainers are supported where the trainer correctly implements the standard.
```

Avoid:

```text
All Bluetooth trainers are supported.
```

---

## 23. Diagnostics and Support

### 23.1 Diagnostic Export

Add a diagnostic export early.

It should include:

- app version
- platform
- iOS version
- BLE plugin version
- device name
- manufacturer
- model number
- services found
- FTMS features found
- capabilities detected
- connection log
- command log
- telemetry sample
- error history

### 23.2 User Support Value

This allows users with Garmin Tacx, Elite, Zwift Hub, JetBlack, and Saris trainers to help validate compatibility without you owning every trainer.

---

## 24. Key Design Rules for Coding Agents

A coding agent must follow these rules:

1. Do not put BLE code in UI components.
2. Do not put trainer-brand checks in the physics engine.
3. Do not hardcode Wahoo as the only path.
4. Do not send BLE commands faster than the scheduler allows.
5. Do not couple Zwift Click to the trainer connection.
6. Do not assume 4 Hz telemetry is always available.
7. Do not assume all FTMS trainers support all control modes.
8. Do not crash if cadence, speed, heart rate, or distance are missing.
9. Do not block the ride if virtual shifting input disconnects.
10. Do not implement ANT+ in MVP, but keep interfaces ready.
11. Always prefer capability checks over model checks.
12. Always keep the physics engine independent from hardware.
13. Always provide a safe fallback mode.
14. Always make errors understandable for users.

---

## 25. Recommended First Coding Tasks

Give a coding agent these tasks in order:

### Task 1

Create the trainer module structure and TypeScript interfaces.

### Task 2

Wrap the existing Wahoo BLE implementation behind `BleTransport` and `TrainerController`.

### Task 3

Implement `TrainerCapabilities` and replace all model-specific logic with capability checks.

### Task 4

Implement the command scheduler with throttling and deduplication.

### Task 5

Connect the physics engine only to `TrainerController`, not BLE.

### Task 6

Implement setup wizard screens.

### Task 7

Implement virtual gearbox and keyboard/touch shifting.

### Task 8

Add Zwift Click as separate input device.

### Task 9

Add basic auto shifting.

### Task 10

Add diagnostic export for unknown FTMS trainers.

---

## 26. Definition of Done

This implementation is done when:

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

---

## 27. Final Recommendation

For Oudena, the best balance between market coverage and maintenance effort is:

```text
BLE FTMS-first
Capability-based architecture
Wahoo KICKR CORE 2 as reference device
Garmin Tacx / Elite / Zwift / JetBlack / Saris as standard-compatible trainer families
ANT+ FE-C later
Vendor-specific adapters only when unavoidable
```

This gives strong market coverage without turning the app into a collection of fragile trainer-specific implementations.
