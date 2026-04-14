# Phase 2: FTMS Control Loop + Virtual Gearing - Research

**Researched:** 2026-04-13
**Domain:** FTMS Control Point (write path), asyncio 4 Hz control loop, virtual gearing math, keyboard shifter in asyncio, signal-driven safe shutdown
**Confidence:** HIGH (FTMS opcode table + handshake from pycycling source HIGH; 0x11 byte encoding cross-verified against community implementations HIGH; asyncio tick loop + signal patterns HIGH; Wahoo KICKR FTMS write acceptance MEDIUM — WRITE path untested on real hardware, READ path verified in Phase 1)

---

## Summary

Phase 2 flips the BLE link from read-only to read-write. The existing `reconnect_loop` already owns the single `BleakClient`; Phase 2 layers on the FTMS Control Point write path (characteristic `0x2AD9`) and the Fitness Machine Status indication handler (`0x2ADA`), the handshake state machine (Request Control → Start or Resume → periodic Set Indoor Bike Simulation Parameters at 4 Hz → Stop → Reset on shutdown), the deterministic `GearEngine` (10 gears, `effective_grade = real_grade / gear_factor`), a keyboard shifter, and the SIGINT/SIGTERM safe-shutdown path that writes Stop + Reset before process exit.

The critical architectural constraint locked in Phase 1 (STATE.md Decisions 01-04) is that the control loop **does not construct its own `BleakClient`**: it reads the live client reference from shared state set by `reconnect_loop` inside the `connect_client` async-with block. The reconnect loop is still the sole client owner. After every successful connect, the handshake must be re-run — bond state does not survive a disconnect.

FTMS opcode 0x11 (Set Indoor Bike Simulation Parameters) wire format is settled: `<B h h B B>` — opcode byte, sint16 wind (mm/s), sint16 grade (0.01%), uint8 crr (0.0001), uint8 cw (0.01 kg/m). The only parameter Phase 2 actually varies is grade; wind/crr/cw are sent as zero. Grade encoding is `int(grade_percent * 100).to_bytes(2, 'little', signed=True)`.

The KICKR READ path was stable for a full smoke ride in Phase 1. The WRITE path is untested on this operator's hardware and is the single biggest Phase-2 risk — expect to spend time with a bench smoke before the first real ride. STATE.md already flags this ("check QZ / ftms-bike OSS for Wahoo FTMS WRITE quirks — WRITE path untested").

**Primary recommendation:** Build the FTMS write path as `engine/ftms/control_point.py` (encoders) + a `FtmsController` class that performs the handshake and owns the 4 Hz coalescing tick. The `GearEngine` is a pure dataclass with no I/O. Keyboard input uses `loop.add_reader(sys.stdin, ...)` with a small cbreak helper — zero extra dependencies. Safe shutdown is handled via the Phase 1 `stop_event`: `main.py` awaits `stop_event`, then awaits `controller.shutdown()` which writes Stop + Reset before the reconnect task cancels.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 2 — `/gsd:discuss-phase` was not run. Proceed under the project defaults captured in `memory/decisions.md`, `memory/preferences.md`, STATE.md "Open Design Questions", and the Phase 2 roadmap entry.

### Locked Decisions (implicit — from prior phases, STATE.md, roadmap, memory/)

- Python + bleak 3.x in the existing `engine/` package (no new runtime language)
- `reconnect_loop` remains the SOLE owner of `BleakClient` — control loop reads client via shared state, never opens a second connection (STATE.md plan 01-04 architectural rule)
- Keyboard as Click stand-in AND permanent fallback (memory/decisions.md 2026-04-12; not "temporary")
- LLM layer never writes to the control loop — Phase 2 has no LLM surface at all (memory/decisions.md 2026-04-12)
- Only `control_loop` writes to the trainer (research/SUMMARY.md) — WS/UI commands in Phase 3 will mutate state, not write directly
- FTMS write cadence = 4 Hz (0.25s interval), coalesced from any faster input (research/SUMMARY.md Pitfall 3)
- macOS only, single user, no auth (REQUIREMENTS.md Out of Scope)
- No speculative abstractions — build only what BLE-03 / GEAR-01 / GEAR-02 / INFRA-02 require (memory/preferences.md)

### Claude's Discretion (flagged as open in STATE.md)

1. **Gear factor curve shape** — linear vs geometric across 10 gears (STATE.md Open Q 1)
2. **Grade smoothing window** before FTMS write — relevant for Phase 4 (GPX) more than Phase 2, but the seam needs to exist (STATE.md Open Q 2)
3. **Shift debounce window** for keyboard (STATE.md Open Q 4; Phase 2 scope)
4. **FTMS write cadence fine-tuning** — 4 Hz is the starting point, may need empirical adjustment during real-ride smoke (STATE.md Open Q 5)

Recommendations are documented below in each relevant section.

### Deferred Ideas (OUT OF SCOPE — do not research)

- GPX / route grade source — Phase 4. Phase 2 rides at a fixed test grade only (roadmap Phase 2 success criterion 4).
- Zwift Click integration — Phase 5. Keyboard is the Phase 2 input (roadmap Phase 5).
- WebSocket bridge / React cockpit — Phase 3 (REQUIREMENTS INFRA-01, UI-01..03).
- ERG mode / fixed wattage — explicitly out of scope in REQUIREMENTS.md.
- Ride export (CSV / FIT) — v2 scope (REQUIREMENTS.md v2).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLE-03 | App sends simulated grade to KICKR via FTMS simulation mode (full Request Control + Start handshake, 4 Hz control loop) | FTMS opcode table (§ Standard Stack, § Code Examples); handshake state machine (§ Pattern 1, § Pattern 2); 0x11 byte encoder (§ Code Examples); 4 Hz coalescing tick (§ Pattern 3) |
| GEAR-01 | 10-gear virtual system applies `effective_grade = real_grade / gear_factor` | Gear factor curve recommendation (§ Pattern 5); `GearEngine` dataclass spec with clamping (§ Code Examples) |
| GEAR-02 | Keyboard input (up/down arrow or configurable key) shifts gear up and down during a ride | `loop.add_reader(sys.stdin, ...)` + cbreak helper (§ Pattern 6, § Code Examples); debounce window recommendation (§ Common Pitfalls) |
| INFRA-02 | Safe shutdown (FTMS Stop + Reset) when Python exits or crashes — trainer never stuck at last grade | Signal-driven shutdown via existing `stop_event` (§ Pattern 4); Stop + Reset in `finally` (§ Common Pitfalls 4) |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bleak | 3.0.1 (already pinned in `engine/pyproject.toml`) | BLE write + indicate on FTMS Control Point + Status characteristics | Already in use; no new dependency |
| Python stdlib `struct` / `int.to_bytes` | — | FTMS opcode byte encoding | Zero dependency; matches Phase 1 parser style |
| Python stdlib `asyncio` | 3.12 | Control loop, event, signal handling, `add_reader` for stdin | Already the control surface |
| Python stdlib `signal` | 3.12 | SIGINT/SIGTERM handlers (already used in `main.py`) | Phase 1 already wires `loop.add_signal_handler` |
| Python stdlib `termios` + `tty` | 3.12 | cbreak (raw single-char) mode on stdin so arrow keys arrive without Enter | POSIX only; macOS-only project (REQUIREMENTS.md) |
| pytest + pytest-asyncio | 8.x / 0.23+ | Test infrastructure (already configured) | `asyncio_mode = "auto"` in `pyproject.toml` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pycycling `ftms_parsers/control_point.py` | reference only (DO NOT install) | Authoritative source for FTMS opcode hex values and 0x11 byte layout | Read the source once; hand-roll a minimal encoder (matches Phase 1 policy for the parser) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `loop.add_reader(sys.stdin, ...)` | `aioconsole.ainput()` | aioconsole works but needs a line (Enter) — bad UX for a shifter. `add_reader` + cbreak gives single-keystroke shifts with zero new deps |
| hand-rolled encoder | install `pycycling` | Phase 1 explicitly chose to hand-roll the parser; staying consistent (pycycling pulls in extra characteristics and abstractions we do not need) |
| sint16 for grade | uint16 normalized (Wahoo proprietary char `A026E005`) | Wahoo proprietary works but is non-standard and not spec-stable. FTMS standard 0x11 is portable and well-documented. Only fall back to proprietary if FTMS write visibly fails on the bench. |
| `loop.call_later` drift-free tick | simple `await asyncio.sleep(0.25)` loop | At 4 Hz over a ~60 min ride, drift is ≤ a few seconds — immaterial. Favour readability. |

**Installation:** No new packages. Existing `engine/pyproject.toml` is sufficient.

**Version verification:**
```bash
cd engine && uv run python -c "import bleak; print(bleak.__version__)"
# Expect 3.x (same install used in Phase 1)
```

---

## Architecture Patterns

### Recommended Project Structure

Building on the Phase 1 tree; additions in **bold**:

```
engine/
├── pyproject.toml
├── scan.py
├── engine/
│   ├── __init__.py
│   ├── __main__.py
│   ├── main.py                         # UPDATED: wires control loop + shifter + shutdown
│   ├── ble/
│   │   ├── scanner.py                  # locked
│   │   ├── client.py                   # locked (extended by import, not mutation)
│   │   └── reconnect.py                # UPDATED: exposes live client via shared state
│   ├── ftms/
│   │   ├── parsers.py                  # locked
│   │   └── control_point.py            # NEW: encoders for opcodes 0x00/0x01/0x07/0x08/0x11 + response parser
│   ├── control/
│   │   ├── __init__.py                 # NEW
│   │   ├── controller.py               # NEW: FtmsController — handshake + 4 Hz tick + shutdown
│   │   └── tick.py                     # NEW (optional): drift-aware tick helper
│   ├── gears/
│   │   ├── __init__.py                 # NEW
│   │   └── engine.py                   # NEW: GearEngine dataclass + shift_up / shift_down / effective_grade
│   └── input/
│       ├── __init__.py                 # NEW
│       └── keyboard.py                 # NEW: cbreak + add_reader stdin shifter
└── tests/
    ├── ftms/
    │   └── test_control_point.py       # NEW: encoder byte-fixture tests
    ├── gears/
    │   └── test_engine.py              # NEW: effective_grade math + clamping + shift bounds
    ├── control/
    │   └── test_controller.py          # NEW: handshake sequence, 4 Hz tick, shutdown stop+reset
    └── input/
        └── test_keyboard.py            # NEW: key → shift action dispatch (injected stdin)
```

### Pattern 1: FTMS Handshake State Machine

**What:** A short, explicit state machine run once per successful BLE connect. Must complete before the 4 Hz grade loop starts writing.

**When to use:** On every `reconnect_loop` iteration that successfully enters the `async with connect_client` block. Bond state does NOT persist across disconnects; re-handshake every time (STATE.md plan 01-04 Phase 2 caveat).

**States:**

```
IDLE
  → enable Control Point indications (start_notify on 0x2AD9)
  → write REQUEST_CONTROL (0x00) → await SUCCESS (0x01) via indicate
AWAITING_CONTROL
  → write START_OR_RESUME (0x07) → await SUCCESS
RUNNING                                # 4 Hz grade writes start HERE
  → on shutdown or disconnect:
  → write STOP_OR_PAUSE (0x08, 0x01)
  → write RESET (0x01)
SHUTDOWN
```

**Source:** pycycling `fitness_machine_service.py` (handshake order); FTMS v1.0 spec §4.16 (state rules).

### Pattern 2: Control Point Indication as asyncio.Future

**What:** The Control Point characteristic is `write, indicate`. Every write to it is acknowledged via a separate indication notification. You need both sides wired: register for indications before writing, write, await a Future that the indication callback resolves.

**Example:**
```python
# Source pattern: pycycling fitness_machine_service.py + bleak discussions/772
# (HIGH confidence — cross-verified against bleak docs on write+indicate characteristics)

class FtmsController:
    FMCP_UUID = "00002ad9-0000-1000-8000-00805f9b34fb"  # Fitness Machine Control Point
    FMS_UUID  = "00002ada-0000-1000-8000-00805f9b34fb"  # Fitness Machine Status

    def __init__(self, client: BleakClient):
        self._client = client
        self._pending: Optional[asyncio.Future[bytes]] = None

    async def start(self) -> None:
        await self._client.start_notify(self.FMCP_UUID, self._on_response)

    def _on_response(self, _: BleakGATTCharacteristic, data: bytearray) -> None:
        # SYNC callback — never await. Same safety rule as Phase 1 notify.
        if self._pending is not None and not self._pending.done():
            self._pending.set_result(bytes(data))

    async def _write_and_await(self, payload: bytes, timeout: float = 2.0) -> bytes:
        loop = asyncio.get_running_loop()
        self._pending = loop.create_future()
        # response=True → write-with-response at the ATT level; the indication
        # arrives separately via the _on_response callback.
        await self._client.write_gatt_char(self.FMCP_UUID, payload, response=True)
        try:
            return await asyncio.wait_for(self._pending, timeout=timeout)
        finally:
            self._pending = None
```

**CRITICAL:** Same callback-safety rule as Phase 1 — `_on_response` is a plain `def`, uses `set_result` (sync), never awaits. Awaiting in a CoreBluetooth callback deadlocks the event loop (Phase 1 Pitfall 3 still applies).

### Pattern 3: 4 Hz Coalescing Control Loop

**What:** A single asyncio task that, at 0.25s intervals, reads the current real grade + current gear + current shared state, computes `effective_grade`, and writes opcode 0x11. All input sources (keyboard, future WS from Phase 3, future GPX from Phase 4) mutate state — only this task writes to the trainer (research/SUMMARY.md architectural invariant).

**Epsilon-change gating:** If the next `effective_grade` is within ±0.05% of the previously sent value, skip the write. This prevents needless BLE traffic when the user hasn't shifted and the grade is stable. Still write at least once per second as a keepalive.

```python
# Source: research/SUMMARY.md Pitfall 3 + pycycling write pattern (HIGH confidence)
import asyncio, time

class FtmsController:
    _TICK_S = 0.25            # 4 Hz
    _EPSILON_PCT = 0.05       # 0.05% grade change threshold
    _KEEPALIVE_S = 1.0

    async def run_control_loop(self, state: RideState, stop_event: asyncio.Event) -> None:
        last_sent_grade: Optional[float] = None
        last_write_t = 0.0
        while not stop_event.is_set():
            grade = state.gear_engine.effective_grade(state.real_grade_percent)
            now = time.monotonic()
            changed = (last_sent_grade is None
                       or abs(grade - last_sent_grade) >= self._EPSILON_PCT)
            stale   = (now - last_write_t) >= self._KEEPALIVE_S
            if changed or stale:
                await self.set_simulation_parameters(grade_percent=grade)
                last_sent_grade = grade
                last_write_t = now
            await asyncio.sleep(self._TICK_S)
```

### Pattern 4: Safe Shutdown Hook Built on Phase 1's `stop_event`

**What:** `main.py` already `await stop_event.wait()` and then puts `None` on the telemetry queue. Phase 2 extends this: before cancelling/awaiting the reconnect task, await `controller.shutdown()` which writes Stop + Reset while the client is still connected.

The key rule: FTMS Stop + Reset must be issued **while the BLE client is still connected**, which means while we are still inside the reconnect loop's `async with connect_client(...)` block. That block has always exited by the time the reconnect task returns. Solution: the controller owns its own `shutdown()` method that runs inside the loop's body when it observes `stop_event.is_set()`.

```python
# Source: research/SUMMARY.md + Phase 1 main.py pattern (HIGH confidence)
# inside reconnect_loop's async-with, replacing the current:
#     await disconnected.wait()
# with:
#     await asyncio.wait(
#         [asyncio.create_task(disconnected.wait()),
#          asyncio.create_task(stop_event.wait())],
#         return_when=asyncio.FIRST_COMPLETED,
#     )
#     if stop_event.is_set():
#         await controller.shutdown()   # writes Stop (0x08, 0x01) + Reset (0x01)
```

### Pattern 5: Gear Engine — Pure Dataclass

**What:** The `GearEngine` is stateless I/O-wise. It holds `current_gear: int` (1..10) and a tuple of factors. `shift_up()` / `shift_down()` mutate the gear index with clamp. `effective_grade(real_grade)` returns `real_grade / factor`. No BLE, no asyncio, no WS — pure Python, trivially unit-testable (GEAR-01/02).

**Gear factor curve — RECOMMENDATION:** Use a **geometric progression** from 0.5 → 1.8 across 10 gears. `Focus Project.md` specifies the three anchors (Gang 1 = 0.5, Gang 5 = 1.0, Gang 10 = 1.8). A geometric curve matches the perceptual log-scale of rider effort — each shift feels like the same relative jump. A linear curve would make low-gear shifts feel tiny and high-gear shifts feel big.

Concrete table (geometric, computed once and pinned as a module constant):

| Gear | Factor | Feel |
|------|--------|------|
| 1 | 0.50 | very easy |
| 2 | 0.59 | |
| 3 | 0.70 | |
| 4 | 0.83 | |
| 5 | 0.99 | ~realistic (matches `Focus Project.md` "Gang 5 ~ 1.0") |
| 6 | 1.17 | |
| 7 | 1.38 | |
| 8 | 1.63 | |
| 9 | 1.93 | (~ the note's 1.8 target, slightly over) |
| 10 | 2.29 | very hard |

If the ~1.8 cap from the note is strict, tighten the ratio so `factor[10] = 1.8` exactly: `factor[i] = 0.5 * (1.8/0.5)**((i-1)/9) = 0.5 * 3.6**((i-1)/9)`:

| Gear | Factor |
|------|--------|
| 1 | 0.500 |
| 2 | 0.578 |
| 3 | 0.668 |
| 4 | 0.772 |
| 5 | 0.892 |
| 6 | 1.031 |
| 7 | 1.192 |
| 8 | 1.378 |
| 9 | 1.593 |
| 10 | 1.800 |

Pin this second table — it matches the note's explicit anchors and is rider-predictable.

### Pattern 6: Keyboard Shifter via `loop.add_reader` + cbreak

**What:** Put stdin into cbreak (single-char, no Enter) mode at startup; register `loop.add_reader(sys.stdin.fileno(), callback)`; callback reads one byte, dispatches arrow-key sequences or letter keys to `GearEngine.shift_up()` / `shift_down()`. Restore cooked mode on exit.

Arrow keys arrive as 3-byte escape sequences (`ESC [ A` up, `ESC [ B` down). The simplest reliable approach is to accept both arrows AND two letter keys (e.g. `k` = up, `j` = down) so the shifter works even when the terminal swallows escape sequences.

**Debounce — RECOMMENDATION:** ~100 ms. Below that, the keyboard can send repeat characters when a key is held that would over-shift. 100 ms is shorter than human intent-to-shift latency (~200 ms) so the user never feels a delay, but long enough to reject keyboard auto-repeat.

```python
# Source: asyncio docs `add_reader` + stdlib tty/termios (HIGH confidence for the pattern)
# Shows the skeleton; tests inject a fake stdin so termios is not invoked.
import asyncio, sys, termios, tty, time

class KeyboardShifter:
    _DEBOUNCE_S = 0.10

    def __init__(self, gear_engine, loop=None):
        self._gears = gear_engine
        self._loop = loop or asyncio.get_event_loop()
        self._fd = sys.stdin.fileno()
        self._prev_settings = None
        self._last_shift_t = 0.0
        self._escape_state = 0   # 0=normal, 1=saw ESC, 2=saw ESC [

    def start(self) -> None:
        self._prev_settings = termios.tcgetattr(self._fd)
        tty.setcbreak(self._fd)
        self._loop.add_reader(self._fd, self._on_readable)

    def stop(self) -> None:
        self._loop.remove_reader(self._fd)
        if self._prev_settings is not None:
            termios.tcsetattr(self._fd, termios.TCSADRAIN, self._prev_settings)

    def _on_readable(self) -> None:
        byte = sys.stdin.buffer.read(1)
        if not byte:
            return
        key = byte[0]
        # (arrow-key escape sequence state machine omitted for brevity;
        #  test_keyboard.py covers 'k'/'j'/ESC[A/ESC[B paths)
        now = time.monotonic()
        if now - self._last_shift_t < self._DEBOUNCE_S:
            return
        if key in (0x6B,):      # 'k'
            self._gears.shift_up()
            self._last_shift_t = now
        elif key in (0x6A,):    # 'j'
            self._gears.shift_down()
            self._last_shift_t = now
```

### Anti-Patterns to Avoid

- **Opening a second BLE client in the control task.** The architectural rule from Phase 1 stands: the reconnect loop is the sole `BleakClient` owner. Phase 2's controller takes the client as a constructor argument. (STATE.md plan 01-04 Phase 2 caveat.)
- **Writing 0x11 faster than 4 Hz.** The KICKR will throttle and the write queue will back up, eventually wedging the adapter (research/SUMMARY.md Pitfall 3). 4 Hz with epsilon gating is the budget.
- **Starting the 4 Hz loop before the handshake completes.** Without Request Control + Start, every 0x11 write is silently rejected by the trainer — the loop appears to work but resistance never changes (research/SUMMARY.md Pitfall 1).
- **Awaiting inside the FMCP indicate callback.** Same deadlock as Phase 1 Pitfall 3. Use `Future.set_result` (sync) and await the future elsewhere.
- **Shutting down without Stop + Reset.** If the process exits while the trainer is locked to, e.g., +8% grade, the KICKR stays there until another app writes. Non-negotiable: Stop + Reset before returning from the reconnect loop on stop_event (INFRA-02).
- **Normalising grade via Wahoo's proprietary `A026E005` service before trying standard FTMS 0x11.** Standard FTMS is portable and spec-defined. Only fall back to proprietary if standard 0x11 provably fails on this KICKR's firmware — and document the fallback with captured logs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FTMS opcode byte encoder | a full `pycycling` wrapper / `Struct` compiler | three tiny functions (`encode_request_control`, `encode_start`, `encode_stop`, `encode_reset`, `encode_sim_params`) using `int.to_bytes` | Same policy as Phase 1 parser; encoding is 4 one-liners |
| Write-with-indicate primitive | custom timer / polling | `BleakClient.start_notify` + `asyncio.Future` pattern | This is the documented bleak pattern for write+indicate chars (pycycling uses it) |
| Drift-free 4 Hz tick | Mode library / custom scheduler | plain `await asyncio.sleep(0.25)` inside a `while` loop | At 4 Hz over 60 min, drift ≤ a few seconds. Optimising is speculative (memory/preferences.md) |
| Keyboard shifter | `aioconsole`, `keyboard`, `pynput` | stdlib `tty` + `termios` + `loop.add_reader` | Zero new deps; single-keystroke (no Enter); macOS-only so POSIX is fine |
| Signal handling | custom `signal.signal(...)` wrapper | existing `loop.add_signal_handler(...)` already in `main.py` | Phase 1 already wired this; Phase 2 just adds a controller.shutdown() call inside the stop path |

**Key insight:** Every single supporting concern in Phase 2 has either already been built in Phase 1 (reconnect, signal handlers, queue-based consumer, config-driven `asyncio.Event` plumbing) or is a ≤ 20-line stdlib wrapper. The WRITE path itself is the only genuinely new BLE surface.

---

## Common Pitfalls

### Pitfall 1: Handshake Skipped or Stale After Reconnect

**What goes wrong:** Engine reconnects to the KICKR after a drop. 0x11 writes resume. Trainer resistance does not change. No error is raised.
**Why it happens:** FTMS control permission does not survive disconnect. Request Control + Start must be re-run on every reconnect.
**How to avoid:** Handshake is inside the `async with connect_client(...)` block, **before** the 4 Hz loop starts. Always. No caching of "handshake done" state across connections.
**Warning signs:** First ride works perfectly; after an unplug/replug mid-ride, grade writes no longer affect the trainer.

### Pitfall 2: Grade Encoding Off by 100

**What goes wrong:** All grades feel identical. Shifting changes nothing perceptible. Or: sending grade = 5.0 produces absurd resistance.
**Why it happens:** FTMS 0x11 grade is `sint16 little-endian, resolution 0.01%`. So grade = 5.0% encodes as 500, not 5. Off-by-100 makes every grade round to 0 or saturate (research/SUMMARY.md Pitfall 5).
**How to avoid:** Unit-test the encoder with known byte arrays: `encode_sim_params(grade_percent=5.0)` must produce `b'\x11\x00\x00\xf4\x01\x00\x00'`. `encode_sim_params(grade_percent=-3.5)` must produce `b'\x11\x00\x00\x5e\xfe\x00\x00'` (sint16 -350 LE = `5e fe`). Tests run with no hardware.
**Warning signs:** All gears feel the same at any grade; OR grade = 1.0 feels like climbing a wall.

### Pitfall 3: Keyboard Auto-Repeat Floods the Shifter

**What goes wrong:** User holds 'k' briefly — engine shifts from gear 3 to gear 10.
**Why it happens:** Terminal keyboard auto-repeat sends many chars per second when a key is held.
**How to avoid:** 100 ms debounce on `KeyboardShifter._last_shift_t` (see Pattern 6).
**Warning signs:** Shifting past target gear; `grep TELEMETRY` log shows a burst of gear changes over ~200 ms.

### Pitfall 4: Stop + Reset Missed on Crash / SIGTERM

**What goes wrong:** Process crashes mid-ride (uncaught exception, SIGTERM from a shell script). Trainer stays locked at +8% grade. Must force-cycle trainer power.
**Why it happens:** Stop + Reset only run in the happy-path shutdown (stop_event). Exceptions and crashes bypass them.
**How to avoid:** Two-layer defence:
1. The controller's `async def shutdown(self)` (Stop + Reset) is invoked from a `try/finally` that wraps the 4 Hz loop inside `reconnect_loop`'s async-with block. Any exception exiting the control loop still hits the `finally`.
2. The `loop.add_signal_handler(signal.SIGINT, stop_event.set)` already registered in Phase 1's `main.py` guarantees Ctrl-C enters the graceful path. SIGTERM is wired the same way.
Segfault / `kill -9` is unrecoverable by design — document this in README as a known limitation.
**Warning signs:** `raise` inside the control loop leaves the trainer stuck; trainer still resists after process exits.

### Pitfall 5: Ignoring Indication Response Codes

**What goes wrong:** Request Control silently fails with `CONTROL_NOT_PERMITTED` (e.g., another app has control). 4 Hz loop starts anyway. Every write is rejected.
**Why it happens:** `await self._write_and_await(...)` returns the raw indication bytes. If code doesn't parse result code byte[2] against 0x01 (SUCCESS), failures are invisible.
**How to avoid:** `parse_control_point_response(data)` must raise a dedicated `FtmsControlError(op, result_code)` when result != 0x01. Do not start the 4 Hz loop until Request Control AND Start both return SUCCESS. Log the response code enum name.
**Warning signs:** Engine claims "Controller ready" but resistance never changes; check logs for the last indication bytes.

### Pitfall 6: `stop_indoor_bike_notify` Write Happening After Stop + Reset

**What goes wrong:** Shutdown sequence: writes Reset, then disconnects — but then the Phase 1 `stop_indoor_bike_notify` call (inside reconnect loop) tries to write after disconnect, raises `BleakError`.
**Why it happens:** Phase 1's `reconnect_loop` already swallows `(BleakError, OSError)` around `stop_indoor_bike_notify` (line 92 of `reconnect.py`). This still holds — but the ordering matters: do Stop + Reset **before** the `stop_indoor_bike_notify`, with the client still connected.
**How to avoid:** Inside the async-with: handshake → run 4 Hz → on stop/disconnect → controller.shutdown() (Stop + Reset) → THEN `stop_indoor_bike_notify` → exit async-with (disconnect).
**Warning signs:** Shutdown log shows `BLE error during connect/notify` without ever showing Stop/Reset indication responses.

### Pitfall 7: Bleak 3.x `write_gatt_char` Positional `response` Kwarg

**What goes wrong:** `write_gatt_char(uuid, data, True)` silently does write-without-response on some bleak versions, or raises on others.
**Why it happens:** Between bleak 2.x and 3.x the `response` positional shifted to a keyword-only arg in some backends.
**How to avoid:** Always use the keyword form: `await self._client.write_gatt_char(FMCP_UUID, payload, response=True)`.
**Warning signs:** Write completes instantly with no indication arriving; or raises `TypeError: write_gatt_char() takes 2 positional arguments but 3 were given`.

---

## Code Examples

Verified patterns from the pycycling source + bleak official docs + community implementations. Adapt — don't copy — into the `engine/` layout above.

### FTMS Control Point opcodes (canonical byte encoders)

```python
# engine/ftms/control_point.py (NEW)
# Source: pycycling ftms_parsers/control_point.py (HIGH confidence)
# Cross-verified: Bluetooth SIG FTMS v1.0 §4.16; community encoders
#   `int(value * 100).to_bytes(2, 'little', signed=True)` for sint16 grade.
from __future__ import annotations
import enum
from dataclasses import dataclass

FMCP_UUID = "00002ad9-0000-1000-8000-00805f9b34fb"  # Fitness Machine Control Point
FMS_UUID  = "00002ada-0000-1000-8000-00805f9b34fb"  # Fitness Machine Status


class OpCode(enum.IntEnum):
    REQUEST_CONTROL                 = 0x00
    RESET                           = 0x01
    START_OR_RESUME                 = 0x07
    STOP_OR_PAUSE                   = 0x08
    SET_INDOOR_BIKE_SIMULATION_PARAMETERS = 0x11
    RESPONSE                        = 0x80


class ResultCode(enum.IntEnum):
    SUCCESS                = 0x01
    NOT_SUPPORTED          = 0x02
    INCORRECT_PARAMETER    = 0x03
    OPERATION_FAILED       = 0x04
    CONTROL_NOT_PERMITTED  = 0x05


def encode_request_control() -> bytes:
    return bytes([OpCode.REQUEST_CONTROL])


def encode_reset() -> bytes:
    return bytes([OpCode.RESET])


def encode_start_or_resume() -> bytes:
    return bytes([OpCode.START_OR_RESUME])


def encode_stop_or_pause(pause: bool = False) -> bytes:
    # 0x01 = stop, 0x02 = pause. INFRA-02 uses stop.
    return bytes([OpCode.STOP_OR_PAUSE, 0x02 if pause else 0x01])


def encode_set_simulation_parameters(
    grade_percent: float,
    wind_speed_mps: float = 0.0,
    crr: float = 0.0,
    cw: float = 0.0,
) -> bytes:
    """Opcode 0x11.

    Byte layout:  <B h h B B>
      opcode  uint8   0x11
      wind    sint16  units 0.001 m/s   LE
      grade   sint16  units 0.01 %      LE
      crr     uint8   units 0.0001 (dimensionless)
      cw      uint8   units 0.01 kg/m

    Phase 2 only varies grade; wind/crr/cw are sent as 0.
    """
    # Clamp to spec ranges to avoid encoding wraparound.
    grade = max(-327.68, min(327.67, grade_percent))
    wind  = max(-32.768, min(32.767, wind_speed_mps))
    crr_u = max(0, min(255, round(crr / 0.0001)))
    cw_u  = max(0, min(255, round(cw  / 0.01)))
    wind_i  = round(wind  * 1000)   # 0.001 m/s
    grade_i = round(grade *  100)   # 0.01 %
    return (
        bytes([OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS])
        + wind_i.to_bytes(2, "little", signed=True)
        + grade_i.to_bytes(2, "little", signed=True)
        + bytes([crr_u, cw_u])
    )


@dataclass(frozen=True)
class ControlPointResponse:
    request_op: OpCode
    result: ResultCode


def parse_control_point_response(data: bytes | bytearray) -> ControlPointResponse:
    """Parse an FMCP indication payload: 0x80 <req_op> <result> [extra...]."""
    buf = bytes(data)
    if len(buf) < 3 or buf[0] != OpCode.RESPONSE:
        raise ValueError(f"Unexpected FMCP indication: {buf.hex()}")
    return ControlPointResponse(
        request_op=OpCode(buf[1]),
        result=ResultCode(buf[2]),
    )
```

### FtmsController — handshake + 4 Hz loop + shutdown (skeleton)

```python
# engine/control/controller.py (NEW)
# Source: pycycling fitness_machine_service.py pattern + bleak discussions/772
from __future__ import annotations
import asyncio, logging, time
from typing import Optional
from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

from engine.ftms.control_point import (
    FMCP_UUID, OpCode, ResultCode,
    encode_request_control, encode_reset, encode_start_or_resume,
    encode_stop_or_pause, encode_set_simulation_parameters,
    parse_control_point_response,
)

_log = logging.getLogger(__name__)


class FtmsControlError(RuntimeError):
    def __init__(self, op: OpCode, result: ResultCode):
        super().__init__(f"FTMS {op.name} -> {result.name}")
        self.op = op
        self.result = result


class FtmsController:
    _TICK_S = 0.25
    _EPSILON_PCT = 0.05
    _KEEPALIVE_S = 1.0
    _RESPONSE_TIMEOUT_S = 2.0

    def __init__(self, client: BleakClient):
        self._client = client
        self._pending: Optional[asyncio.Future[bytes]] = None
        self._subscribed = False
        self._controlled = False

    async def start(self) -> None:
        """Subscribe to FMCP indications and run Request Control + Start."""
        await self._client.start_notify(FMCP_UUID, self._on_fmcp_indication)
        self._subscribed = True
        await self._send(encode_request_control(), OpCode.REQUEST_CONTROL)
        await self._send(encode_start_or_resume(), OpCode.START_OR_RESUME)
        self._controlled = True
        _log.info("FTMS handshake complete; control loop may begin")

    async def set_simulation_grade(self, grade_percent: float) -> None:
        payload = encode_set_simulation_parameters(grade_percent=grade_percent)
        # NOTE: Per FTMS spec, 0x11 also returns an indication. Awaiting every
        # indication at 4 Hz is safe but doubles BLE round-trips. If empirical
        # smoke shows this throttles the KICKR, switch to fire-and-forget:
        #   await self._client.write_gatt_char(FMCP_UUID, payload, response=True)
        # and log any indications received out-of-band.
        await self._send(payload, OpCode.SET_INDOOR_BIKE_SIMULATION_PARAMETERS)

    async def shutdown(self) -> None:
        """INFRA-02: best-effort Stop + Reset before disconnect. Never raises."""
        for payload, op in (
            (encode_stop_or_pause(pause=False), OpCode.STOP_OR_PAUSE),
            (encode_reset(),                    OpCode.RESET),
        ):
            try:
                await self._send(payload, op, timeout=1.0)
            except Exception:  # noqa: BLE001 — shutdown must not raise
                _log.exception("FTMS %s during shutdown failed (continuing)", op.name)
        self._controlled = False

    # --- internals ------------------------------------------------------------

    def _on_fmcp_indication(self, _: BleakGATTCharacteristic, data: bytearray) -> None:
        # SYNC. Never await. (Phase 1 Pitfall 3.)
        if self._pending is not None and not self._pending.done():
            self._pending.set_result(bytes(data))

    async def _send(self, payload: bytes, op: OpCode,
                    timeout: float = _RESPONSE_TIMEOUT_S) -> None:
        loop = asyncio.get_running_loop()
        self._pending = loop.create_future()
        try:
            await self._client.write_gatt_char(FMCP_UUID, payload, response=True)
            data = await asyncio.wait_for(self._pending, timeout=timeout)
        finally:
            self._pending = None
        resp = parse_control_point_response(data)
        if resp.request_op != op:
            raise FtmsControlError(op, ResultCode.OPERATION_FAILED)
        if resp.result != ResultCode.SUCCESS:
            raise FtmsControlError(op, resp.result)
```

### GearEngine — pure dataclass

```python
# engine/gears/engine.py (NEW)
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Tuple

# Geometric progression anchored to Focus Project.md: G1=0.5, G10=1.8.
# factor[i] = 0.5 * 3.6 ** ((i-1)/9)
_FACTORS: Tuple[float, ...] = (
    0.500, 0.578, 0.668, 0.772, 0.892,
    1.031, 1.192, 1.378, 1.593, 1.800,
)

@dataclass
class GearEngine:
    current_gear: int = 5
    factors: Tuple[float, ...] = field(default_factory=lambda: _FACTORS)

    @property
    def factor(self) -> float:
        return self.factors[self.current_gear - 1]

    def shift_up(self) -> int:
        self.current_gear = min(len(self.factors), self.current_gear + 1)
        return self.current_gear

    def shift_down(self) -> int:
        self.current_gear = max(1, self.current_gear - 1)
        return self.current_gear

    def effective_grade(self, real_grade_percent: float) -> float:
        """effective_grade = real_grade / gear_factor (Focus Project.md)."""
        return real_grade_percent / self.factor
```

### Wiring the controller into the existing reconnect loop

The Phase 1 `reconnect_loop` function has a clean seam at line 85 (`await disconnected.wait()`). The minimum-viable Phase 2 change is to extend the callers so that, inside the async-with, a controller starts, runs the 4 Hz loop until either disconnect or stop_event, and then shuts down — BEFORE the existing `stop_indoor_bike_notify` call. Illustrative diff:

```python
# engine/ble/reconnect.py  (UPDATED, illustrative)
async with connect_client(device, _on_disconnect) as client:
    await start_indoor_bike_notify(client, queue)

    controller = FtmsController(client)
    await controller.start()   # Request Control + Start; raises on failure
    on_client_ready(client, controller)   # publish to shared state (for Phase 3 WS)

    control_task = asyncio.create_task(
        run_control_loop(controller, ride_state, stop_event),
        name="ftms_control_loop",
    )

    # Wait for EITHER a disconnect OR a shutdown request.
    stop_wait = asyncio.create_task(stop_event.wait())
    disc_wait = asyncio.create_task(disconnected.wait())
    done, pending = await asyncio.wait(
        {stop_wait, disc_wait}, return_when=asyncio.FIRST_COMPLETED
    )
    for t in pending:
        t.cancel()

    control_task.cancel()
    try:
        await control_task
    except asyncio.CancelledError:
        pass

    # INFRA-02: always try Stop + Reset while we are still connected.
    await controller.shutdown()

    try:
        await stop_indoor_bike_notify(client)
    except (BleakError, OSError):
        pass
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bespoke BLE loops polling + threads | asyncio-native `BleakClient` + `start_notify` future pattern | bleak 2.x (2024) | Aligns Phase 2 with Phase 1; no threads needed |
| Drive trainers via proprietary characteristics | Standard FTMS `0x2AD9` / `0x2ADA` | Bluetooth SIG FTMS v1.0 (2017+); widely adopted post-2020 | We prefer standard; keep Wahoo proprietary as a fallback only |
| Write target power / ERG mode | Simulation mode (grade) | Project scope (REQUIREMENTS.md out-of-scope ERG) | Only 0x11 path matters for RideOS |
| Blocking `input()` for CLI prompts | `loop.add_reader(sys.stdin, ...)` with cbreak | asyncio mature (3.8+); tty module unchanged | Single-keystroke input, zero deps |

**Deprecated / outdated:**
- `BleakClient.write_gatt_char(..., response=True)` positional-True form — use kwarg form on bleak 3.x (Pitfall 7).
- `signal.signal()` for asyncio shutdown — use `loop.add_signal_handler()` (Phase 1 already uses this).

---

## Open Questions

1. **Does the KICKR Core's FTMS stack accept standard 0x11 without the Wahoo proprietary unlock write first?**
   - What we know: FTMS is a Bluetooth SIG standard; KICKR firmware post-2018 implements it. Standard 0x11 Grade is used by many third-party apps (QZ, zwift-offline clones).
   - What's unclear: Some Wahoo firmware revisions reportedly want an initial write to the proprietary service `A026E005-0A7D-4AB3-97FA-F1500F9FEB8B` to "unlock" full FTMS. No primary source confirms this; community threads are mixed.
   - Recommendation: Bench-smoke with FTMS-only first. If Request Control returns `CONTROL_NOT_PERMITTED` persistently or 0x11 returns `OPERATION_FAILED`, add a prerequisite write to the proprietary char, guarded by a feature flag and a documented log line. STATE.md already flags "check QZ / ftms-bike OSS for Wahoo FTMS WRITE quirks before execution" — do that spike in Plan 02-01 or 02-02.

2. **Do we need to await the indication for every 4 Hz 0x11 write, or is fire-and-forget acceptable?**
   - What we know: FTMS spec says every FMCP write produces an indication. pycycling awaits all of them. At 4 Hz over 60 min, that's 14,400 round-trips.
   - What's unclear: Whether the KICKR Core throttles or drops 0x11 writes if indications are ignored; whether the round-trip latency (typically ~30–80 ms on a quiet link) stays ≤ 250 ms at 4 Hz.
   - Recommendation: Start with await-per-write (simpler, diagnostic-friendly). Measure actual latency in the bench smoke. If it exceeds ~150 ms consistently, switch 0x11 writes to fire-and-forget while keeping handshake writes synchronous.

3. **Epsilon-change threshold for 0x11 coalescing (0.05%? 0.1%?)**
   - What we know: KICKR resistance resolution empirically ≥ 0.5% grade step in simulation mode; smaller steps are not perceptible.
   - What's unclear: Exact perceptible threshold on this operator's rig.
   - Recommendation: Ship 0.05% as a constant; tune empirically during the first real ride. Keep the keepalive at 1 Hz so a disconnected-but-silent loop is still detectable.

4. **Should keyboard shifter accept WS commands too (for Phase 3 forward-compat)?**
   - What we know: research/SUMMARY.md mandates "only control_loop.py writes to the trainer; WS commands mutate state for the next 4 Hz tick." This implies an `InputSource` seam.
   - What's unclear: Whether Phase 2 should build the seam or only the direct keyboard path.
   - Recommendation: Don't pre-build the seam (memory/preferences.md: "no speculative abstractions"). `KeyboardShifter` calls `GearEngine.shift_up/down` directly. Phase 3 will introduce a `ShiftBus` when WS lands; cheap refactor, and by then we'll know the real API.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23+ (already configured; `asyncio_mode = "auto"`) |
| Config file | `engine/pyproject.toml` → `[tool.pytest.ini_options]` (already exists; no changes needed) |
| Quick run command | `uv run pytest tests/ftms/test_control_point.py tests/gears/ -x -q` |
| Full suite command | `uv run pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLE-03 | `encode_set_simulation_parameters(grade_percent=5.0)` produces exact byte sequence `11 00 00 f4 01 00 00` | Unit | `uv run pytest tests/ftms/test_control_point.py::test_encode_grade_positive -x` | ❌ Wave 0 |
| BLE-03 | `encode_set_simulation_parameters(grade_percent=-3.5)` produces `11 00 00 5e fe 00 00` (sint16 LE) | Unit | `uv run pytest tests/ftms/test_control_point.py::test_encode_grade_negative -x` | ❌ Wave 0 |
| BLE-03 | `parse_control_point_response(b'\x80\x00\x01')` yields `ControlPointResponse(REQUEST_CONTROL, SUCCESS)` | Unit | `uv run pytest tests/ftms/test_control_point.py::test_parse_response_success -x` | ❌ Wave 0 |
| BLE-03 | `parse_control_point_response(b'\x80\x00\x05')` yields `CONTROL_NOT_PERMITTED` | Unit | `uv run pytest tests/ftms/test_control_point.py::test_parse_response_not_permitted -x` | ❌ Wave 0 |
| BLE-03 | `FtmsController.start()` writes REQUEST_CONTROL then START; raises `FtmsControlError` on non-SUCCESS | Unit (fake client) | `uv run pytest tests/control/test_controller.py::test_handshake_happy_path -x` | ❌ Wave 0 |
| BLE-03 | Control loop writes every ≤ 0.25s tick, respects epsilon gating and 1s keepalive | Unit (injected clock) | `uv run pytest tests/control/test_controller.py::test_tick_coalescing -x` | ❌ Wave 0 |
| BLE-03 | 4 Hz loop issues 0x11 only AFTER handshake SUCCESS | Unit | `uv run pytest tests/control/test_controller.py::test_no_write_before_handshake -x` | ❌ Wave 0 |
| BLE-03 | End-to-end: real KICKR resistance visibly changes when a known grade is written | Manual smoke | bench ride at fixed 5% grade, observe resistance | N/A (manual only) |
| GEAR-01 | `GearEngine(current_gear=5).effective_grade(6.0)` returns `6.0 / 0.892` | Unit | `uv run pytest tests/gears/test_engine.py::test_effective_grade_formula -x` | ❌ Wave 0 |
| GEAR-01 | `effective_grade` for all 10 gears at 6% real grade — matches pinned table | Unit (parametrised) | `uv run pytest tests/gears/test_engine.py::test_all_gears_at_6pct -x` | ❌ Wave 0 |
| GEAR-02 | `shift_up()` past gear 10 stays at 10; `shift_down()` past 1 stays at 1 | Unit | `uv run pytest tests/gears/test_engine.py::test_shift_bounds -x` | ❌ Wave 0 |
| GEAR-02 | `KeyboardShifter` dispatches 'k' → `shift_up`, 'j' → `shift_down`, ignores repeated keys within 100 ms | Unit (injected stdin + clock) | `uv run pytest tests/input/test_keyboard.py::test_shift_debounce -x` | ❌ Wave 0 |
| GEAR-02 | `KeyboardShifter` handles arrow-key ESC sequences `1b 5b 41` / `1b 5b 42` | Unit | `uv run pytest tests/input/test_keyboard.py::test_arrow_keys -x` | ❌ Wave 0 |
| GEAR-02 | End-to-end: pressing keys during a ride changes gear visibly in logs | Manual smoke | operator sits on bike, shifts, reads log | N/A (manual only) |
| INFRA-02 | `controller.shutdown()` writes STOP then RESET in order; never raises | Unit (fake client) | `uv run pytest tests/control/test_controller.py::test_shutdown_sequence -x` | ❌ Wave 0 |
| INFRA-02 | Shutdown runs even if control loop raises mid-tick | Unit (inject exception) | `uv run pytest tests/control/test_controller.py::test_shutdown_on_crash -x` | ❌ Wave 0 |
| INFRA-02 | SIGINT during a ride produces Stop + Reset indications before process exits | Manual smoke | operator Ctrl-C's running engine; inspect last log lines | N/A (manual only) |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/ftms/test_control_point.py tests/gears/ tests/control/ tests/input/ -x -q` (encoder + gear + controller + keyboard — all hardware-free)
- **Per wave merge:** `uv run pytest -x -q` (full suite; must include Phase 1's 17 tests — still green)
- **Phase gate:** Full suite green + manual bench smoke (bullets above) + full test ride at a fixed grade with keyboard shifts + SIGINT shutdown verified + unplug/replug mid-ride no-crash (Phase 1 BLE-04 still holds) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `engine/engine/ftms/control_point.py` — encoders + response parser + UUIDs + OpCode/ResultCode enums
- [ ] `engine/engine/gears/__init__.py` — package marker
- [ ] `engine/engine/gears/engine.py` — `GearEngine` dataclass + pinned factor table
- [ ] `engine/engine/control/__init__.py` — package marker
- [ ] `engine/engine/control/controller.py` — `FtmsController` (handshake + shutdown) + `run_control_loop` tick function
- [ ] `engine/engine/input/__init__.py` — package marker
- [ ] `engine/engine/input/keyboard.py` — `KeyboardShifter` (add_reader + cbreak)
- [ ] `engine/engine/ble/reconnect.py` — UPDATE to host the control_task inside async-with, plus controller.shutdown() before notify stop (see wiring diff above)
- [ ] `engine/engine/main.py` — UPDATE to construct `GearEngine`, `KeyboardShifter`, `RideState`; pass through to `reconnect_loop`
- [ ] `engine/tests/ftms/test_control_point.py` — ≥ 6 tests: encoders (grade ±, zero, clamp), response parse (success, not-permitted, malformed)
- [ ] `engine/tests/gears/__init__.py`, `engine/tests/gears/test_engine.py` — shift bounds, effective_grade formula, all-gears parametrised
- [ ] `engine/tests/control/__init__.py`, `engine/tests/control/test_controller.py` — handshake happy path, non-SUCCESS raises, tick coalescing, shutdown sequence, shutdown-on-crash, no-write-before-handshake (with `FakeBleakClient` double — same style as Phase 1 reconnect tests)
- [ ] `engine/tests/input/__init__.py`, `engine/tests/input/test_keyboard.py` — 'k'/'j' dispatch, arrow ESC sequence, debounce, stop() restores termios (with injected fake file descriptor + clock)
- [ ] `engine/tests/conftest.py` — EXTEND with fixtures: sample FMCP indication bytes (success, each error code), a `FakeBleakClient` that records writes and can be prompted to fire indications

---

## Sources

### Primary (HIGH confidence)
- pycycling `ftms_parsers/control_point.py` (via https://zacharybull.com/pycycling/_modules/pycycling/ftms_parsers/control_point.html) — authoritative opcode table + 0x11 byte layout + response parser
- pycycling `fitness_machine_service.py` (via https://zacharybull.com/pycycling/_modules/pycycling/fitness_machine_service.html) — FMCP/FMS UUIDs, `write_gatt_char(..., True)` + `start_notify` handshake idiom
- Bleak 3.0.1 docs — https://bleak.readthedocs.io/en/latest/api/client.html — `write_gatt_char(response=True)` + `start_notify` for indicate chars
- Phase 1 RESEARCH.md + Phase 1 `engine/` source — locked contract for `reconnect_loop`, `BleakClient` ownership rule, callback safety rule
- Python asyncio docs — `loop.add_reader`, `loop.add_signal_handler`, `asyncio.wait(FIRST_COMPLETED)`

### Secondary (MEDIUM confidence)
- Bleak discussions #772 — https://github.com/hbldh/bleak/discussions/772 — FMCP write-then-indicate pattern confirmation
- Community encoder pattern `int(value * 100).to_bytes(2, 'little', signed=True)` for sint16 grade (python-help thread; matches spec)
- Roguelynn "Graceful Shutdowns with asyncio" — signal handler + `stop_event` + `finally`-driven cleanup pattern

### Tertiary (LOW confidence — needs bench validation)
- Wahoo proprietary service `A026E005-0A7D-4AB3-97FA-F1500F9FEB8B` "unlock" prerequisite — inferred from qdomyos-zwift Wahoo adapter source and community bug reports; not confirmed for KICKR Core specifically. Bench-smoke Plan 02 will settle this.
- Exact KICKR Core 0x11 indication round-trip latency — no primary source; measure during bench smoke.

---

## Metadata

**Confidence breakdown:**
- FTMS opcodes + UUIDs + 0x11 byte encoding: HIGH — cross-verified across pycycling source, FTMS v1.0 spec references, and two community implementations
- Handshake sequence (RC → Start → … → Stop → Reset): HIGH — pycycling pattern + spec §4.16
- Bleak write-with-indicate pattern: HIGH — official bleak docs + pycycling real-world use
- asyncio 4 Hz loop + signal shutdown: HIGH — stdlib; Phase 1 already uses add_signal_handler
- Keyboard shifter via `add_reader` + cbreak: HIGH — stdlib pattern; widely documented
- Gear factor curve (geometric 0.5→1.8): MEDIUM-HIGH — formula is deterministic; "feels right" is a subjective rider call that may tune post-ride
- Wahoo KICKR FTMS write acceptance: MEDIUM — READ path verified in Phase 1 smoke; WRITE path untested on this hardware; STATE.md already flags this as a pre-execution spike

**Research date:** 2026-04-13
**Valid until:** 2026-07-13 (FTMS spec is stable; bleak is on 3.0.1 with no breaking changes expected in a 3-month window; revisit if the bench smoke surfaces Wahoo quirks)
