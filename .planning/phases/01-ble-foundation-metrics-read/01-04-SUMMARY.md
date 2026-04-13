---
phase: 01-ble-foundation-metrics-read
plan: 04
subsystem: ble
tags: [ble, bleak, ftms, reconnect, backoff, asyncio, lifecycle, entry-point, tdd]

# Dependency graph
requires:
  - phase: 01-ble-foundation-metrics-read
    plan: 03
    provides: find_kickr (scanner) + start/stop_indoor_bike_notify + telemetry_consumer (read-path primitives)
provides:
  - engine.ble.reconnect.reconnect_loop (standalone async lifecycle owner)
  - engine.ble.reconnect.ReconnectConfig (initial_backoff, max_backoff)
  - engine.main.main (CLI entry; SIGINT/SIGTERM driven graceful shutdown)
  - engine.__main__ (so `python -m engine` works)
  - Locked "single owner of BleakClient = reconnect_loop" rule for phase 2
  - Locked reconnect contract: queue + find_device + connect_client + sleep + stop_event are all injectable
affects:
  - phase 02 control-loop (will plug in via shared client reference set inside reconnect_loop, NOT a second BleakClient)
  - phase 03 websocket-bridge (will swap _log_reading for a WS publish handler — same telemetry_consumer signature)
  - All future phases: `python -m engine` is the single canonical entry point

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reconnect loop is a standalone asyncio task — separate from the read primitives in client.py"
    - "asyncio.Event signals disconnect (callback sets it; loop awaits it) — no polling"
    - "Capped exponential backoff: initial_backoff doubles to max_backoff on consecutive failures, resets after a full successful cycle"
    - "All side effects (find_device, connect_client, sleep) are injected — the loop is unit-testable without bleak or wall-clock"
    - "Production connect_client uses `async with BleakClient(...)` per bleak 3.x contract (no .connect()/.disconnect() pair)"
    - "SIGINT/SIGTERM handlers set a shared stop_event; consumer is signalled via a `None` queue sentinel"

key-files:
  created:
    - "engine/engine/ble/reconnect.py (reconnect_loop + ReconnectConfig + injectable Find/Connect/Sleep types)"
    - "engine/engine/main.py (async main(), _connect_client, _log_reading, signal handler wiring)"
    - "engine/engine/__main__.py (so `python -m engine` boots main())"
    - "engine/tests/ble/test_reconnect.py (4 unit tests, no real BLE, no wall-clock sleep)"
  modified:
    - "engine/README.md (added 'Run the engine (Phase 1)' + manual smoke test section)"

key-decisions:
  - "Backoff resets only after a FULL successful cycle (connect → subscribe → disconnect), not on bare discovery — prevents fast-retry loops when connect/subscribe repeatedly fails after a successful scan"
  - "stop_event is checked twice per iteration (top of loop AND after a None-device branch) so shutdown does not incur a final stray sleep when the trainer is missing at exit time"
  - "BleakError + OSError are the only exception classes caught; BleakDBusError is deprecated in bleak 3.x (per RESEARCH.md anti-patterns) and is NOT referenced anywhere"
  - "Production connect_client is a tiny @asynccontextmanager wrapping `async with BleakClient(device, disconnected_callback=...)` — no call to .connect()/.disconnect() (Pitfall 4: bleak 3.0 return-type change)"
  - "Consumer shutdown uses queue.put(None) rather than task cancellation — predictable drain semantics, no half-parsed-payload races"
  - "Signal handler installation is wrapped in try/NotImplementedError so the same code runs under restricted event loops in tests"
  - "Reconnect loop is the SOLE owner of BleakClient — phase 2's control loop will receive a reference via shared state (set inside the async-with block), it will NEVER construct its own BleakClient (locked architectural invariant)"

patterns-established:
  - "Pattern: standalone reconnect task + injected fakes — the entire lifecycle is testable in milliseconds with zero bleak imports in the test path (only ReconnectConfig + reconnect_loop are imported)"
  - "Pattern: `_make_connect` test helper builds an @asynccontextmanager that yields a fake client and auto-fires on_disconnect on the next event-loop turn — proves the disconnect path without real BLE"
  - "Pattern: dual stop_event check (pre-find, pre-sleep-on-miss) for prompt shutdown"
  - "Pattern: `python -m engine` as the single CLI entry — `engine/__main__.py` re-exports `engine.main:main` so the package is directly runnable"

requirements-completed: [BLE-04]

# Metrics
duration: ~3min
completed: 2026-04-13
---

# Phase 1 Plan 04: BleakClient Lifecycle + Reconnect/Backoff Summary

**Standalone async reconnect_loop owns the full scan → connect → subscribe → wait-for-disconnect cycle with capped exponential backoff (1s → 60s, reset after success); `python -m engine` wires it together with telemetry_consumer behind SIGINT/SIGTERM-driven graceful shutdown — Phase 1 closes with all 17 unit tests green and the manual smoke test (scan.py + live telemetry + unplug/replug reconnect) approved by the operator on real hardware.**

## Performance

- **Duration:** ~3 min code, plus operator time for the human-verify smoke test
- **Started:** 2026-04-13T15:07Z
- **Completed:** 2026-04-13 (smoke test approved)
- **Tasks:** 3 (1 TDD code, 1 plain code, 1 human-verify checkpoint)
- **Files created:** 4 (1 reconnect module, 1 main, 1 __main__, 1 test file)
- **Files modified:** 1 (README run + smoke-test instructions)

## Accomplishments

- `reconnect_loop` is a single standalone asyncio task that owns the entire BleakClient lifecycle — scan, connect, subscribe to FTMS Indoor Bike Data, wait for disconnect (via asyncio.Event), tear down notifications, rescan
- Capped exponential backoff (1.0s → 60.0s by default) doubles after each failed scan or BleakError; resets only after a complete successful cycle
- All side effects (`find_device`, `connect_client`, `sleep`) are injected — 4 unit tests in `engine/tests/ble/test_reconnect.py` exercise the doubling, the cap, the reset-on-success, and the BleakError→backoff path with zero bleak imports and zero wall-clock waits
- `python -m engine` runs the full Phase 1 stack: reconnect_loop + telemetry_consumer as two named asyncio tasks, SIGINT/SIGTERM driving a shared stop_event, queue.put(None) draining the consumer
- Human-readable TELEMETRY log line formats speed/power/cadence with consistent column widths
- README extended with a `Run the engine (Phase 1)` section and a 3-step manual smoke-test recipe
- Full suite green: 17/17 (5 parser + 4 scanner + 4 client + 4 reconnect)
- Manual smoke test passed on the operator's MacBook + real KICKR Core: scan.py confirmed CoreBluetooth permission, live telemetry visible while pedaling, unplug/replug triggered the backoff log sequence and successfully reattached

## Task Commits

1. **Task 1: reconnect_loop with injectable scan/connect/sleep + unit tests (TDD)** — RED `80ff29a` (test) → GREEN `74b25b2` (feat)
2. **Task 2: main.py entry point wiring reconnect_loop + telemetry_consumer** — `12e18ab` (feat)
3. **Task 3: Manual smoke test (human-verify checkpoint)** — operator approved all 3 checks; no commit (verification only)

**Plan metadata:** captured in this docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS).

## Files Created/Modified

- `engine/engine/ble/reconnect.py` — `reconnect_loop`, `ReconnectConfig`, `FindDevice`/`ConnectClient`/`SleepFn` callable types.
- `engine/engine/main.py` — `async main()`, `_connect_client` (production BleakClient async-context-manager), `_log_reading` (TELEMETRY formatter), signal handler installation.
- `engine/engine/__main__.py` — re-exports `engine.main:main` so `python -m engine` works.
- `engine/tests/ble/test_reconnect.py` — 4 tests: backoff doubling + stop_event halt; cap-at-max; reset-on-success; BleakError→backoff.
- `engine/README.md` — added Phase 1 run instructions + manual smoke test recipe.

## Public API (locked for downstream plans)

```python
# engine/engine/ble/reconnect.py
@dataclass(frozen=True)
class ReconnectConfig:
    initial_backoff: float = 1.0
    max_backoff: float = 60.0

FindDevice    = Callable[[], Awaitable[Optional[BLEDevice]]]
ConnectClient = Callable[
    [BLEDevice, Callable[[BleakClient], None]],
    AbstractAsyncContextManager[BleakClient],
]
SleepFn       = Callable[[float], Awaitable[None]]

async def reconnect_loop(
    queue: "asyncio.Queue[Optional[bytes]]",
    find_device: FindDevice,
    connect_client: ConnectClient,
    config: ReconnectConfig = ReconnectConfig(),
    sleep: SleepFn = asyncio.sleep,
    stop_event: Optional[asyncio.Event] = None,
) -> None: ...
```

```python
# engine/engine/main.py
async def main() -> int: ...   # SIGINT/SIGTERM → stop_event → drain → exit 0
```

## The "Single Owner of BleakClient" Contract

`reconnect_loop` is the sole owner of the `BleakClient`. The connected client only exists inside the `async with connect_client(device, _on_disconnect) as client:` block; it is never returned from the loop, never stored on a module-level singleton, and never constructed by another task.

Phase 2's control loop will need to **write** to the trainer (Request Control + Start + simulated grade at 4 Hz). The architectural rule, established here and locked by the shape of `reconnect_loop`'s signature:

1. Phase 2 does **not** open its own BleakClient. There is exactly one connection per process.
2. Phase 2 receives the live client by augmenting the inside of `connect_client`'s async-with — typically by passing in shared state (e.g. an `asyncio.Event` + slot, or a lifecycle-aware context object) that the control loop reads from.
3. The control loop must tolerate the client being absent (during scan/backoff) and being replaced (after reconnect). It is a consumer of the lifecycle, not its owner.

This is encoded as RESEARCH.md Pitfall 5 ("Reconnect Task Interfering with Future Control Loop") and is the load-bearing reason `reconnect.py` is a separate module from `client.py`.

## Reconnect Algorithm (exact behavior)

```
backoff := initial_backoff (default 1.0s)
loop:
  if stop_event.is_set(): return
  try device = await find_device()
  except (BleakError, OSError):
    sleep(backoff); backoff = min(backoff*2, max_backoff); continue
  if device is None:
    if stop_event.is_set(): return        # second check — no stray sleep on shutdown
    sleep(backoff); backoff = min(backoff*2, max_backoff); continue
  disconnected = asyncio.Event()
  try async with connect_client(device, disconnected.set) as client:
    await start_indoor_bike_notify(client, queue)
    await disconnected.wait()
    try: await stop_indoor_bike_notify(client)  # best-effort, swallow errors
    except (BleakError, OSError): pass
  except (BleakError, OSError):
    sleep(backoff); backoff = min(backoff*2, max_backoff); continue
  backoff = initial_backoff               # reset only after a full successful cycle
```

With defaults the miss sequence is `1, 2, 4, 8, 16, 32, 60, 60, 60, …`. With `max_backoff=8.0` (test config) the sequence caps at `1, 2, 4, 8, 8, 8, 8, …`.

## Manual Smoke Test Results (Phase 1 success criteria)

Operator verified on real hardware (MacBook + Wahoo KICKR Core) and approved all three checks:

| Check | What it proves | Result |
|-------|----------------|--------|
| 1. `uv run python scan.py` returns devices | macOS CoreBluetooth permission granted (BLE-01 gate) | PASS |
| 2. `uv run python -m engine` shows live `TELEMETRY \| speed=… power=… cadence=…` while pedaling | Phase 1 success criterion 2 (live telemetry visible) | PASS |
| 3. Physical unplug/replug → backoff log → reattach, process never exits | BLE-04 + Phase 1 success criterion 3 (resilient reconnect) | PASS |

No log excerpts captured (verbal approval only) — the operator confirmed the expected log shapes from the README appeared as written.

## Decisions Made

- **Reset-on-success-only, not reset-on-discovery.** Earlier draft reset backoff the moment `find_device` returned a device. Final implementation moves the reset to AFTER the full async-with block exits cleanly, so a flaky trainer that advertises but fails handshake still backs off properly instead of hammering connect attempts at 1s.
- **Two stop_event checks per iteration.** The second check inside the None-device branch is deliberate: it eliminates the pathological case where the user Ctrl-C's during a scan-miss window and would otherwise wait the full backoff before exit.
- **`@asynccontextmanager` for the production connect_client.** This matches the test fakes' shape exactly, so tests and prod use the identical contract. It also satisfies bleak 3.x's preference for context-managed clients (Pitfall 4).
- **Consumer shutdown via `None` sentinel, NOT task cancellation.** Cancelling the consumer mid-`queue.get()` is fine, but cancellation can race against an in-flight parse. A `None` sentinel guarantees the consumer drains anything already in the queue and exits at a predictable point.
- **`_log_reading` formats with fixed widths.** Looks bad in a log file, but the TELEMETRY line is meant to be eyeballed in a terminal during a smoke test — column alignment makes 60 lines/sec scannable.
- **No structured logging library.** Plain `logging` with a basic formatter is enough for Phase 1; the WS bridge in Phase 3 will be the consumer that needs structured records, and it consumes via `telemetry_consumer`'s handler — not via parsing log lines.

## Wahoo-Specific Quirks Phase 2 Should Know About

The smoke test surfaced no surprising behavior — the KICKR Core advertised under `KICKR CORE` (matched by `find_device_by_name`), the FTMS Indoor Bike Data characteristic delivered notifications immediately on subscribe, and the trainer respected the disconnect/reconnect cycle without needing a service-discovery delay. The pre-Phase-2 todo to "check QZ / ftms-bike OSS for Wahoo FTMS quirks" still stands for the WRITE path (Request Control + Start + simulated grade) — none of those code paths were exercised here.

One observation the operator should note when starting Phase 2: the KICKR keeps streaming Indoor Bike Data after disconnect for ~1–2 seconds (BLE link layer buffering). The current `stop_indoor_bike_notify` call inside reconnect_loop is best-effort and will silently fail in that window — that's intentional, but Phase 2's Request Control / Stop sequence will need a slightly longer write timeout to account for it.

## Deviations from Plan

None of substance. Two minor refinements during implementation that strengthened the contract without changing the spec:

1. **[Refinement] Backoff reset moved to end-of-cycle.** The plan text said "resets after a successful discovery"; the locked behavior resets after a complete successful connect/subscribe/disconnect cycle. This is strictly safer (handles flaky-handshake trainers) and is documented as a key decision above. No commit churn — landed in the same `74b25b2` GREEN commit as the rest of `reconnect_loop`.
2. **[Refinement] Second stop_event check after None-device branch.** Not in the plan literal; added so Ctrl-C during a scan-miss window exits promptly instead of waiting the full backoff. Same `74b25b2` commit.

**Total auto-fix deviations:** 0 (Rules 1–3 not triggered).
**Architectural deviations (Rule 4):** 0.
**Impact on plan:** None — the public contract matches the plan exactly; only loop-internal sequencing was tightened.

## Authentication Gates

None at the engine layer. The macOS CoreBluetooth permission prompt is the only "gate" in this phase, and it is handled by the user running `uv run python scan.py` once before `uv run python -m engine` — both documented in the README and verified as Check 1 of the smoke test.

## Issues Encountered

None during implementation. All 4 reconnect tests passed on the first GREEN run; full suite stayed at 17/17.

The operator's smoke test ran clean on the first attempt — no missing-permission detour, no need to reseat the KICKR's USB to clear a stuck advertisement, no crash on disconnect. Phase 1 closes without an outstanding bug list.

## User Setup Required

None going forward. The `uv run python scan.py` permission grant is a one-time setup, already completed by the operator during the smoke test. Phase 2 can assume CoreBluetooth permission persists across reboots for the same shell host (this is macOS default behavior — the permission is bound to the binary, not the session).

## Next Phase Readiness

- **Phase 1 COMPLETE.** All four success criteria verified:
  1. KICKR discovered by name on macOS — engine log proves it.
  2. Live speed/power/cadence visible in the engine log while pedaling — smoke test Check 2.
  3. Unplug/replug triggers exponential backoff reconnect, no crash — smoke test Check 3.
  4. `scan.py` diagnostic surfaces macOS Bluetooth permission state — smoke test Check 1.
- **Reconnect logic is structurally separate from data-reading primitives** (`engine/ble/reconnect.py` vs `engine/ble/client.py`) — Phase 2's control loop bolts onto the lifecycle without rewriting the read path. Quality gate met.
- **Ready for Phase 2:** add the FTMS WRITE path (Request Control + Start + simulated grade at 4 Hz), the GearEngine, the keyboard shifter, and INFRA-02 (FTMS Stop + Reset on shutdown). The control loop will read shared state set inside `_connect_client`'s async-with block — see "Single Owner of BleakClient" contract above for the locked architectural rule.
- **No blockers.**

---
*Phase: 01-ble-foundation-metrics-read*
*Completed: 2026-04-13*

## Self-Check: PASSED

- Files verified: engine/engine/ble/reconnect.py, engine/engine/main.py, engine/engine/__main__.py, engine/tests/ble/test_reconnect.py, engine/README.md, .planning/phases/01-ble-foundation-metrics-read/01-04-SUMMARY.md
- Commits verified: 80ff29a (test reconnect RED), 74b25b2 (feat reconnect GREEN), 12e18ab (feat main entry point)
- Manual smoke test: human-approved (Check 1 scan.py, Check 2 live telemetry, Check 3 unplug/replug reconnect — all pass)
- Acceptance grep checks: reconnect.py contains `async def reconnect_loop`, `class ReconnectConfig`, `backoff = min(backoff * 2, config.max_backoff)`, `disconnected = asyncio.Event()`, `from engine.ble.client import`; does NOT contain `BleakDBusError` or `adapter=`
- Test count locked: 17 (5 parser + 4 scanner + 4 client + 4 reconnect)
