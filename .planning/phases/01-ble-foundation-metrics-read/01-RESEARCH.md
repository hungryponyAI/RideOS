# Phase 1: BLE Foundation + Metrics Read - Research

**Researched:** 2026-04-12
**Domain:** Python BLE (bleak), FTMS Indoor Bike Data, macOS CoreBluetooth, asyncio reconnect patterns
**Confidence:** MEDIUM-HIGH (bleak API HIGH from pypi+changelog; FTMS byte format HIGH from pycycling source; Wahoo KICKR quirks MEDIUM from community sources; macOS permission behavior HIGH from bleak docs)

---

## Summary

Phase 1 scaffolds the entire Python engine from scratch. There is no existing source code. The deliverable is a stable asyncio process that discovers, connects to, and reads live telemetry from a Wahoo KICKR Core via the FTMS Indoor Bike Data characteristic (0x2AD2), with an auto-reconnect loop that survives BLE drops without crashing.

The primary technical challenges are macOS-specific: CoreBluetooth silently blocks scans when Bluetooth permission is not granted to the shell host, returning empty results with no error. This is the single most common Phase 1 failure mode and must be surfaced by a `scan.py` diagnostic before any integration work begins. The second major challenge is the asyncio callback safety rule: BLE notification callbacks must never await inside themselves — data goes into an `asyncio.Queue`, consumed separately.

bleak 3.0.1 is the current release (March 2026). It introduces minor breaking changes from 0.22.x (return types of connect/disconnect are now `None`; `BleakGATTProtocolError` replaces OS-specific exceptions; adapter argument deprecated). The fundamental API — `BleakClient`, `BleakScanner`, `start_notify`, `disconnected_callback` — is stable and unchanged in pattern.

**Primary recommendation:** Use bleak 3.0.1. Hand-roll the FTMS parser (do not use pycycling as a dependency — reference its source for the byte format only). Use the `asyncio.Queue` pattern for all notification callbacks. Build the reconnect loop as a separate asyncio task with exponential backoff.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLE-01 | User can connect to KICKR Core by device name or service UUID scan on macOS | BleakScanner.find_device_by_name() + service_uuids=["00001826"] filter; macOS uses CoreBluetooth UUIDs not MAC addresses |
| BLE-02 | App reads speed, power (watts), and cadence from FTMS Indoor Bike Data characteristic in real time | Characteristic 0x2AD2, flags-driven little-endian parser; speed /100, cadence /2, power raw int16 |
| BLE-04 | App auto-reconnects to KICKR after BLE drop using exponential backoff without crashing or requiring restart | Separate asyncio task; disconnected_callback sets asyncio.Event; outer while-True loop rescans and reconnects |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bleak | 3.0.1 | BLE client, CoreBluetooth backend on macOS | Only viable Python BLE library for macOS; asyncio-native; actively maintained |
| Python | 3.12+ | Runtime | asyncio maturity; bleak requires 3.10+ |
| uv | latest | Dependency management + venv | Fast, lockfile-based; replaces pip+venv for new projects |
| pytest | 8.x | Test runner | Standard; integrates with pytest-asyncio |
| pytest-asyncio | 0.23+ | Async test support | Required for testing async bleak patterns |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pycycling | reference only | Source reference for FTMS byte parser | Do NOT install as dependency — read `ftms_parsers/indoor_bike_data.py` source for the flags structure, then hand-roll a clean parser |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bleak | pyftms (0.4.15) | pyftms wraps bleak but adds abstraction overhead; Phase 2 FTMS write commands need fine-grained control; hand-roll gives full control |
| bleak | noble (Node.js) | Project is Python-first per CLAUDE.md decisions; noble is less stable on macOS |

**Installation:**
```bash
uv init engine
cd engine
uv add bleak
uv add --dev pytest pytest-asyncio
```

**Version verification:**
```bash
pip index versions bleak   # confirmed 3.0.1 current as of 2026-03-25
```

---

## Architecture Patterns

### Recommended Project Structure

```
engine/
├── pyproject.toml          # uv-managed deps
├── scan.py                 # standalone diagnostic: BT permission check + device scan
├── engine/
│   ├── __init__.py
│   ├── main.py             # asyncio.run() entry point; wires tasks together
│   ├── ble/
│   │   ├── __init__.py
│   │   ├── scanner.py      # find_kickr() — discover by name or FTMS UUID
│   │   ├── client.py       # KICKRClient: connect, start_notify, disconnect
│   │   └── reconnect.py    # reconnect_loop() asyncio task with exponential backoff
│   └── ftms/
│       ├── __init__.py
│       └── parsers.py      # parse_indoor_bike_data() — hand-rolled from FTMS spec
└── tests/
    ├── conftest.py
    └── ftms/
        └── test_parsers.py # unit tests for byte parser — no hardware required
```

### Pattern 1: BLE Notification via asyncio.Queue (CRITICAL)

**What:** All BLE notification callbacks push raw bytes into an `asyncio.Queue`. A separate consumer coroutine awaits items from the queue and calls the parser.

**When to use:** Always. Never await inside a BLE notification callback — this causes event loop deadlock.

**Example:**
```python
# Source: https://github.com/hbldh/bleak/blob/develop/examples/async_callback_with_queue.py
import asyncio
from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

INDOOR_BIKE_DATA_UUID = "00002ad2-0000-1000-8000-00805f9b34fb"

async def run(device, telemetry_queue: asyncio.Queue):
    def on_indoor_bike_data(
        _: BleakGATTCharacteristic,
        data: bytearray,
    ) -> None:
        # NEVER await here — this is a sync callback on the event loop
        telemetry_queue.put_nowait(data)

    async with BleakClient(device) as client:
        await client.start_notify(INDOOR_BIKE_DATA_UUID, on_indoor_bike_data)
        # consumer runs separately via asyncio.gather()
        await asyncio.Future()  # run forever until cancelled
```

### Pattern 2: Reconnect Loop (separate asyncio task)

**What:** A standalone task that owns the entire connect-notify-wait-disconnect cycle. When BLE drops, it rescans with exponential backoff and reconnects. The control loop and WS layer are separate tasks — they never block each other.

**When to use:** Phase 1 deliverable. This exact pattern is required by BLE-04.

**Example:**
```python
# Source: https://github.com/hbldh/bleak/discussions/1216
import asyncio
from bleak import BleakClient, BleakScanner, BleakError

KICKR_NAME = "KICKR CORE"
FTMS_UUID = "00001826-0000-1000-8000-00805f9b34fb"

async def reconnect_loop(telemetry_queue: asyncio.Queue):
    backoff = 1.0
    max_backoff = 60.0

    while True:
        device = await BleakScanner.find_device_by_name(KICKR_NAME, timeout=10.0)
        if device is None:
            # also try by FTMS service UUID as fallback
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: FTMS_UUID in (ad.service_uuids or []),
                timeout=10.0,
            )

        if device is None:
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)
            continue

        backoff = 1.0  # reset on successful discovery
        disconnected = asyncio.Event()

        def handle_disconnect(_: BleakClient) -> None:
            disconnected.set()

        try:
            async with BleakClient(
                device,
                disconnected_callback=handle_disconnect,
            ) as client:
                await _start_notifications(client, telemetry_queue)
                await disconnected.wait()
                disconnected.clear()
        except (BleakError, OSError) as exc:
            print(f"BLE error: {exc}")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)
```

### Pattern 3: FTMS Indoor Bike Data Parser

**What:** Hand-rolled little-endian flags-driven parser for characteristic 0x2AD2.

**FTMS Indoor Bike Data flags (bytes 0–1, little-endian uint16):**

| Bit | Meaning | Field present when... |
|-----|---------|----------------------|
| 0 | More Data (inverted for Indoor Bike) | Speed present when bit=0 |
| 1 | Average Speed present | bit=1 |
| 2 | Instantaneous Cadence present | bit=1 |
| 3 | Average Cadence present | bit=1 |
| 4 | Total Distance present | bit=1 |
| 5 | Resistance Level present | bit=1 |
| 6 | Instantaneous Power present | bit=1 |
| 7 | Average Power present | bit=1 |
| 8 | Expended Energy present | bit=1 |
| 9 | Heart Rate present | bit=1 |
| 10 | Metabolic Equivalent present | bit=1 |
| 11 | Elapsed Time present | bit=1 |
| 12 | Remaining Time present | bit=1 |

**Field encodings:**
- Instantaneous Speed: uint16, units = 0.01 km/h (divide by 100 for km/h)
- Instantaneous Cadence: uint16, units = 0.5 rpm (divide by 2 for rpm)
- Instantaneous Power: int16, units = 1 W (raw value is watts)

**Example parser:**
```python
# Source: pycycling ftms_parsers/indoor_bike_data.py (reference implementation)
import struct
from dataclasses import dataclass
from typing import Optional

@dataclass
class IndoorBikeData:
    speed_kmh: Optional[float] = None      # km/h
    cadence_rpm: Optional[float] = None    # rpm
    power_watts: Optional[int] = None      # W

def parse_indoor_bike_data(data: bytearray) -> IndoorBikeData:
    flags = struct.unpack_from("<H", data, 0)[0]
    offset = 2
    result = IndoorBikeData()

    # Bit 0 INVERTED for Indoor Bike: speed is present when bit 0 is CLEAR
    if not (flags & 0x01):
        result.speed_kmh = struct.unpack_from("<H", data, offset)[0] / 100.0
        offset += 2
    # average speed (bit 1)
    if flags & 0x02:
        offset += 2
    # instantaneous cadence (bit 2)
    if flags & 0x04:
        result.cadence_rpm = struct.unpack_from("<H", data, offset)[0] / 2.0
        offset += 2
    # average cadence (bit 3)
    if flags & 0x08:
        offset += 2
    # total distance (bit 4) — 3 bytes
    if flags & 0x10:
        offset += 3
    # resistance level (bit 5)
    if flags & 0x20:
        offset += 2
    # instantaneous power (bit 6)
    if flags & 0x40:
        result.power_watts = struct.unpack_from("<h", data, offset)[0]  # signed
        offset += 2

    return result
```

**CRITICAL:** Bit 0 "More Data" is **inverted** for Indoor Bike Data. Speed is present when bit 0 is 0, not 1. This is a known quirk documented in pycycling source comments ("The Huawei docs seem correct. There is no reversal"). Getting this wrong means speed is never parsed.

### Pattern 4: scan.py Diagnostic

**What:** Standalone script that attempts a BLE scan and prints results. If it returns 0 devices, it means either no devices are nearby or — more likely — macOS has silently blocked Bluetooth access for the terminal app.

**Example:**
```python
# scan.py — run this first, before any engine code
import asyncio
from bleak import BleakScanner, BleakError

async def main():
    print("Scanning for 5 seconds...")
    try:
        devices = await BleakScanner.discover(timeout=5.0)
        if not devices:
            print("ERROR: No devices found.")
            print("If Bluetooth is on and devices are nearby, this is a permission block.")
            print("Fix: System Settings > Privacy & Security > Bluetooth > enable Terminal (or iTerm2)")
        else:
            for d in devices:
                print(f"  {d.name or '(no name)'} | {d.address}")
    except BleakError as e:
        print(f"BleakError: {e}")
        print("Likely cause: Bluetooth permission not granted to this shell.")

asyncio.run(main())
```

### Anti-Patterns to Avoid

- **Awaiting inside a BLE notification callback:** Will deadlock the asyncio event loop mid-ride. Callbacks are sync; use `put_nowait()` not `await queue.put()`.
- **Scanning by MAC address on macOS:** CoreBluetooth does not expose MAC addresses. BLEDevice.address on macOS is a CoreBluetooth UUID (e.g., `12345678-ABCD-...`), not a MAC. Use device name or service UUID filter.
- **Passive scanning on macOS:** `BleakScanner(scanning_mode="passive")` raises `BleakError` on macOS. Omit the parameter (active scanning is the default and the only option on macOS).
- **Catching BleakDBusError:** Removed in bleak 3.0. Catch `BleakGATTProtocolError` or `BleakError` instead.
- **Importing adapter kwarg:** `BleakClient(device, adapter=...)` is deprecated in bleak 2.0+. On macOS there is only one adapter; omit the parameter entirely.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BLE event loop integration | Custom threading + BLE | bleak's asyncio-native BleakClient | CoreBluetooth has specific thread affinity requirements; bleak handles this correctly via pyobjc |
| Exponential backoff | Custom sleep doubling | Simple `min(backoff * 2, max_backoff)` with asyncio.sleep | This one is simple enough to hand-roll; just cap it |
| Service/characteristic lookup | Custom UUID registry | Use standard FTMS UUIDs from spec | 0x2AD2, 0x2AD6 (control point), 0x1826 (service) are Bluetooth SIG assigned |

**Key insight:** The FTMS byte parser is deceptively simple-looking but has multiple encoding gotchas (inverted speed flag, cadence /2, signed int16 for power). Unit-test it with captured byte arrays before connecting to hardware.

---

## Common Pitfalls

### Pitfall 1: Silent macOS Bluetooth Permission Block
**What goes wrong:** `BleakScanner.discover()` returns an empty list. No error is raised. The engine appears to work but finds nothing.
**Why it happens:** macOS CoreBluetooth requires per-application Bluetooth permission. Terminal apps (Terminal.app, iTerm2) must be individually granted permission in System Settings > Privacy & Security > Bluetooth. The Python process inherits the terminal's permission status.
**How to avoid:** Run `scan.py` as the very first step. If it returns 0 devices with Bluetooth on and the trainer powered, the fix is: System Settings > Privacy & Security > Bluetooth > toggle on for the terminal app in use.
**Warning signs:** Empty scan results, no BleakError raised, Bluetooth indicator in menu bar is active.

### Pitfall 2: Indoor Bike Data Speed Flag is Inverted
**What goes wrong:** Speed field is never populated (always None) despite the trainer sending data.
**Why it happens:** FTMS spec defines bit 0 as "More Data" with inverted semantics for Indoor Bike Data. Speed is present when bit 0 is **clear** (0), not set (1). Most generic FTMS implementations get this wrong.
**How to avoid:** The parser must check `not (flags & 0x01)` for speed, not `flags & 0x01`. Unit-test with known byte arrays captured from nRF Connect or the trainer before trusting live output.
**Warning signs:** cadence and power parse correctly, speed is always None.

### Pitfall 3: Awaiting Inside Notification Callback
**What goes wrong:** Engine appears to work for a few seconds then hangs completely mid-ride. No exception is raised. All BLE traffic stops.
**Why it happens:** BLE notification callbacks on macOS CoreBluetooth run in a context where awaiting another coroutine deadlocks the event loop. The entire asyncio loop stalls.
**How to avoid:** Callbacks MUST be synchronous. Use `queue.put_nowait(data)` never `await queue.put(data)`. Check every callback for any await expression.
**Warning signs:** Works for a few seconds/minutes then freezes; no exception in logs.

### Pitfall 4: bleak 3.0 Return Type Change
**What goes wrong:** Code that checks `if await client.connect():` fails because `connect()` now returns `None` not `bool`.
**Why it happens:** bleak 3.0 changed connect/disconnect/pair/unpair to return None. Old 0.22.x code that checked the return value breaks silently.
**How to avoid:** Use `async with BleakClient(device) as client:` (context manager form) — it raises `BleakError` on failure. Never check return value of connect().
**Warning signs:** Logic that was working with old bleak version stops entering connected-state code paths.

### Pitfall 5: Reconnect Task Interfering with Future Control Loop
**What goes wrong:** Reconnect task and future control loop (Phase 2) both try to manage the BleakClient, causing race conditions.
**Why it happens:** BleakClient is not thread-safe across async tasks. One owner of the client is required.
**How to avoid:** Reconnect loop is the single owner of the BleakClient. In Phase 2, the control loop gets a reference to the connected client passed via shared state, not its own client instance. Document this ownership in code comments.
**Warning signs:** Occasional `BleakError: Not connected` even when reconnect was just successful.

---

## Code Examples

### Discovery by Name with FTMS UUID Fallback

```python
# Source: bleak documentation + community patterns (MEDIUM confidence)
KICKR_NAME = "KICKR CORE"
FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb"

async def find_kickr() -> Optional[BLEDevice]:
    # Primary: by name (most reliable on macOS with a known device)
    device = await BleakScanner.find_device_by_name(KICKR_NAME, timeout=10.0)
    if device:
        return device

    # Fallback: by FTMS service UUID advertisement
    device = await BleakScanner.find_device_by_filter(
        lambda d, ad: FTMS_SERVICE_UUID in (ad.service_uuids or []),
        timeout=10.0,
    )
    return device
```

### Starting Indoor Bike Data Notifications

```python
# Source: pycycling fitness_machine_service.py + bleak docs (HIGH confidence)
INDOOR_BIKE_DATA_UUID = "00002ad2-0000-1000-8000-00805f9b34fb"

async def start_telemetry(client: BleakClient, queue: asyncio.Queue) -> None:
    def _on_data(_: BleakGATTCharacteristic, data: bytearray) -> None:
        queue.put_nowait(data)  # sync, never await

    await client.start_notify(INDOOR_BIKE_DATA_UUID, _on_data)
```

### Telemetry Consumer Loop

```python
async def telemetry_consumer(queue: asyncio.Queue) -> None:
    while True:
        data = await queue.get()
        if data is None:
            break
        reading = parse_indoor_bike_data(data)
        print(
            f"Speed: {reading.speed_kmh:.1f} km/h | "
            f"Power: {reading.power_watts} W | "
            f"Cadence: {reading.cadence_rpm:.0f} rpm"
        )
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bleak 0.22.x with `connect()` returning bool | bleak 3.0.1 with `connect()` returning None; use context manager | bleak 1.0 (2024) | Must use `async with BleakClient()` form; do not check return value |
| `BleakClient(device, adapter="hci0")` | adapter param deprecated; just `BleakClient(device)` on macOS | bleak 2.0 | Omit adapter kwarg entirely on macOS — there is only one |
| Catching `BleakDBusError` | Catch `BleakGATTProtocolError` or `BleakError` | bleak 3.0 | Update all except clauses |
| `pip` + `requirements.txt` | `uv` + `pyproject.toml` | Python ecosystem 2024 | Faster, lockfile-native, no separate venv activation needed |

**Deprecated/outdated:**
- `BLEDevice.metadata`: deprecated, use `AdvertisementData` instead (bleak 1.x+)
- `BleakScanner(scanning_mode="passive")` on macOS: raises BleakError; omit this parameter

---

## Open Questions

1. **Wahoo KICKR Core firmware version and FTMS characteristic availability**
   - What we know: KICKR Core supports FTMS. Bluetooth SIG-standard service UUID 0x1826 and Indoor Bike Data 0x2AD2 are used. Wahoo added FTMS support post-2018.
   - What's unclear: Whether the KICKR Core also advertises a proprietary Wahoo characteristic alongside FTMS, and whether the FTMS Indoor Bike Data characteristic sends all three fields (speed + cadence + power) or only a subset depending on firmware version.
   - Recommendation: Run `scan.py` against the live trainer, connect, enumerate services with `client.services`, and log which UUIDs are present before writing the parser. Capture a few raw `bytearray` payloads and verify speed/cadence/power flags before coding the parser.

2. **bleak 3.0.1 macOS 14/15 Sequoia regressions**
   - What we know: bleak 2.0 fixed a "Bluetooth device is turned off" exception when permission popup is shown. No known macOS 14/15 regression found in issue tracker as of research date.
   - What's unclear: Confirmed behavior on macOS 15 Sequoia with bleak 3.0.1 is not verified by a primary source. The STATE.md flag to check the issue tracker before Phase 1 execution stands.
   - Recommendation: Check https://github.com/hbldh/bleak/issues before starting implementation. Search for "macOS 15" or "Sequoia" in open issues.

3. **Notification rate from KICKR Core**
   - What we know: FTMS spec suggests ~1 Hz for Indoor Bike Data. In practice, Wahoo trainers may notify faster.
   - What's unclear: Actual notification rate from the KICKR Core. If it notifies faster than expected, queue backlog needs consideration.
   - Recommendation: Log timestamps in the telemetry consumer for the first 30 seconds and measure actual notification frequency before any rate-limiting assumptions.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23+ |
| Config file | `engine/pyproject.toml` (pytest section) — does not exist yet, Wave 0 |
| Quick run command | `pytest tests/ftms/ -x -q` |
| Full suite command | `pytest -x -q` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLE-01 | find_kickr() returns a device when one is advertising | Manual smoke (hardware required) | `python scan.py` (manual observation) | ❌ Wave 0 (scan.py) |
| BLE-02 | parse_indoor_bike_data() correctly extracts speed/cadence/power from known byte arrays | Unit | `pytest tests/ftms/test_parsers.py -x` | ❌ Wave 0 |
| BLE-02 | Speed flag inversion: byte array with bit0=0 yields speed, bit0=1 yields no speed | Unit | `pytest tests/ftms/test_parsers.py::test_speed_flag_inverted -x` | ❌ Wave 0 |
| BLE-02 | Cadence scaling: raw value 120 → 60.0 rpm | Unit | `pytest tests/ftms/test_parsers.py::test_cadence_scaling -x` | ❌ Wave 0 |
| BLE-02 | Power is signed int16: negative values (braking?) parse correctly | Unit | `pytest tests/ftms/test_parsers.py::test_power_signed -x` | ❌ Wave 0 |
| BLE-04 | Reconnect loop recovers from disconnect event without raising | Manual integration (hardware required) | Manual: unplug trainer, observe engine log | N/A (manual only) |

### Sampling Rate

- **Per task commit:** `pytest tests/ftms/ -x -q` (parser unit tests, no hardware)
- **Per wave merge:** `pytest -x -q` (all unit tests)
- **Phase gate:** Full suite green + manual scan.py smoke + manual reconnect test before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `engine/pyproject.toml` — pytest config section, bleak + dev deps
- [ ] `tests/__init__.py` — package init
- [ ] `tests/ftms/__init__.py` — package init
- [ ] `tests/ftms/test_parsers.py` — unit tests for `parse_indoor_bike_data` with known byte fixtures
- [ ] `tests/conftest.py` — shared fixtures (sample byte arrays for KICKR Indoor Bike Data payloads)
- [ ] Framework install: `uv add --dev pytest pytest-asyncio`
- [ ] `scan.py` — standalone diagnostic script (manual-only, no pytest)

---

## Sources

### Primary (HIGH confidence)
- https://pypi.org/project/bleak/ — version 3.0.1 confirmed, release date 2026-03-25
- https://github.com/hbldh/bleak/releases — breaking changes: connect() return type, BleakGATTProtocolError, adapter deprecation
- https://github.com/hbldh/bleak/blob/develop/examples/async_callback_with_queue.py — asyncio.Queue + callback pattern (official bleak example)
- https://github.com/zacharyedwardbull/pycycling — Indoor Bike Data flags structure and field encodings (source of truth for byte parser)

### Secondary (MEDIUM confidence)
- https://github.com/hbldh/bleak/discussions/1216 — reconnect pattern with asyncio.Event and disconnected_callback (community-verified against official API)
- https://devzone.nordicsemi.com/f/nordic-q-a/56157/ — FTMS Indoor Bike Data characteristic field structure confirmation

### Tertiary (LOW confidence — needs hardware validation)
- Wahoo KICKR Core FTMS characteristic availability: inferred from community sources (dvmarinoff/Auuki, Wahoo forum) — must be verified with nRF Connect on the physical device before coding the parser

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bleak 3.0.1 version confirmed from PyPI; API changes confirmed from changelog
- Architecture: HIGH — asyncio.Queue pattern from official bleak example; reconnect pattern from official discussion
- FTMS byte format: HIGH — pycycling source read directly; flags structure documented
- Pitfalls: HIGH (permission, callback) / MEDIUM (Wahoo quirks) — permission behavior from bleak docs; Wahoo FTMS characteristic list unverified without hardware
- Validation architecture: HIGH — pytest/pytest-asyncio are standard; test types correctly scoped

**Research date:** 2026-04-12
**Valid until:** 2026-07-12 (bleak is actively maintained; re-verify if bleak releases 3.1+ before implementation)
