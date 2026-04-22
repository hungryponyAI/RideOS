# Phase 5: Zwift Click Integration - Research

**Researched:** 2026-04-22
**Domain:** BLE reverse engineering, Python bleak, hardware input integration
**Confidence:** MEDIUM (BLE protocol details from community OSS; macOS-specific gaps remain)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEAR-03 | Zwift Click BLE → shift signals via reverse-engineered characteristic | Service UUID, characteristic UUIDs, button byte format, ECDH handshake pattern, and bleak integration pattern all documented below |

</phase_requirements>

---

## Summary

The Zwift Click has no official SDK. Community reverse-engineering (primarily @ajchellew/zwiftplay and @makinolo) has documented the full BLE stack, including service UUID, characteristic UUIDs, advertising manufacturer data (manufacturer ID 0x094A, device type byte 0x09 for Click), and the ECDH+HKDF key exchange required to receive decrypted button notifications. An unencrypted path also exists and has been demonstrated in Python (jat255/zwift_click_handling): send only `b'RideOn'` to the SYNC_RX characteristic without attaching ECDH public key bytes; the Click will respond without encryption in older firmware versions. Whether macOS + bleak can scan by the device name "Zwift Click" without a service UUID hint is a known macOS CoreBluetooth gap that must be confirmed on real hardware.

Button notifications arrive on the ASYNC characteristic (UUID `00000002-19CA-4651-86E5-FA29DCDD09D1`). The payload type byte `0x37` (decimal 55, `CLICK_NOTIFICATION_MESSAGE_TYPE`) precedes a protobuf-encoded message where key `'1'` = plus button (0=pressed, 1=released) and key `'2'` = minus button. The implementation follows the same debounce pattern used by `KeyboardShifter` (100 ms window) and calls `GearEngine.shift_up()` / `shift_down()` directly — the same methods the keyboard already calls. Keyboard fallback is preserved by keeping `KeyboardShifter` running in parallel.

**Primary recommendation:** Implement `engine/engine/input/click.py` as a parallel asyncio task alongside the keyboard. Use manufacturer data filter for scanning on macOS (CoreBluetooth does not expose MAC addresses). Attempt unencrypted handshake first; fall back to full ECDH if needed. Keep the keyboard running at all times as a permanent fallback.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bleak | >=3.0.1,<4.0 | BLE scan + GATT notify on macOS | Already in pyproject.toml; identical to KICKR path |
| cryptography | latest stable | ECDH (SECP256R1) + HKDF-SHA256 + AES-CCM | Standard Python crypto library; used by ajchellew/zwiftplay |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| protobuf / betterproto | optional | Parse Click notify payload | Only if unencrypted path is insufficient; raw byte parsing may suffice |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cryptography (ECDH) | pynacl | pynacl does not expose SECP256R1/nistp256; cryptography is mandatory for this curve |
| Full protobuf library | Manual varint parse | Click payload is small enough for manual key-value extraction without a full proto runtime |

**Installation (if cryptography not already present):**
```bash
cd engine && uv add cryptography
```

**Version verification:** `bleak` 3.0.1 is already pinned. No new BLE library needed.

---

## Architecture Patterns

### Recommended Project Structure Addition
```
engine/engine/input/
├── keyboard.py          # existing KeyboardShifter (unchanged)
└── click.py             # NEW: ClickShifter (runs as sibling asyncio.Task)
```

No changes to any locked API. `main.py` instantiates `ClickShifter`, calls `start()`, adds its task to `asyncio.gather`. `KeyboardShifter` remains untouched.

### Pattern 1: ClickShifter as Sibling asyncio.Task
**What:** `ClickShifter` runs as an independent `asyncio.Task` (same pattern as `reconnect_loop`, `broadcast_loop`). It owns its own `BleakClient` for the Click — completely separate from the KICKR's `BleakClient`. The single-owner rule from STATE.md applies per device; there is no shared client between KICKR and Click.

**When to use:** Always. Click is a second BLE peripheral — independent scan, independent connection, independent notify subscription.

```python
# engine/engine/input/click.py  (pattern sketch — not final code)
import asyncio
from bleak import BleakScanner, BleakClient, BleakError
from engine.gears.engine import GearEngine
import time

ZWIFT_CUSTOM_SERVICE_UUID   = "00000001-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_ASYNC_CHAR_UUID       = "00000002-19ca-4651-86e5-fa29dcdd09d1"
ZWIFT_SYNC_RX_CHAR_UUID     = "00000003-19ca-4651-86e5-fa29dcdd09d1"
CLICK_DEVICE_TYPE_BYTE      = 0x09   # manufacturer data byte 3 = 9 for Click
ZWIFT_MANUFACTURER_ID       = 0x094A
RIDE_ON                     = b"RideOn"
CLICK_NOTIFY_MSG_TYPE       = 0x37   # decimal 55

_DEBOUNCE_S = 0.10


async def run_click_shifter(
    gear_engine: GearEngine,
    stop_event: asyncio.Event,
) -> None:
    """Scan for Click, connect, subscribe, dispatch shifts. Retries on disconnect."""
    ...
```

**Key design decisions:**
- Scan filter: manufacturer data (ID `0x094A`, byte index 0 = `0x09`) — avoids macOS name-only scan unreliability.
- Alternatively: `find_device_by_filter` with service UUID `00000001-19ca-4651-86e5-fa29dcdd09d1`.
- Handshake: write `b'RideOn'` to `ZWIFT_SYNC_RX_CHAR_UUID`; this is the unencrypted path. If the Click does not respond with button events, full ECDH is required (see Pitfall 3).
- Notify subscription: `client.start_notify(ZWIFT_ASYNC_CHAR_UUID, _on_notify)`.
- Button decode: extract `data[0]` as message type; if `data[0] == 0x37`, parse subsequent bytes as protobuf varint fields; key `'1'` (tag `0x08`) = plus, key `'2'` (tag `0x10`) = minus; value `0` = pressed, value `1` = released.
- Debounce: same 100 ms window as `KeyboardShifter._DEBOUNCE_S`.
- Callback: plain `def` (not async); `queue.put_nowait` pattern if dispatching through a queue, or direct `gear_engine.shift_up()` / `shift_down()` if called from the asyncio thread.

### Pattern 2: main.py Integration
```python
# In main() — after existing shifter.start():
from engine.input.click import run_click_shifter

click_task = asyncio.create_task(
    run_click_shifter(gear_engine, stop_event),
    name="click_shifter",
)
# Add click_task to the asyncio.gather() call at shutdown.
```

The keyboard shifter continues running. No change to `KeyboardShifter`.

### Pattern 3: Device Discovery on macOS
macOS CoreBluetooth exposes peripherals by UUID, not MAC address. The recommended scan strategy:

```python
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

def _is_zwift_click(device: BLEDevice, adv: AdvertisementData) -> bool:
    mfr = adv.manufacturer_data.get(0x094A)  # Zwift manufacturer ID
    if mfr and len(mfr) >= 1 and mfr[0] == 0x09:
        return True
    # Fallback: service UUID in advertisement
    return ZWIFT_CUSTOM_SERVICE_UUID.lower() in [u.lower() for u in (adv.service_uuids or [])]

device = await BleakScanner.find_device_by_filter(_is_zwift_click, timeout=30.0)
```

Name-based scan (`find_device_by_name("Zwift Click")`) is simpler but unreliable on macOS when the Click has not previously been paired — CoreBluetooth may not return the local name until a scan response arrives (macOS 12+ bug). Manufacturer data filter is more reliable for first-time discovery.

### Anti-Patterns to Avoid
- **MAC address scanning:** CoreBluetooth does not expose MAC addresses. Never use `BleakClient("XX:XX:XX:XX")`.
- **Shared BleakClient with KICKR:** The Click must have its own `BleakClient`. Sharing violates the single-owner rule.
- **Blocking in notify callback:** Callback must be `def`, not `async def`. No `await` inside it. Use `gear_engine.shift_up()` directly (GearEngine is not async) or `loop.call_soon_threadsafe` if needed.
- **Calling `asyncio.run()` inside notify callback:** The callback fires on the asyncio event loop thread; `asyncio.run()` would deadlock.
- **Depending on encrypted path working out-of-box:** The ECDH path requires `cryptography` and correct AES-CCM nonce construction. Start with the unencrypted `b'RideOn'` path first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BLE scanning on macOS | Custom scan loop | bleak BleakScanner.find_device_by_filter | Handles CoreBluetooth UUID vs MAC, scan timeouts, adapter abstraction |
| ECDH key exchange | Custom crypto | cryptography library (ec.SECP256R1, ECDH, HKDF) | Subtle implementation bugs in key derivation cause silent decryption failures |
| Protobuf varint decode | Custom bit parser | Manual varint extraction OR betterproto | Click payload is 3-5 bytes; manual extraction is fine at this scale |
| Debounce logic | New debounce class | Reuse `_DEBOUNCE_S` pattern from KeyboardShifter | Identical problem — 100 ms window, monotonic clock |

**Key insight:** The Click integration is almost entirely wiring: scan, connect, handshake, subscribe notify, decode 1 byte, call `shift_up/down`. The only genuinely novel code is the handshake and byte decode.

---

## Common Pitfalls

### Pitfall 1: macOS Name Scan Unreliability
**What goes wrong:** `BleakScanner.find_device_by_name("Zwift Click")` returns `None` even with the Click powered on and nearby.
**Why it happens:** macOS CoreBluetooth defers the local name until a scan response packet arrives; the Click may not advertise its name in every packet.
**How to avoid:** Prefer manufacturer data filter (ID `0x094A`, type byte `0x09`) as primary scan strategy. Fall back to service UUID filter.
**Warning signs:** Scanner times out consistently; nRF Connect on phone sees the device but bleak does not.

### Pitfall 2: Advertising the Zwift Service UUID
**What goes wrong:** The Click may not include `00000001-19ca-4651-86e5-fa29dcdd09d1` in every advertising packet on macOS.
**Why it happens:** BLE advertising has limited payload space; service UUIDs may be in the scan response, which macOS caches inconsistently.
**How to avoid:** Use manufacturer data as primary filter; accept service UUID as secondary. Run with a generous timeout (30 s) for first discovery.

### Pitfall 3: Unencrypted Handshake May Not Work on Current Firmware
**What goes wrong:** Writing `b'RideOn'` produces no button events — the Click silently ignores the handshake or sends only idle `0x15` messages.
**Why it happens:** Zwift may have enforced encryption in firmware updates. The jat255 repo noted "I couldn't get encryption working" and the unencrypted path was tested on a specific firmware version.
**How to avoid:** Log ALL bytes from the ASYNC characteristic after handshake. If only `0x15` (idle) or `0x19` messages appear and no `0x37` on button press, the encrypted path is required.
**Full ECDH path required when:** No `0x37` message type after pressing plus/minus.
**Warning signs:** nRF Connect on phone shows notifications but they are all length-4+ with no `0x07` or `0x37` leading byte.

### Pitfall 4: BLE Callback Must Be Plain `def`
**What goes wrong:** Marking the notify callback `async def` and awaiting inside it raises a RuntimeError or silently drops events.
**Why it happens:** bleak invokes notify callbacks synchronously from the asyncio event loop; they must not be coroutines.
**How to avoid:** `def _on_notify(sender, data): ...` — never `async def`. For any async side-effects, use `asyncio.get_event_loop().call_soon(...)` or a `queue.put_nowait`.

### Pitfall 5: Double-Press on Button Release
**What goes wrong:** Each physical press produces a pressed-state notification (value 0) AND a released-state notification (value 1). Without filtering on the transition direction, each press triggers two shifts.
**Why it happens:** The Click sends both press and release events; the handler must fire only on the press edge (0→1 transition, i.e., act on value=0 received).
**How to avoid:** Track last button state per button index. Trigger shift only when value transitions from 1 (idle) to 0 (pressed). Do not trigger on the 1 (release) notification.

### Pitfall 6: Gear State Is Not Thread-Safe
**What goes wrong:** `GearEngine.shift_up/down` mutate `self.current_gear` — called from both keyboard reader and Click notify callback.
**Why it happens:** Both run on the same asyncio event loop thread so in practice there is no race, but this must remain true (no `run_in_executor` for the notify callback).
**How to avoid:** Keep both `KeyboardShifter` and `ClickShifter` on the main asyncio event loop. Never push BLE callbacks to a thread pool.

### Pitfall 7: macOS Requires Bluetooth Permission
**What goes wrong:** bleak scan silently returns no results on first run; no error raised.
**Why it happens:** macOS requires explicit Bluetooth permission granted to the terminal/app. If the process was never granted permission, CoreBluetooth returns empty results.
**How to avoid:** Run `python scan.py` first (existing tool). If `scan.py` sees devices but `click_scan` does not, it is a separate permission issue. Check System Preferences → Privacy & Security → Bluetooth.

---

## Code Examples

### Manufacturer Data Filter for Click Discovery
```python
# Source: bleak BleakScanner.find_device_by_filter docs + ajchellew/zwiftplay constants
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

ZWIFT_MANUFACTURER_ID = 0x094A   # decimal 2378 — source: jat255/constants.py
CLICK_DEVICE_TYPE     = 0x09     # BC1 device type — source: jat255/constants.py

def _is_click(device: BLEDevice, adv: AdvertisementData) -> bool:
    mfr = adv.manufacturer_data.get(ZWIFT_MANUFACTURER_ID)
    return bool(mfr and len(mfr) >= 1 and mfr[0] == CLICK_DEVICE_TYPE)

device = await BleakScanner.find_device_by_filter(_is_click, timeout=30.0)
```

### Unencrypted Handshake
```python
# Source: jat255/zwift_click_handling app.py + constants.py
ZWIFT_SYNC_RX_UUID = "00000003-19ca-4651-86e5-fa29dcdd09d1"
RIDE_ON = b"RideOn"

async def write_handshake_unencrypted(client):
    await client.write_gatt_char(ZWIFT_SYNC_RX_UUID, RIDE_ON, response=False)
```

### Notify Handler — Button Decode and Debounce
```python
# Source: jat255/zwift_click_handling app.py (adapted) + constants.py
import time

ZWIFT_ASYNC_UUID         = "00000002-19ca-4651-86e5-fa29dcdd09d1"
CLICK_NOTIFY_MSG_TYPE    = 0x37   # decimal 55 — source: jat255/constants.py
_DEBOUNCE_S              = 0.10

_last_shift_t = float("-inf")
_prev_button_state: dict[str, int] = {}   # key -> last value (0=pressed, 1=released)


def _on_notify(sender, data: bytearray) -> None:
    global _last_shift_t, _prev_button_state
    if not data or data[0] != CLICK_NOTIFY_MSG_TYPE:
        return
    # Minimal protobuf varint parse for Click payload
    # Fields: tag 0x08 (field 1 = plus), tag 0x10 (field 2 = minus)
    # Value 0 = pressed, 1 = released
    payload = bytes(data[1:])
    i = 0
    while i < len(payload):
        tag = payload[i]; i += 1
        val = payload[i] if i < len(payload) else 0; i += 1
        field_key = str(tag >> 3)   # field number from tag
        prev = _prev_button_state.get(field_key, 1)  # default = released
        if prev == 1 and val == 0:  # transition: released -> pressed
            now = time.monotonic()
            if (now - _last_shift_t) >= _DEBOUNCE_S:
                _last_shift_t = now
                if field_key == "1":   # plus
                    gear_engine.shift_up()
                elif field_key == "2": # minus
                    gear_engine.shift_down()
        _prev_button_state[field_key] = val
```

### ECDH Handshake Skeleton (if unencrypted path fails)
```python
# Source: ajchellew/zwiftplay + makinolo.com/blog/2023/10/08
from cryptography.hazmat.primitives.asymmetric.ec import generate_private_key, SECP256R1, ECDH
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend

RIDE_ON = b"RideOn"
REQUEST_START = bytes([1, 2])   # source: jat255/constants.py

def generate_key_pair():
    key = generate_private_key(SECP256R1(), default_backend())
    pub_bytes = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return key, pub_bytes

async def write_handshake_encrypted(client, private_key, public_bytes):
    payload = RIDE_ON + REQUEST_START + public_bytes[1:]   # strip leading 0x04
    await client.write_gatt_char(ZWIFT_SYNC_RX_UUID, payload, response=False)
    # Then read device's public key from SYNC_TX notify, derive shared secret,
    # apply HKDF-SHA256 with length=36, split into 32-byte AES key + 4-byte counter seed.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keyboard-only shifting | Click + keyboard fallback | Phase 5 | Physical shifter on bars; no keyboard needed during ride |
| Must reverse-engineer protocol | Community docs exist (ajchellew, makinolo, jat255) | 2023-2024 | Service/characteristic UUIDs are known; no raw sniffing required in ideal case |
| Encryption mandatory | Unencrypted path possible in some firmware | 2024 (observed) | Simpler initial implementation; encrypted path as fallback |

**Note (January 2025 firmware change):** Zwift changed Ride controller firmware to use a 16-bit service UUID (`FC82`) instead of the long form `00000001-19ca-4651-...`. This change affected Ride controllers (ID 7, 8) — whether it also affects Click (ID 9) is UNCONFIRMED. The research spike must verify which service UUID the physical Click advertises before implementation commits to a UUID.

---

## Open Questions

1. **Does the unencrypted handshake (`b'RideOn'` only) work on current Click firmware?**
   - What we know: jat255 demonstrated it working in 2024 on Linux/Windows. Makinolo notes encryption was dropped for Click.
   - What's unclear: Current firmware version on the user's Click; whether macOS bleak behaves identically.
   - Recommendation: Research spike step 1 — connect via nRF Connect on phone, note the firmware version shown in the Device Information service. Then attempt unencrypted path in Python. Log all bytes.

2. **What service UUID does the Click advertise on current firmware?**
   - What we know: `00000001-19ca-4651-86e5-fa29dcdd09d1` was the historic UUID. Ride controllers switched to `FC82` in Jan 2025.
   - What's unclear: Whether Click (device ID 9) received the same firmware update.
   - Recommendation: Research spike step 2 — nRF Connect scan, note all service UUIDs in advertising data.

3. **Does `find_device_by_name("Zwift Click")` work reliably on macOS + bleak 3.x?**
   - What we know: macOS CoreBluetooth has a scan response caching quirk. Manufacturer data filter is safer.
   - What's unclear: Whether providing `service_uuids=[ZWIFT_CUSTOM_SERVICE_UUID]` to BleakScanner helps.
   - Recommendation: Implement manufacturer data filter as primary; add service UUID as secondary; document name as tertiary. Test on real hardware.

4. **Does the Click need to be paired via macOS System Preferences first?**
   - What we know: The KICKR does not require pairing (FTMS, no bonding). The Click may require bonding for encryption.
   - What's unclear: Whether unencrypted path avoids the pairing requirement.
   - Recommendation: Try without pairing first. If connection fails at GATT level, pair via System Preferences.

5. **Is `protobuf` / `betterproto` needed or is manual varint parsing sufficient?**
   - What we know: Click payload is small (3-8 bytes). Manual tag/varint extraction is feasible.
   - What's unclear: Edge cases — multi-byte varints if button bitmap grows.
   - Recommendation: Start with manual parse. Add protobuf dependency only if payload structure proves complex.

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio |
| Config file | `engine/pyproject.toml` (asyncio_mode = "auto") |
| Quick run command | `cd engine && uv run pytest tests/input/ -x -q` |
| Full suite command | `cd engine && uv run pytest tests/ -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEAR-03 | Plus button notification → shift_up() called | unit | `pytest tests/input/test_click.py::test_plus_button_shifts_up -x` | ❌ Wave 0 |
| GEAR-03 | Minus button notification → shift_down() called | unit | `pytest tests/input/test_click.py::test_minus_button_shifts_down -x` | ❌ Wave 0 |
| GEAR-03 | Debounce: second notification within 100 ms ignored | unit | `pytest tests/input/test_click.py::test_debounce_rejects_rapid_repeat -x` | ❌ Wave 0 |
| GEAR-03 | Debounce: notification after 110 ms accepted | unit | `pytest tests/input/test_click.py::test_debounce_allows_after_window -x` | ❌ Wave 0 |
| GEAR-03 | Release event (value=1) does not trigger shift | unit | `pytest tests/input/test_click.py::test_release_not_dispatched -x` | ❌ Wave 0 |
| GEAR-03 | Idle/battery message types ignored (no shift) | unit | `pytest tests/input/test_click.py::test_unknown_message_type_ignored -x` | ❌ Wave 0 |
| GEAR-03 | Keyboard still shifts after Click is also wired | unit | `pytest tests/input/test_keyboard.py -x` (existing, re-run) | ✅ exists |
| GEAR-03 | Click connection failure does not crash main loop | unit | `pytest tests/input/test_click.py::test_connection_failure_retries -x` | ❌ Wave 0 |
| GEAR-03 | nRF Connect spike: device name, UUID, button bytes | manual | hardware spike — not automated | manual only |

**Manual-only justification:** The physical BLE sniffing spike (nRF Connect → confirm service UUID, button byte values) cannot be automated — it requires the real Zwift Click hardware and a smartphone.

### Sampling Rate
- **Per task commit:** `cd engine && uv run pytest tests/input/ -x -q`
- **Per wave merge:** `cd engine && uv run pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `engine/tests/input/test_click.py` — covers all GEAR-03 unit behaviors above
- [ ] No framework gaps (pytest + pytest-asyncio already installed and configured)
- [ ] `cryptography` dependency may need adding: `cd engine && uv add cryptography` — only if encrypted path is required

---

## Sources

### Primary (HIGH confidence)
- [jat255/zwift_click_handling — characteristics.py](https://github.com/jat255/zwift_click_handling) — Zwift service/characteristic UUIDs, manufacturer ID, device type byte for Click (BC1 = 0x09), constants
- [jat255/zwift_click_handling — constants.py](https://github.com/jat255/zwift_click_handling) — CLICK_NOTIFICATION_MESSAGE_TYPE=0x37, RIDE_ON, REQUEST_START, ZWIFT_MANUFACTURER_ID=0x094A
- [jat255/zwift_click_handling — app.py](https://github.com/jat255/zwift_click_handling) — unencrypted handshake pattern, button decode (key '1'=plus, key '2'=minus, value 0=pressed)
- [makinolo.com — Connecting to Zwift Play controllers](https://www.makinolo.com/blog/2023/10/08/connecting-to-zwift-play-controllers/) — service UUID 00000001-19ca-4651-86e5-fa29dcdd09d1, ASYNC char 00000002, SYNC_RX 00000003, ECDH handshake, AES-CCM encryption
- [ajchellew/zwiftplay](https://github.com/ajchellew/zwiftplay) — Click controller ID=9 in manufacturer data, characteristic layout
- [bleak macOS backend docs](https://bleak.readthedocs.io/en/latest/backends/macos.html) — CoreBluetooth UUID vs MAC limitation, scan response caching behavior

### Secondary (MEDIUM confidence)
- [makinolo.com — Zwift Ride protocol](https://www.makinolo.com/blog/2024/07/26/zwift-ride-protocol/) — January 2025 UUID change to FC82 (affects Ride controllers; Click status unconfirmed)
- WebSearch: encryption removed for Click — jat255 ran WITHOUT encryption; Makinolo states "Zwift got rid of the Bluetooth communication encryption they were using for the Play and the Click"

### Tertiary (LOW confidence)
- WebSearch: CLICK_NOTIFICATION_MESSAGE_TYPE = 0x37 (decimal 55) — single source (jat255/constants.py), not independently verified against raw capture
- Button byte format (protobuf varint, key '1'/'2', value 0/1) — derived from jat255/app.py; unverified against independent capture; must be confirmed during hardware spike

---

## Metadata

**Confidence breakdown:**
- Standard stack (bleak + cryptography): HIGH — same libraries already in project; no new choices needed
- Service/characteristic UUIDs: HIGH — consistent across ajchellew, jat255, makinolo
- Button byte format (0x37 message type, key '1'/'2'): MEDIUM — single implementation reference; needs hardware validation
- Unencrypted handshake works on current firmware: LOW — version-dependent; confirmed in 2024, unconfirmed for user's current firmware
- macOS scan behavior: MEDIUM — documented CoreBluetooth quirks from bleak docs, not tested with Click specifically

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (BLE ecosystem is stable; Zwift firmware changes are the primary invalidation risk)
