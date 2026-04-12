# Architecture Patterns

**Domain:** Local indoor cycling trainer control app (Python BLE engine + React cockpit)
**Researched:** 2026-04-12
**Overall confidence:** MEDIUM (research tools unavailable in sandbox; recommendations drawn from standard FTMS/bleak/asyncio patterns and the constraints in PROJECT.md)

---

## Recommended Architecture

High-level: a **two-process local system** connected by a single WebSocket.

```
                         localhost
 +-----------------------------+          +------------------------------+
 |    Python Engine Process    |  WS JSON |    React Cockpit (browser)   |
 |    (asyncio event loop)     | <======> |    (Vite dev server / static |
 |                             |          |     files served by engine)  |
 |  +----------------------+   |          |                              |
 |  |   BLE Adapter Layer  |<--+-- BLE -->|  <bleak backend: CoreBluetooth>|
 |  |  (bleak clients)     |   |          |                              |
 |  +----------+-----------+   |          |                              |
 |             |               |          |                              |
 |  +----------v-----------+   |          |  +------------------------+  |
 |  |   FTMS Device        |   |          |  |  TelemetryStore        |  |
 |  |   (power/speed/cad)  |   |          |  |  (Zustand / Context)   |  |
 |  +----------+-----------+   |          |  +-----------+------------+  |
 |             |               |          |              |               |
 |  +----------v-----------+   |          |  +-----------v------------+  |
 |  |  TelemetryBus        |   |          |  |  Cockpit Components    |  |
 |  |  (pub/sub, in-proc)  |   |          |  |  (Speed, Gear, Power)  |  |
 |  +----------+-----------+   |          |  +------------------------+  |
 |             |               |          |                              |
 |  +----------v-----------+   |          |  +------------------------+  |
 |  |  GearEngine          |   |          |  |  InputLayer            |  |
 |  |  (gear_factor math)  |   |          |  |  (keyboard shortcuts)  |  |
 |  +----------+-----------+   |          |  +-----------+------------+  |
 |             |               |          |              |               |
 |  +----------v-----------+   |          |              v               |
 |  |  RouteEngine         |   |     <---- "shift_up" / "shift_down" --- |
 |  |  (GPX, grade lookup) |   |          |                              |
 |  +----------+-----------+   |          |                              |
 |             |               |          |                              |
 |  +----------v-----------+   |          |                              |
 |  |  ControlLoop         |   |          |                              |
 |  |  (4 Hz FTMS write)   |   |          |                              |
 |  +----------+-----------+   |          |                              |
 |             |               |          |                              |
 |  +----------v-----------+   |          |                              |
 |  |  WSServer (websockets)|<=+=========>|                              |
 |  +----------------------+   |          |                              |
 +-----------------------------+          +------------------------------+
```

The browser **never** talks BLE directly. All BLE goes through the Python engine — this is non-negotiable because Web Bluetooth does not support FTMS reliably on macOS and bleak's CoreBluetooth backend is the stable path.

---

## Component Boundaries

### Python Engine Modules

| Module | Responsibility | Communicates With | Notes |
|--------|---------------|-------------------|-------|
| `ble/adapter.py` | Wraps `bleak.BleakClient`. Scan, connect, reconnect-with-backoff, characteristic subscribe/write. One adapter instance per device (KICKR, later Click). | `ftms/`, `click/` (future) | Keep bleak specifics behind this boundary so device drivers don't import bleak. |
| `ftms/device.py` | FTMS protocol: parse Indoor Bike Data notifications, build Set Indoor Bike Simulation Parameters writes, handle Control Point (request control, start, reset). | `ble/adapter`, `control_loop` | Contains all FTMS opcode/byte-packing logic. Pure functions where possible. |
| `telemetry/bus.py` | In-process pub/sub (asyncio queues or an async event emitter). FTMS notifications publish `TelemetrySample{power, speed, cadence, ts}`. | FTMS device (producer); ControlLoop, WSServer, RouteEngine (consumers) | Single source of truth for "what's happening right now." Unifies multiple future inputs (Click, HRM). |
| `gear/engine.py` | Owns `current_gear`, gear factor table, applies `effective_grade = real_grade / gear_factor`. Exposes `shift_up/shift_down/set_gear`. | InputLayer (WS command), ControlLoop | Pure state machine — no IO. Easy to unit test. |
| `route/engine.py` | Loads GPX (gpxpy), integrates distance from speed*dt, looks up current grade by distance, exposes `real_grade(t)`. | TelemetryBus (speed consumer), ControlLoop (grade producer) | Pure except file load. Distance integration uses monotonic time, not wall clock. |
| `control_loop.py` | The realtime heart. Fixed-cadence asyncio task: read latest telemetry, ask RouteEngine for grade, apply GearEngine factor, send FTMS sim-parameters. Handles write failures, reconnect signals. | TelemetryBus, RouteEngine, GearEngine, FTMS device | This is the only component that writes to the trainer. Everything else is advisory. |
| `ws/server.py` | `websockets` library server. Broadcasts `TelemetrySample + gear + grade` at UI cadence (~30 Hz). Accepts commands (`shift_up`, `shift_down`, `load_route`, `set_gear`). | TelemetryBus, GearEngine, RouteEngine | Pure serialization boundary. No control logic here. |
| `app.py` / `main.py` | Wires the graph, owns the asyncio event loop, handles shutdown signals, optionally serves the built React bundle on the same port. | All of the above | Entry point. Should be thin. |

**Key invariant:** only `control_loop.py` calls `ftms.set_sim_parameters()`. WS commands never reach FTMS directly — they mutate `GearEngine`/`RouteEngine` state, and the next loop tick picks it up. This keeps the write cadence deterministic.

### React Component Hierarchy

```
<App>
├── <ConnectionStatusBar/>           // WS + BLE state (connected/reconnecting/error)
├── <Cockpit>                        // the main screen
│   ├── <SpeedDisplay/>              // PRIMARY — largest visual element
│   ├── <GearIndicator/>             // PROMINENT — current gear + ratio
│   ├── <PowerDisplay/>              // watts
│   ├── <CadenceDisplay/>            // rpm
│   └── <GradeDisplay/>              // simulated grade + real grade (small)
├── <RouteStrip/>                    // optional: elevation profile with position marker
└── <KeyboardShifter/>               // invisible — captures keydown, sends WS commands
```

State management: one `useTelemetryStore` (Zustand) hook that the WS client pushes into. Components subscribe to slices. No prop drilling. No per-component WS connections.

**One WS connection, many subscribers** — the WS client is instantiated once at app root, pushes every message into the store, and components read from the store. This is critical; multiple WS connections per component will create races and reconnect storms.

---

## Data Flow

### Directions and Frequencies

| Flow | Direction | Frequency | Transport | Notes |
|------|-----------|-----------|-----------|-------|
| Indoor Bike Data (power/speed/cadence) | KICKR → Python | ~1 Hz (FTMS standard) up to ~4 Hz (Wahoo) | BLE GATT notifications | Determined by trainer, not us. |
| FTMS sim-parameter writes (grade) | Python → KICKR | **4 Hz (every 250 ms)** target | BLE GATT write | See rationale below. |
| Telemetry broadcast | Python → React | 20–30 Hz | WebSocket JSON | UI interpolates between samples for smoothness. |
| Shift commands | React → Python | Event-driven (per keypress) | WebSocket JSON | Debounced in React to prevent key-repeat floods. |
| Route/gear config | React → Python | Event-driven | WebSocket JSON | Fire-and-forget, ack via state broadcast. |

### The Realtime Control Loop Pattern

**Target cadence: 4 Hz (every 250 ms) for FTMS writes.** Rationale (MEDIUM confidence — based on community FTMS implementations; verify against KICKR behavior in Phase 1):

- Too fast (>10 Hz): Wahoo KICKR firmware throttles/ignores writes, BLE write queue backs up, adapter gets wedged.
- Too slow (<2 Hz): Grade transitions feel laggy on steep route changes.
- 4 Hz is the sweet spot most community FTMS projects converge on.

```python
# pseudocode — control_loop.py
TICK_HZ = 4
TICK = 1.0 / TICK_HZ

async def run(stop_evt):
    next_tick = loop.time()
    while not stop_evt.is_set():
        next_tick += TICK
        try:
            sample = telemetry_bus.latest()            # non-blocking read
            route_engine.advance(sample.speed, TICK)   # integrate distance
            real_grade = route_engine.grade_now()
            eff_grade  = gear_engine.apply(real_grade)
            await ftms.set_sim_parameters(grade=eff_grade)
        except BleakError:
            await ble_adapter.request_reconnect()      # backoff handled there
        # Drift-free sleep
        await asyncio.sleep(max(0, next_tick - loop.time()))
```

**Key properties:**
1. **Monotonic scheduling** — `next_tick += TICK` not `sleep(TICK)`, so jitter doesn't accumulate.
2. **Latest-wins telemetry** — the loop reads the most recent sample; if FTMS notifications are late, we reuse the previous one rather than blocking.
3. **Fail-soft on BLE errors** — one failed write does not kill the loop. The reconnect task runs in parallel.
4. **No awaiting on UI** — WS clients being slow/disconnected never stalls the control loop. The WSServer uses bounded queues that drop oldest on overflow.

### BLE Reconnect Pattern

`ble/adapter.py` owns reconnection as a **separate asyncio task**, not inside the control loop:

```
State: DISCONNECTED → SCANNING → CONNECTING → CONNECTED → (disconnected event) → DISCONNECTED
Backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s… (cap)
On reconnect: re-subscribe to Indoor Bike Data, re-request FTMS control, re-send current grade.
```

The control loop detects disconnect via `BleakError` on write and keeps ticking (writes become no-ops) until the adapter signals `CONNECTED` again. React shows "reconnecting" state via a telemetry broadcast field.

---

## Patterns to Follow

### Pattern 1: Pub/Sub Telemetry Bus
**What:** A single in-process bus where producers (FTMS, future Click, future HRM) publish samples and any number of consumers (control loop, WSServer, logger) subscribe.
**When:** Any time you have >1 producer or >1 consumer of the same data stream.
**Example:**
```python
class TelemetryBus:
    def __init__(self):
        self._subs: list[asyncio.Queue] = []
        self._latest: TelemetrySample | None = None
    def subscribe(self) -> asyncio.Queue: ...
    def publish(self, sample): self._latest = sample; [q.put_nowait(sample) for q in self._subs]
    def latest(self): return self._latest
```

### Pattern 2: Pure State Machines for Domain Logic
**What:** `GearEngine` and `RouteEngine` are plain classes with no async, no IO, no BLE knowledge.
**When:** Anything that's "business logic, not plumbing."
**Why:** Unit-testable without mocks. Can be driven from a replay harness later.

### Pattern 3: Command/Query Split at the WS Boundary
**What:** WS messages are either `command` (shift_up, load_route) or `event` (telemetry). Engine never sends a "response" — commands mutate state, next telemetry event reflects it.
**When:** Any realtime UI where the UI should always reflect actual state.
**Why:** Eliminates a whole class of "optimistic update went wrong" bugs.

### Pattern 4: Decoupled Write Cadence
**What:** Input frequency (keyboard smashing) ≠ output frequency (FTMS writes). The control loop coalesces.
**Why:** Protects the trainer from being DoS'd by key-repeat or route grade jitter.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Writing to FTMS From WS Handlers
**What:** Handling "shift_up" by directly calling `ftms.set_sim_parameters(...)` inside the WS message handler.
**Why bad:** Loses cadence control, causes write pileups, makes reconnect logic much harder.
**Instead:** WS handler mutates `GearEngine.current_gear`. Control loop picks it up on next tick.

### Anti-Pattern 2: Browser-Owned BLE
**What:** Trying to use Web Bluetooth in the React app "to simplify the stack."
**Why bad:** macOS Web Bluetooth FTMS support is unreliable; no Zwift Click reverse-engineering possible; kills the whole point of a stable local engine.
**Instead:** Python owns BLE, always.

### Anti-Pattern 3: Blocking the Event Loop
**What:** Calling `time.sleep()`, synchronous file IO during ride, or CPU-heavy math inside an async task.
**Why bad:** The control loop stalls, FTMS write cadence collapses, BLE notifications back up.
**Instead:** `asyncio.sleep`, load GPX at startup not mid-ride, run anything CPU-heavy in `loop.run_in_executor`.

### Anti-Pattern 4: Multiple WS Connections From React
**What:** Each component opening its own WS.
**Why bad:** Reconnect storms, race conditions, N× the server load, fragmented state.
**Instead:** Single WS client at root, Zustand store, component subscriptions.

### Anti-Pattern 5: Letting LLM/Coaching Touch the Control Loop
**What:** Any future LLM coach influencing FTMS writes directly.
**Why bad:** LLM latency (100ms–5s) is incompatible with 4 Hz deterministic control.
**Instead:** LLM can only *suggest* gear changes via the same WS command channel the UI uses. Trainer control stays deterministic.

---

## Build Order Implications

Downstream consumers: this ordering should drive the roadmap's phase structure.

1. **BLE adapter + FTMS read** — nothing else works without telemetry. Prove you can scan, connect, subscribe, and print power/speed/cadence to stdout. No WS, no React yet.
2. **FTMS write (set grade)** — prove you can request control and push a static grade. Validate the 4 Hz cadence against real KICKR behavior. No UI, just a CLI loop.
3. **TelemetryBus + ControlLoop skeleton** — wire read → fixed-grade write through the loop. This is the realtime backbone.
4. **WSServer + minimal React cockpit** — broadcast telemetry, render speed/power/cadence. No gears yet. Prove the data pipeline.
5. **GearEngine + keyboard input** — add shifting. Effective grade still = static default * gear_factor (no route yet). This is the MVP core value.
6. **RouteEngine (GPX)** — swap static grade for route-derived grade. Now the ride has shape.
7. **Zwift Click** — replace keyboard. Requires BLE sniffing spike; gated behind keyboard working.

Each step adds one component to a working system. Never build a module that doesn't yet have a consumer.

---

## Scalability Considerations

This is a single-user local app, so "scale" means **robustness and session length**, not users.

| Concern | 30-min ride | 3-hour ride | Ongoing use |
|---------|-------------|-------------|-------------|
| BLE stability | Usually fine | Reconnect will happen ≥ once — must be seamless | Adapter must survive sleep/wake |
| Telemetry log growth | ~200 KB at 1 Hz | ~2 MB | Rotate / compress nightly |
| Memory (Python) | Flat | Must not grow — watch for unbounded queues | Add a soft memory ceiling / log |
| React render perf | Trivial | Don't re-render cockpit on every sample — subscribe per metric | Use `requestAnimationFrame` for display smoothing |
| GPX size | Any | 100 km route fine in memory | Pre-index by distance at load |

The realistic failure mode is **a 90-minute ride where BLE drops at minute 47 and never cleanly reconnects**. Design for that, not for 1000 users.

---

## Sources

- `.planning/PROJECT.md` — constraints, decisions, hardware (HIGH confidence)
- FTMS Bluetooth SIG specification — standard control-point opcodes and sim-parameter format (MEDIUM confidence, from prior knowledge; verify exact byte layout in Phase 1)
- Community FTMS implementations on GitHub (bleak-based trainer controllers) — 4 Hz write cadence, reconnect backoff patterns (MEDIUM confidence — external verification blocked in this sandbox; validate empirically against KICKR Core)
- bleak library async patterns — CoreBluetooth backend on macOS (MEDIUM confidence — standard usage)

**Confidence notes:**
- Component boundaries and data flow directions: HIGH (follow directly from constraints in PROJECT.md).
- FTMS write cadence (4 Hz): MEDIUM — widely cited in community projects but Wahoo-specific behavior should be measured in Phase 1 and the constant tuned.
- BLE reconnect timing and Wahoo quirks: LOW — PROJECT.md explicitly says "expect trial and error." The *pattern* (separate reconnect task, backoff, state machine) is HIGH confidence; the *values* are not.
