# Domain Pitfalls: RideOS (BLE/FTMS Indoor Cycling Trainer)

**Domain:** Local indoor cycling app — Python bleak on macOS + Wahoo KICKR Core (FTMS) + Zwift Click + React cockpit
**Researched:** 2026-04-12
**Note on sources:** WebSearch and Context7 were unavailable during this research pass. The findings below are drawn from the assistant's training data on the BLE/FTMS/bleak/Wahoo ecosystem. Confidence levels reflect this: claims about FTMS spec behavior and widely-documented bleak issues are MEDIUM; Wahoo-specific quirks and macOS CoreBluetooth nuances are LOW-MEDIUM and should be re-verified against current Wahoo firmware notes, the Bluetooth FTMS 1.0 spec, and the bleak issue tracker before committing implementation choices. Flagged inline.

---

## Critical Pitfalls

Mistakes that cause rewrites, silent data corruption, or a trainer that won't respond.

### Pitfall 1: Not Requesting Control of FTMS Before Writing Setpoints
**What goes wrong:** App writes to the FTMS Control Point (0x2AD9) with "Set Indoor Bike Simulation Parameters" (opcode 0x11) or "Set Target Resistance Level" (0x04) and gets an error response (0x02 = Op Code Not Supported or 0x03 = Invalid Parameter), or worse — silently no effect.
**Why it happens:** The FTMS spec requires the client to send **Request Control (opcode 0x00)** and receive a successful indication response **before** any other control commands are accepted. Many tutorials skip this. After a disconnect/reconnect the control slot is released and must be re-requested.
**Consequences:** Grade writes appear to succeed from the app's perspective (write completes) but the trainer never changes resistance. Hours wasted chasing a "Wahoo quirk" that's actually a spec compliance issue.
**Prevention:**
1. After connecting, subscribe to indications on the Control Point (0x2AD9) first.
2. Write `0x00` (Request Control) to the Control Point.
3. Wait for the indication with response code 0x01 (Success) for opcode 0x00.
4. Then write `0x07` (Start/Resume) before sending any simulation parameters.
5. Only after those two handshakes should grade/resistance writes flow.
**Detection:** Log every Control Point indication. If you never see a success response for 0x00, you're not in control. Also: trainer LED status (KICKR Core) changes pattern when a controlling client is connected — watch for it during bring-up.
**Phase:** Phase 2 (FTMS control loop). Must be solved before virtual gearing matters.
**Confidence:** MEDIUM (FTMS 1.0 spec §4.16 — Request Control procedure is mandatory; verify exact byte sequences against current spec).

### Pitfall 2: Running bleak Without the macOS Bluetooth Entitlement / Missing Info.plist Key
**What goes wrong:** First bleak scan or connect silently returns empty results, or throws a `BleakError: Bluetooth device is turned off` despite Bluetooth being on. In Python 3.10+ on macOS 11+, the process needs explicit Bluetooth permission from the user.
**Why it happens:** macOS CoreBluetooth requires the host app (the Python interpreter or your packaged app) to have been granted Bluetooth permission by the user in System Settings → Privacy & Security → Bluetooth. When running `python script.py` from Terminal, **Terminal itself** (or iTerm, or VS Code) must be granted the permission — not Python. The prompt only fires once; if dismissed, no further prompts appear and scans just return nothing.
**Consequences:** Days debugging "my KICKR doesn't advertise" when the real problem is macOS silently blocking CoreBluetooth for the terminal host.
**Prevention:**
1. On first run, expect the system permission dialog. If it doesn't appear, manually toggle Bluetooth permission for Terminal/iTerm/VS Code in System Settings.
2. Document this in the README and project setup script — this will be the first bug encountered on any new machine or new shell host.
3. If packaging later (PyInstaller / py2app), the bundle needs `NSBluetoothAlwaysUsageDescription` in Info.plist, else the OS will silently deny.
4. Build a 5-line diagnostic `scan.py` that lists all BLE devices. If it returns empty but `blueutil --scan` (Homebrew) finds devices, it's a permission issue, not a code issue.
**Detection:** Empty scan results despite devices being advertised (confirm with a non-Python scanner like nRF Connect on iOS/macOS, or `blueutil`).
**Phase:** Phase 1 (BLE bring-up). Add a preflight permission check to the engine startup.
**Confidence:** HIGH (well-documented macOS CoreBluetooth behavior).

### Pitfall 3: Calling `await client.connect()` From Inside a Notification Callback
**What goes wrong:** Notification handler tries to trigger a reconnect, a write, or a new discovery. Deadlock, silent hang, or `RuntimeError: This event loop is already running`.
**Why it happens:** bleak notification callbacks on macOS are invoked from the CoreBluetooth delegate thread, which bleak marshals onto the asyncio loop. Calling blocking-ish async operations from inside the callback can deadlock the loop, especially if you do anything that awaits another BLE operation synchronously.
**Consequences:** Engine freezes mid-ride. Resistance gets stuck at last-sent value. Must kill and restart the Python process.
**Prevention:**
1. Notification callbacks should **only** push parsed data into an `asyncio.Queue` or call `loop.call_soon_threadsafe()`. Nothing else.
2. All BLE writes (Control Point commands, reconnects) happen in a dedicated async task that consumes from the queue or from a separate command channel.
3. Separate the "read/notify" pipeline from the "write/control" pipeline — they must not block each other.
**Detection:** Engine hangs with no exception. Add a heartbeat task that logs every second; if it stops, you're in a callback deadlock.
**Phase:** Phase 1–2. Lock in the pattern early; retrofitting it is painful.
**Confidence:** MEDIUM-HIGH (common bleak/asyncio anti-pattern; verify exact threading model in current bleak release).

### Pitfall 4: Single asyncio Event Loop Shared Between bleak and WebSocket Server With Blocking Work Mixed In
**What goes wrong:** WebSocket broadcast loop at 60 Hz occasionally stalls for 100–500 ms. BLE notifications queue up. Grade writes arrive late. Trainer resistance lags reality by seconds.
**Why it happens:** If GPX parsing, route math, or JSON serialization for 60 Hz broadcast is done inline in the same loop that services BLE notifications, every spike in one starves the other. Python's GIL makes `asyncio.to_thread()` for CPU work essential, not optional.
**Consequences:** Control loop jitter. Trainer feels "laggy." Shifts don't feel responsive. Very hard to debug because no crash — just bad feel.
**Prevention:**
1. Pre-parse GPX once at load time into a NumPy array or list of `(distance_m, grade_pct)` tuples. Never parse mid-ride.
2. Position interpolation and grade lookup should be O(log n) or O(1) (bisect on sorted distances).
3. JSON serialization for WebSocket: use `orjson` (3–10× faster than stdlib `json`); serialize once, broadcast to N clients.
4. Keep the control loop cadence (writing to trainer) **separate** from the UI broadcast cadence. Trainer updates every 250–500 ms are sufficient and match FTMS norms; UI can run at 30–60 Hz from the last-known state.
5. Never block the loop with `time.sleep()`; always `await asyncio.sleep()`.
**Detection:** Measure loop lag with `loop.time()` deltas in a heartbeat task. Alert if any iteration exceeds 20 ms.
**Phase:** Phase 2 (control loop) and Phase 3 (WebSocket feed). Architecture decision — if wrong, requires refactor.
**Confidence:** MEDIUM (general asyncio knowledge; specific numbers are typical, not measured).

### Pitfall 5: Writing to FTMS Control Point More Often Than the Trainer Can Handle
**What goes wrong:** App sends simulation parameters at 30–60 Hz "for smoothness." Trainer buffers, drops, or returns Control Point Not In Proper State errors. Resistance changes feel stepped or delayed.
**Why it happens:** BLE writes have a round-trip cost (~20–50 ms typical, worse on macOS where the connection interval is often ~30 ms minimum). The KICKR is not a 60 Hz device — its internal resistance servo updates at a lower rate. Spamming writes doesn't make it smoother; it clogs the radio.
**Consequences:** Perceived lag, occasional missed commands, BLE link instability, and in some cases the trainer appears to "lock up" mid-ride.
**Prevention:**
1. Rate-limit FTMS Control Point writes to **2–4 Hz** (every 250–500 ms). That is plenty for grade changes — real outdoor grade doesn't change faster.
2. Coalesce: if multiple updates queue up, send only the most recent value.
3. Only write when the target has actually changed beyond a small epsilon (e.g., 0.1% grade).
4. Use **Write Without Response** on the Control Point is **wrong** — FTMS Control Point requires Write With Response. Resistance characteristic may allow Write Without Response; check the descriptor.
**Detection:** Log Control Point indications. If response codes 0x04 (Control Not Permitted) or silent drops appear, you're writing too fast.
**Phase:** Phase 2. Decide rate policy before first end-to-end ride.
**Confidence:** MEDIUM (FTMS spec recommends write-with-response on Control Point; trainer-specific rate tolerance varies).

### Pitfall 6: Wahoo KICKR "Simulation Mode vs ERG Mode" State Confusion
**What goes wrong:** App sends `Set Indoor Bike Simulation Parameters` (grade) but trainer is stuck in ERG mode (fixed watts) from a previous session or a competing app. Grade has no effect.
**Why it happens:** The KICKR persists its last control mode across connections. If another app (Zwift, Wahoo app, TrainerRoad) last set an ERG target, the trainer may ignore grade commands until an explicit Reset (opcode 0x01) or a Set Targeted Resistance Level or Simulation Parameters command successfully transitions the state.
**Consequences:** Rider feels no change when shifting or when grade changes. Looks like a software bug, is actually a trainer state bug.
**Prevention:**
1. After Request Control + Start, send **Reset (opcode 0x01)** to force a clean state.
2. Then send a Set Simulation Parameters with zero grade to explicitly enter simulation mode.
3. Verify via Indoor Bike Data notification (0x2AD2) that the trainer is reporting — if power is zero when you're pedaling, something's off.
4. Add a "disconnect other apps" item to the user checklist — Wahoo app on iPhone will grab control if nearby.
**Detection:** Ride without shifting; grade changes in GPX route should feel different. If all grades feel identical, state is wrong.
**Phase:** Phase 2.
**Confidence:** LOW-MEDIUM (based on community reports and general FTMS state machine; verify against current KICKR Core firmware notes and Wahoo's FTMS implementation docs).

### Pitfall 7: Treating Zwift Click as a Standard BLE HID Device
**What goes wrong:** Developer assumes Zwift Click exposes a standard HID or button service. Spends hours scanning for standard characteristics that don't exist.
**Why it happens:** Zwift Click uses a **proprietary, unencrypted-but-undocumented** BLE service. Shift events come through custom characteristic notifications with Zwift's own protocol (often including a handshake/pairing step and sequence numbers). It does **not** conform to HID-over-GATT.
**Consequences:** Weeks lost before concluding reverse engineering is required. MVP keyboard stand-in is the right call (already in PROJECT.md — honor it).
**Prevention:**
1. Treat Zwift Click integration as a research spike, not a feature. Phase it after the core control loop works with keyboard input.
2. Use nRF Connect (iOS) or Bluetooth Explorer (macOS) to dump GATT tree and capture notifications while pressing buttons. Look at existing open-source efforts (e.g., `zwift-click` on GitHub, QZ trainer app source) before starting from scratch — someone has likely already decoded the protocol.
3. Expect a handshake write to a Zwift-specific characteristic before notifications start flowing.
4. Keep the keyboard input adapter and Click adapter behind the same `ShiftInput` interface — swap, don't rewrite.
**Detection:** N/A — known upfront.
**Phase:** Phase 4 or later (after core loop is solid). Do not block Phase 1–3 on this.
**Confidence:** MEDIUM (Zwift Click protocol is not officially published; community reverse-engineering exists).

---

## Moderate Pitfalls

### Pitfall 8: WebSocket Backpressure — Slow Client Freezes the Engine
**What goes wrong:** React UI tab goes to background (browser throttles it), or dev tools are open and slow. WebSocket send buffer fills. If you `await websocket.send()` in the main loop without timeout, the engine blocks — BLE reads stall — trainer resistance freezes.
**Prevention:**
1. Use `asyncio.wait_for(ws.send(...), timeout=0.1)` — drop the frame on timeout, don't block.
2. Or use a bounded `asyncio.Queue(maxsize=2)` per client; drop oldest on overflow (sliding window).
3. Only send deltas or latest state — never queue history on a realtime feed.
4. Detect disconnected clients aggressively; remove on first timeout, don't accumulate dead sockets.
**Phase:** Phase 3.
**Confidence:** MEDIUM.

### Pitfall 9: GPX Parsing Edge Cases — Zero-Distance Points, Missing Elevation, Interpolation Artifacts
**What goes wrong:** Route file has duplicate consecutive points (zero distance), missing `<ele>` tags, or very sparse elevation data (one point per km). Grade calculation divides by zero or produces wild spikes (±50%).
**Prevention:**
1. Pre-process GPX on load: deduplicate consecutive points within <1 m, interpolate missing elevation linearly, clamp computed grade to ±20%.
2. Smooth elevation with a small rolling window (e.g., 5-point moving average) before computing grade — raw GPS elevation is noisy ±2–5 m and produces false steep grades on flat roads.
3. Compute distance with the haversine formula, not Euclidean.
4. Use `gpxpy` for parsing but do your own grade calculation — don't trust library-computed grades blindly.
**Detection:** Plot the elevation profile and grade series on load. Any visible spike = data problem.
**Phase:** Phase 5 (GPX integration).
**Confidence:** HIGH (well-known GPS data issues).

### Pitfall 10: Units and Sign Conventions in FTMS Simulation Parameters
**What goes wrong:** Grade written as percentage when spec wants **0.01% units** (int16). Positive grade sent when trainer expects negative for uphill (or vice versa depending on wind/grade convention). Rider feels climbing on descents.
**Why it happens:** FTMS 0x11 (Set Indoor Bike Simulation Parameters) packs: wind speed (int16, 0.001 m/s), grade (int16, 0.01%), crr (uint8, 0.0001), cw (uint8, 0.01 kg/m). Off-by-100 is the most common bug.
**Prevention:**
1. Write an encoder with explicit unit tests: `encode(grade_pct=5.0)` should produce bytes with grade field = 500.
2. Verify sign: positive grade = uphill = more resistance. Confirm with a manual 10% test on a known trainer.
3. Log the exact bytes written on every Control Point write during development.
**Detection:** Early end-to-end test with known grades (0%, 5%, 10%); if 5% feels like 0.05% or 500%, unit bug.
**Phase:** Phase 2.
**Confidence:** HIGH (FTMS spec is explicit on this).

### Pitfall 11: Reconnect Logic That Fights macOS CoreBluetooth's Caching
**What goes wrong:** Trainer goes to sleep, app tries to reconnect, fails repeatedly. On macOS, CoreBluetooth caches device references; a stale reference after sleep often fails silently.
**Prevention:**
1. On reconnect failure, discard the cached `BLEDevice` and do a fresh `BleakScanner.discover()` to get a new reference.
2. Use exponential backoff on reconnect attempts: 1s, 2s, 4s, up to 30s. Don't hammer.
3. On Request Control indication failure after reconnect, assume you lost control and re-run the full handshake.
4. Surface connection state in the UI so the rider knows when the link is down.
**Phase:** Phase 2.
**Confidence:** MEDIUM.

### Pitfall 12: Power / Speed / Cadence Parsing — FTMS Indoor Bike Data Flags Field
**What goes wrong:** App assumes fixed field offsets in Indoor Bike Data (0x2AD2) notifications. Trainer's flags bitfield indicates which fields are present; misreading the flags produces wild values (cadence = 30000).
**Prevention:**
1. Parse the 2-byte flags field first. Each bit determines whether the corresponding field is present. Build a dispatch table.
2. Validate ranges: cadence < 200 rpm, power < 3000 W, speed < 100 km/h. Reject (don't clamp silently — log) out-of-range values.
3. Note that **speed is in 0.01 km/h** and **cadence is in 0.5 rpm** per the FTMS spec. Another 100×/2× bug source.
**Phase:** Phase 1.
**Confidence:** HIGH (FTMS 1.0 Indoor Bike Data characteristic is well-documented).

### Pitfall 13: React Re-Render Storm at 60 Hz
**What goes wrong:** WebSocket data pushed directly into React state at 60 Hz. Whole component tree re-renders. Browser tab pegs a core, UI jitters, fan spins.
**Prevention:**
1. Put realtime metrics in a Zustand store or a ref — not React state that triggers re-renders of parent components.
2. Use `useSyncExternalStore` or subscribe-only patterns; render only the specific text nodes that changed.
3. Throttle UI updates to 30 Hz (plenty for cockpit readout); batch them with `requestAnimationFrame`.
4. Keep speed/power/cadence as separate subscriptions so a cadence update doesn't re-render the speed widget.
**Phase:** Phase 3.
**Confidence:** HIGH.

---

## Minor Pitfalls

### Pitfall 14: Virgin-Pair Latency on First Connect
**What goes wrong:** First connection to a new KICKR takes 10–30 s while bonding/service discovery completes. User thinks app is broken.
**Prevention:** Show a "discovering services" spinner; cache the device UUID for faster reconnect next time.
**Phase:** Phase 1.
**Confidence:** MEDIUM.

### Pitfall 15: Notification Subscription Before Service Discovery Completes
**What goes wrong:** `start_notify()` called before bleak has fully enumerated GATT services raises `BleakError: Characteristic not found`.
**Prevention:** Always `await client.connect()` → it completes service discovery → then subscribe. Don't parallelize these.
**Phase:** Phase 1.
**Confidence:** HIGH.

### Pitfall 16: Logging Every BLE Notification to Disk
**What goes wrong:** Per-notification logging at 4 Hz × 1-hour ride = 14k lines. Fine. But if you log every write attempt, every WebSocket frame, every heartbeat at 60 Hz, log IO blocks the event loop.
**Prevention:** Use `logging` with a queue handler (`QueueHandler` + `QueueListener`) so log IO is off the event loop. Structured logs (JSON lines) with a level gate.
**Phase:** Phase 1 (set up early).
**Confidence:** HIGH.

### Pitfall 17: Not Having a "Safe Stop" Path
**What goes wrong:** App crashes, trainer stays at 15% grade. Rider must manually power-cycle the trainer to escape.
**Prevention:**
1. On engine shutdown (SIGINT, SIGTERM, uncaught exception), send FTMS Stop (opcode 0x08) and/or Reset (0x01) in a `finally` block.
2. Register `atexit` and asyncio signal handlers; give them 1 s to complete the write before exiting.
3. Add a manual "panic" keybind in the UI that sends stop.
**Phase:** Phase 2.
**Confidence:** HIGH.

### Pitfall 18: Python Version / bleak Version Drift
**What goes wrong:** Update Python or macOS, bleak behaves differently. CoreBluetooth backend has historically had version-sensitive bugs.
**Prevention:** Pin exact versions in `pyproject.toml` / `uv.lock` / `requirements.txt`. Document tested macOS + Python + bleak combo in README.
**Phase:** Phase 0 (setup).
**Confidence:** HIGH.

### Pitfall 19: Virtual Gearing Applied in the Wrong Place
**What goes wrong:** Gear factor applied to power instead of grade, or applied before grade clamping so extreme gears produce ±50% grades. Feels weird, not hard to debug but easy to get wrong.
**Prevention:**
1. Define a single `compute_effective_grade(real_grade, gear_factor) -> pct` pure function. Unit test it.
2. Clamp output to [-10%, +20%] (FTMS int16 allows wider but trainer will saturate).
3. Decide gear curve upfront: linear factor (1.0, 1.1, 1.2, ...) or geometric (1.0, 1.15, 1.32, ...). Geometric feels more natural.
**Phase:** Phase 2.
**Confidence:** MEDIUM.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 0 — Setup | Version drift (#18), missing macOS permissions (#2) | Pin versions; preflight permission check script |
| Phase 1 — BLE read loop (speed/power/cadence) | Permission denial (#2), flags parsing (#12), service discovery race (#15), notification callback threading (#3) | Diagnostic scan script; flags-aware parser; connect→then→subscribe; queue-only callbacks |
| Phase 2 — FTMS control (grade/resistance) | Missing Request Control (#1), rate limit (#5), state/mode confusion (#6), unit errors (#10), no safe-stop (#17), gearing math (#19) | Full handshake (Request Control + Start + Reset); 2–4 Hz writes with coalescing; encoder unit tests; finally-block Stop; pure gearing function |
| Phase 3 — WebSocket + React cockpit | Backpressure (#8), re-render storm (#13), event loop contention (#4) | Timeout-send + drop; Zustand/refs for 60 Hz; separate broadcast cadence from control cadence |
| Phase 4 — Zwift Click | Proprietary protocol assumption (#7) | Reverse-engineer with nRF Connect; check existing OSS; keep keyboard as fallback |
| Phase 5 — GPX routing | GPX edge cases (#9) | Preprocess + smooth + clamp on load |

---

## Top Five Takeaways for the Roadmap

1. **Phase 1 must include a CoreBluetooth permission preflight and diagnostic scan** — this is the #1 wasted-day trap on macOS.
2. **Phase 2 must implement the full FTMS handshake** (Request Control → Start → Reset → Set Simulation) **plus a rate-limited write policy at 2–4 Hz** before declaring the control loop "working." Anything else is illusion.
3. **Architect for separate cadences** from day one: BLE write loop at 2–4 Hz, UI broadcast at 30–60 Hz, GPX position update at 10 Hz. Mixing them in one loop is the #1 cause of "laggy feel" with no clear bug.
4. **Keep the shift-input layer behind an interface** so keyboard MVP → Zwift Click is a swap, not a rewrite. Do not let Click reverse-engineering block the core loop.
5. **Wire a safe-stop (FTMS Stop + Reset) into every shutdown path** before the first real ride. The alternative is manually power-cycling the trainer mid-ride.

---

## Confidence Summary

| Area | Level | Reason |
|------|-------|--------|
| FTMS protocol behavior (handshake, units, flags) | MEDIUM-HIGH | FTMS 1.0 spec is public and precise; specific bytes should be verified against the current spec during implementation |
| bleak + macOS CoreBluetooth behavior | MEDIUM-HIGH | Well-documented community knowledge; version-specific details should be checked against current bleak release notes |
| Wahoo KICKR firmware quirks (simulation vs ERG, state persistence) | LOW-MEDIUM | Based on community reports; verify against current KICKR Core firmware behavior — a Phase 0 or Phase 2 spike is warranted |
| Zwift Click protocol | LOW | No official docs; community reverse-engineering exists but may have evolved — check current OSS before Phase 4 |
| Asyncio / WebSocket / React patterns | HIGH | Generic but well-established patterns |
| GPX data handling | HIGH | Well-known GPS data issues |

## Research Gaps to Close Before Implementation

- Re-verify FTMS 1.0 Control Point opcode list and Indoor Bike Simulation Parameters packing against the current Bluetooth SIG FTMS specification.
- Check the **bleak** issue tracker for any current macOS-specific regressions (particularly around notification delivery and reconnect on macOS 14+/15+).
- Look at existing open-source implementations — specifically QZ (QDomyos-Zwift), `ftms-bike`, and any `zwift-click` community projects — for known-good handshake sequences and to copy their Wahoo-specific workarounds rather than rediscovering them.
- Confirm whether the KICKR Core exposes the Wahoo-proprietary service alongside FTMS; some KICKR features (trainer offset calibration, spindown) are only on the proprietary service. For RideOS's goals (grade + read data), FTMS alone should suffice — but worth confirming.
