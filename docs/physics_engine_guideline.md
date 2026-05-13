# OUDENA_PHYSICS_ENGINE_IMPLEMENTATION_SPEC.md

Version: 1.0  
Status: Implementation Specification  
Audience: Junior Developers, Coding Agents, Software Architects  
Project: Oudena Indoor Cycling Platform

---

# 1. PURPOSE

This document defines the complete implementation guidelines, architecture, boundaries, requirements, and technical specifications for the Oudena Physics Engine.

The engine is responsible for simulating realistic outdoor cycling behavior for smart trainers such as:

- Wahoo KICKR Core
- Zwift Hub
- Tacx Neo
- Elite Direto
- FTMS-compatible trainers

The primary goal is:

> Make indoor riding feel as close as possible to real outdoor cycling.

The engine must prioritize:

- smoothness
- believable momentum
- realistic climbing feel
- stable resistance transitions
- responsive but non-twitchy trainer behavior

The engine must NOT prioritize:

- scientific perfection
- esports-grade simulation
- backend-driven real-time physics
- workout-first ERG behavior

---

# 2. CORE DESIGN PHILOSOPHY

The simulation should feel:

- natural
- predictable
- smooth
- momentum-preserving
- immersive

The user should subconsciously forget:

- they are indoors
- they are riding a trainer
- the terrain is simulated

This is the primary success criterion.

---

# 3. HIGH LEVEL SYSTEM ARCHITECTURE

```text
Route Data
    ↓
Route Sampler
    ↓
Elevation Smoothing
    ↓
Physics Engine
    ↓
Simulation State
    ↓
Trainer Controller
    ↓
BLE / ANT Communication
    ↓
Smart Trainer
```

The UI layer only visualizes the simulation state.

The UI layer must NEVER:
- calculate physics
- control trainer resistance directly
- own simulation timing

---

# 4. LOCAL-FIRST REQUIREMENT

ALL real-time simulation logic must run locally on the client device.

## Allowed backend responsibilities

```text
route hosting
multiplayer synchronization
leaderboards
ride uploads
profile storage
analytics
community features
```

## Forbidden backend responsibilities

```text
live physics calculation
live speed calculation
live trainer control
live resistance decisions
```

Reason:
Backend latency destroys riding realism.

---

# 5. DETERMINISTIC SIMULATION

The simulation should produce approximately identical results given:

- same route
- same rider profile
- same trainer
- same power input

Avoid:
- random forces
- unstable floating-point loops
- time-dependent inconsistencies

The simulation must support replay testing.

---

# 6. REQUIRED MODULES

---

# 6.1 Route Module

## Responsibilities

- load GPX/routes
- preprocess elevation
- interpolate route positions
- sample route state
- cache route data

## Input Model

```ts
type RoutePoint = {
  lat: number
  lon: number
  elevation: number
  distance: number
}
```

## Output Model

```ts
type RouteSample = {
  gradient: number
  elevation: number
  curvature?: number
  surfaceType?: string
}
```

## Requirements

Must support:
- interpolation
- offline usage
- route caching
- partial route loading

Must NOT:
- directly expose noisy GPS elevation
- create sharp gradient spikes

---

# 6.2 Elevation Smoothing Module

## Purpose

Prevent unrealistic resistance spikes caused by noisy elevation data.

This module is CRITICAL for ride feel.

Without smoothing:
- trainers become twitchy
- resistance oscillates
- climbs feel artificial

---

## Required Features

### Moving average smoothing

Required configurable parameters:

```ts
gradientSmoothingDistance = 30m
maxGradientChangePerSecond = 1.5%
```

---

## Three separate gradients are REQUIRED

```text
visualGradient
physicsGradient
trainerGradient
```

### visualGradient

Purpose:
- map visuals
- elevation profiles

Characteristics:
- minimally smoothed
- visually accurate

---

### physicsGradient

Purpose:
- physics calculations

Characteristics:
- moderately smoothed
- realistic terrain feel

---

### trainerGradient

Purpose:
- smart trainer commands

Characteristics:
- heavily stabilized
- smooth transitions
- optimized for trainer feel

---

# 6.3 Rider Model

## Responsibilities

Store rider-specific simulation parameters.

## Required Model

```ts
type RiderProfile = {
  riderWeightKg: number
  bikeWeightKg: number
  ftp?: number

  cda: number
  crr: number

  drivetrainEfficiency: number
  trainerDifficulty: number
}
```

---

## Default Values

### CdA

```text
0.32 = relaxed road position
0.28 = aggressive position
```

### Crr

```text
0.004 = standard road tire
```

### Drivetrain Efficiency

```text
0.96 - 0.98
```

---

## Trainer Difficulty

Controls gradient scaling.

```text
0.0 = very reduced gradients
1.0 = full realism
```

This only affects:
- trainer resistance feel

This must NOT affect:
- leaderboard fairness
- virtual route distance

---

# 6.4 Physics Engine

The core simulation module.

## Responsibilities

- calculate resistance forces
- calculate acceleration
- calculate virtual speed
- calculate virtual distance
- generate trainer targets

---

## Forbidden Responsibilities

Must NOT contain:
- UI rendering
- BLE communication
- React state
- map rendering
- backend calls

---

# 7. PHYSICS MODEL

The engine uses force-based simulation.

---

# 7.1 Core Formula

Power required equals:

```text
(gravity + rolling resistance + aerodynamic drag + acceleration) × speed
```

---

# 7.2 Gravity Force

## Purpose

Simulate climbing and descending resistance.

## Requirements

Must:
- support uphill
- support downhill
- support steep gradients
- support negative gradients

Must clamp:
- unrealistic slope values
- GPS spikes

---

# 7.3 Rolling Resistance

## Purpose

Simulate tire-road friction.

## Requirements

Must:
- always exist
- scale with mass
- work independently from wind

Behavior:
- relatively constant
- low-speed dominant

---

# 7.4 Aerodynamic Drag

## Purpose

Simulate air resistance.

## Requirements

Must:
- increase quadratically with speed
- dominate at high speed
- use configurable CdA

Future extensions:
- wind
- drafting
- crosswinds

---

# 7.5 Inertia

THIS IS THE MOST IMPORTANT REALISM FEATURE.

Without inertia:
- the ride feels robotic
- acceleration feels fake
- hills feel wrong

---

## Requirements

Must support:
- momentum preservation
- speed carry-over
- delayed deceleration
- coasting
- cresting hills naturally

---

## Forbidden Behavior

The simulation must NEVER:
- instantly stop accelerating
- instantly stop decelerating
- instantly match power changes

---

# 7.6 Drivetrain Efficiency

Purpose:
Simulate energy loss between pedals and wheel.

Typical range:

```text
96% - 98%
```

Must be configurable.

---

# 8. DOWNHILL HANDLING

A critical realism area.

---

# 8.1 Requirements

Must support:
- gravity acceleration
- coasting
- freewheeling
- downhill momentum

---

# 8.2 Constraints

Smart trainers cannot physically push riders forward.

The simulation must therefore use:

```text
virtual momentum
reduced resistance
virtual acceleration
```

Instead of:
- actual motorized pushing

---

# 8.3 Downhill Safety Rules

Must include:
- virtual speed cap
- resistance floor
- overspeed protection

---

# 9. SIMULATION LOOP

---

# 9.1 Update Rates

Recommended frequencies:

```text
Physics Simulation: 20 Hz
Trainer Commands:   1-2 Hz
Route Sampling:     10 Hz
UI Rendering:       60 FPS
```

---

# 9.2 Critical Rule

Trainer commands MUST NOT be sent every frame.

This causes:
- BLE congestion
- resistance oscillation
- trainer instability

---

# 9.3 Main Simulation Flow

```text
1. Read trainer telemetry
2. Read rider power/cadence
3. Sample route position
4. Smooth gradients
5. Calculate forces
6. Calculate acceleration
7. Update virtual speed
8. Update virtual distance
9. Calculate trainer resistance target
10. Send trainer command
11. Update UI state
```

---

# 10. TRAINER CONTROL SYSTEM

---

# 10.1 Supported Modes

Preferred:
```text
simulation mode
slope mode
resistance mode
```

Avoid for route riding:
```text
ERG mode
```

ERG is workout-oriented and feels unrealistic for free riding.

---

# 10.2 Trainer Abstraction Layer

Different trainers behave differently.

The system MUST implement:

```ts
interface TrainerAdapter
```

---

## Responsibilities

- capability detection
- power reading
- cadence reading
- slope control
- resistance control
- device quirks
- calibration handling

---

## Forbidden Architecture

The physics engine must NEVER directly control:
- BLE packets
- FTMS packets
- trainer-specific APIs

---

# 10.3 Resistance Smoothing

CRITICAL FOR REALISM.

---

## Required Features

- resistance interpolation
- slope transition smoothing
- command throttling

---

## Must Avoid

```text
trainer chatter
oscillation
micro-spikes
instant resistance jumps
```

---

# 10.4 Failure Handling

The ride must continue if:
- BLE disconnects
- trainer freezes
- commands fail

---

## Fallback Behavior

```text
freeze last resistance
continue virtual simulation
attempt reconnect
restore trainer state
```

The app must NEVER crash the ride session.

---

# 11. STATE MANAGEMENT

---

# 11.1 Central Ride State

```ts
type RideState = {
  elapsedTimeS: number

  distanceM: number
  speedMS: number

  powerW: number
  cadenceRPM: number

  gradient: number
  accelerationMS2: number

  resistanceTarget: number
}
```

---

# 11.2 Requirements

The state must be:
- serializable
- replayable
- immutable where possible
- decoupled from UI

---

# 12. PERFORMANCE REQUIREMENTS

The engine must:
- run on mobile devices
- support long rides
- minimize battery usage
- avoid memory leaks

---

# 12.1 Forbidden Performance Patterns

Do NOT:
- allocate large objects every frame
- block BLE threads
- use synchronous device communication
- tie simulation timing to UI FPS

---

# 13. CONFIGURATION SYSTEM

All major simulation parameters must be configurable.

---

# 13.1 Required Config Areas

```ts
PhysicsConfig
TrainerConfig
RouteConfig
SimulationConfig
```

---

# 13.2 Tunable Parameters

Must support tuning:
- CdA
- Crr
- inertia
- smoothing distance
- trainer responsiveness
- trainer difficulty
- gradient scaling
- downhill behavior

Avoid hardcoded magic numbers.

---

# 14. TESTING REQUIREMENTS

---

# 14.1 Unit Tests

Required for:
- force calculations
- acceleration calculations
- smoothing
- interpolation
- resistance interpolation

---

# 14.2 Replay Testing

The engine must support:
- deterministic ride replay
- power playback
- recorded session replay

---

# 14.3 Realism Validation

Compare behavior against:
- Zwift
- Rouvy
- Wahoo SYSTM
- real outdoor rides

---

## Validation Criteria

```text
climb feel
momentum carry-over
downhill realism
trainer responsiveness
stability
```

---

# 15. FUTURE EXTENSIONS

DO NOT IMPLEMENT IN MVP.

Architecture must remain extensible for:

```text
wind
drafting
surface simulation
cornering
virtual shifting
gear simulation
multiplayer collisions
fatigue models
weather
bike presets
```

---

# 16. FORBIDDEN IMPLEMENTATION PATTERNS

DO NOT:
- calculate physics in React components
- directly map GPS gradient to trainer resistance
- calculate physics on the backend
- tightly couple BLE with physics
- update trainers every frame
- use UI timing for simulation timing
- hardcode trainer-specific assumptions

---

# 17. RECOMMENDED TECH STACK

## Frontend

```text
TypeScript
React
Capacitor
```

---

## Simulation Layer

```text
Pure TypeScript module
```

---

## Device Communication

```text
BLE FTMS
ANT+ FE-C abstraction
```

---

## State Management

```text
Zustand or Redux
```

---

# 18. MVP IMPLEMENTATION ORDER

---

## Phase 1

```text
route parsing
elevation smoothing
virtual speed
basic gravity
```

---

## Phase 2

```text
rolling resistance
aero drag
inertia
```

---

## Phase 3

```text
trainer integration
BLE stability
slope mode
```

---

## Phase 4

```text
resistance smoothing
trainer tuning
replay testing
```

---

## Phase 5

```text
advanced realism
downhill refinement
trainer-specific optimization
```

---

# 20. SUCCESS CRITERIA

The ride should feel:

```text
smooth
stable
natural
heavy uphill
fast downhill
momentum-preserving
responsive but not twitchy
```

The rider should subconsciously feel:

```text
the bike has weight
the terrain has shape
speed carries naturally
climbs require effort
downhills release resistance naturally
```

If the rider forgets they are on a trainer:
the physics engine succeeded.

```