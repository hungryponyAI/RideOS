---
phase: 01-ble-foundation-metrics-read
plan: 03
subsystem: ble
tags: [ble, bleak, ftms, scanner, notify, asyncio, queue, tdd]

# Dependency graph
requires:
  - phase: 01-ble-foundation-metrics-read
    plan: 02
    provides: IndoorBikeData dataclass + parse_indoor_bike_data (the bytes->reading contract)
provides:
  - engine.ble.scanner.find_kickr (name-first, FTMS UUID fallback) + KICKR_NAME + FTMS_SERVICE_UUID
  - engine.ble.client.start_indoor_bike_notify (sync callback, put_nowait into queue)
  - engine.ble.client.stop_indoor_bike_notify
  - engine.ble.client.telemetry_consumer (queue drain + parse + sync/async on_reading dispatch)
  - engine.ble.client.INDOOR_BIKE_DATA_UUID
  - Locked "no await in BLE notification callback" invariant + tests that fail if violated
affects:
  - 01-04 reconnect loop (wraps these primitives with lifecycle/reconnect state machine)
  - phase 02 control-loop (reuses start_indoor_bike_notify + telemetry_consumer as read-side)
  - phase 03 websocket-bridge (telemetry_consumer on_reading handler forwards IndoorBikeData to WS clients)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BLE notification callback pushes raw bytes via queue.put_nowait — NEVER awaits"
    - "telemetry_consumer drains queue.get, parses, dispatches sync or async handler via inspect.isawaitable"
    - "None sentinel on the queue = clean shutdown signal"
    - "Malformed payloads log-and-skip; a bad packet never kills the consumer"
    - "Scanner injects scanner_cls for unit-test doubles; production callers omit it"

key-files:
  created:
    - "engine/engine/ble/__init__.py (package marker)"
    - "engine/engine/ble/scanner.py (find_kickr + KICKR_NAME + FTMS_SERVICE_UUID + _advertises_ftms)"
    - "engine/engine/ble/client.py (start/stop_indoor_bike_notify + telemetry_consumer + INDOOR_BIKE_DATA_UUID)"
    - "engine/tests/ble/__init__.py (package marker)"
    - "engine/tests/ble/test_scanner.py (4 unit tests, no hardware)"
    - "engine/tests/ble/test_client.py (4 unit tests, queue doubles, no hardware)"
  modified: []

key-decisions:
  - "Scanner fallback uses find_device_by_filter with FTMS_SERVICE_UUID (not MAC address — CoreBluetooth exposes UUIDs, not MACs)"
  - "Callback is a plain `def`, not `async def` — awaiting inside deadlocks CoreBluetooth event loop on macOS"
  - "queue.put_nowait (not queue.put) keeps the callback strictly non-blocking"
  - "telemetry_consumer accepts both sync and async handlers via inspect.isawaitable — lets WS bridge plug in as async without wrapping"
  - "Parser errors are caught + logged + skipped, not raised — a single malformed packet must not terminate the read loop"
  - "scanner_cls parameter is a test seam, not production config (no DI framework)"

patterns-established:
  - "Pattern: sync BLE callback + asyncio.Queue + separate consumer coroutine — load-bearing for macOS CoreBluetooth stability"
  - "Pattern: StubScanner classmethod doubles — lets async scanner tests run without bleak or hardware"
  - "Pattern: None sentinel for async consumer shutdown — composable with any asyncio.Queue producer"

requirements-completed: [BLE-01, BLE-02]

# Metrics
duration: 2min
completed: 2026-04-13
---

# Phase 1 Plan 03: BLE Discovery + Notification Read Pipeline Summary

**Pure BLE read-path: find_kickr (name-first, FTMS UUID fallback) + sync-callback/asyncio.Queue notification subscription + telemetry consumer that parses payloads and invokes a sync/async handler — fully unit-tested without hardware.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-13T13:00:54Z
- **Completed:** 2026-04-13T13:02:56Z
- **Tasks:** 2 (both TDD)
- **Files created:** 6 (3 source, 3 test)

## Accomplishments
- `find_kickr` implements the name-first / FTMS-UUID-fallback discovery strategy from RESEARCH.md, with a `scanner_cls` test seam that keeps bleak out of unit tests
- BLE notification pipeline enforces the "no await in callback" invariant by construction — the callback body is literally one statement (`queue.put_nowait(bytes(data))`) and a test explicitly proves the callback is a plain `def`
- `telemetry_consumer` is transport-agnostic: it reads `bytes | None` from an `asyncio.Queue`, parses via `parse_indoor_bike_data`, and dispatches to either a sync or async handler via `inspect.isawaitable`
- Full suite green: 13/13 passed (5 parser + 4 scanner + 4 client)
- Zero hardware dependencies in either test file — both the scanner and the consumer are exercised with Python-only doubles

## Task Commits

Each task followed TDD (test-first, then implementation):

1. **Task 1: find_kickr scanner** — RED `323e893` (test) → GREEN `0eb7298` (feat)
2. **Task 2: Notify subscription + telemetry consumer** — RED `a1d58f1` (test) → GREEN `241a264` (feat)

**Plan metadata:** pending (docs commit captures SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `engine/engine/ble/__init__.py` — Package marker (empty).
- `engine/engine/ble/scanner.py` — `find_kickr`, `KICKR_NAME`, `FTMS_SERVICE_UUID`, `_advertises_ftms` predicate.
- `engine/engine/ble/client.py` — `start_indoor_bike_notify`, `stop_indoor_bike_notify`, `telemetry_consumer`, `INDOOR_BIKE_DATA_UUID`, `ReadingHandler` type alias.
- `engine/tests/ble/__init__.py` — Package marker.
- `engine/tests/ble/test_scanner.py` — 4 tests: name-match short-circuits fallback; fallback reached when name returns None; None when both strategies miss; `_advertises_ftms` predicate covers with-ftms / without-ftms / `None` service_uuids.
- `engine/tests/ble/test_client.py` — 4 tests: sync handler; async handler (via `inspect.isawaitable` path); log-and-continue on truncated payload; clean exit on `None` sentinel.

## Public API (locked for downstream plans)

```python
# engine/engine/ble/scanner.py
KICKR_NAME: str = "KICKR CORE"
FTMS_SERVICE_UUID: str = "00001826-0000-1000-8000-00805f9b34fb"

async def find_kickr(
    scanner_cls: type[BleakScanner] = BleakScanner,
    timeout: float = 10.0,
) -> Optional[BLEDevice]: ...
```

```python
# engine/engine/ble/client.py
INDOOR_BIKE_DATA_UUID: str = "00002ad2-0000-1000-8000-00805f9b34fb"

ReadingHandler = Callable[[IndoorBikeData], Union[Awaitable[None], None]]

async def start_indoor_bike_notify(
    client: BleakClient,
    queue: asyncio.Queue[Optional[bytes]],
) -> None: ...

async def stop_indoor_bike_notify(client: BleakClient) -> None: ...

async def telemetry_consumer(
    queue: asyncio.Queue[Optional[bytes]],
    on_reading: ReadingHandler,
) -> None: ...
```

## The "No Await in Callback" Contract

BLE notification callbacks fire from the asyncio event loop thread. On macOS, `CoreBluetooth` dispatches the callback **from inside** the event loop's own turn — if the callback itself awaits, the event loop can deadlock waiting for the awaited future while holding the callback slot. RESEARCH.md's Pattern 1 + Pitfall 3 document this as the single most-likely way to brick the whole engine on a real KICKR.

The discipline encoded here:

1. **Callback body is one statement:** `queue.put_nowait(bytes(data))`.
2. **`put_nowait` (not `put`)** — `put` is a coroutine on a bounded queue; `put_nowait` is synchronous and raises `QueueFull` instead of blocking. Our queue is unbounded so it never raises in practice.
3. **All parsing, dispatch, and I/O happens in `telemetry_consumer`** — a separate coroutine scheduled by the caller.
4. **Tests lock this in structurally:** the acceptance criteria grep for `async def _on_notify` and must find 0. Any future "refactor" that makes the callback async will fail CI at the acceptance step.

## How Plan 04 Will Build On This

Plan 04 owns the `BleakClient` **lifecycle** — connect / disconnect / reconnect / backoff. It will:

- Call `find_kickr()` to locate the device.
- Open a `BleakClient` and manage its connected/disconnected state machine.
- Call `start_indoor_bike_notify(client, queue)` after connect; `stop_indoor_bike_notify(client)` before disconnect.
- Spawn `telemetry_consumer(queue, handler)` as a sibling task; pump `None` into the queue when tearing down the consumer intentionally.
- Observe `BleakClient.is_connected` / disconnect callbacks to trigger reconnect, without touching anything in this plan's modules.

This plan's modules are **stateless and lifecycle-agnostic** by design — the reconnect logic is structurally separate from the read path, per the phase 1 quality gate.

## Decisions Made
- **`scanner_cls` as a test seam** — Rather than monkeypatching `bleak.BleakScanner`, the parameter lets tests inject a doubled class with classmethod stubs. Production callers omit the kwarg and get real `BleakScanner`.
- **Predicate tolerates `None` service_uuids** — `(adv.service_uuids or [])` means an ad with no service UUIDs returns False (not TypeError). Covered by an explicit test case.
- **Queue type `Optional[bytes]`** — the `None` sentinel is a first-class value, not an exception. This keeps shutdown composable with any producer pattern plan 04 settles on.
- **`inspect.isawaitable`, not `asyncio.iscoroutinefunction`** — handles coroutines, futures, and any object supporting `__await__` (e.g., asyncio Tasks). Lets future handlers return tasks without special-casing.
- **Broad `except Exception` in the consumer** — malformed BLE packets are a when-not-if event in the field. A single bad packet must not kill the loop. Traceback goes to the logger.

## Deviations from Plan

None — plan executed exactly as written. TDD cadence produced 4 commits (RED → GREEN per task) instead of 2, which is the expected shape for `tdd="true"` tasks.

**Total deviations:** 0 auto-fixes.
**Impact on plan:** None.

## Authentication Gates

None. Entire plan is unit-testable without hardware.

## Issues Encountered

None. All tests green on first GREEN run per task.

## User Setup Required

None for this plan. Real KICKR verification (running `engine/scan.py` once to grant macOS Bluetooth permission, then exercising `find_kickr` against actual hardware) lands in plan 01-04 which owns the full connect lifecycle.

## Next Phase Readiness
- **Ready for plan 01-04:** wrap `find_kickr` + `start_indoor_bike_notify` + `telemetry_consumer` in a reconnect-aware lifecycle module.
- **The read-path contract is locked** — phase 2 (control loop) and phase 3 (WS bridge) can already import `telemetry_consumer` knowing its signature will not drift.
- **No blockers.**

---
*Phase: 01-ble-foundation-metrics-read*
*Completed: 2026-04-13*

## Self-Check: PASSED

- Files verified: engine/engine/ble/__init__.py, engine/engine/ble/scanner.py, engine/engine/ble/client.py, engine/tests/ble/__init__.py, engine/tests/ble/test_scanner.py, engine/tests/ble/test_client.py, .planning/phases/01-ble-foundation-metrics-read/01-03-SUMMARY.md
- Commits verified: 323e893 (test scanner RED), 0eb7298 (feat scanner GREEN), a1d58f1 (test client RED), 241a264 (feat client GREEN)
- Tests verified: `uv run python -m pytest tests/ -q` → 13 passed (5 parser + 4 scanner + 4 client)
- Acceptance grep checks: no `adapter=` in source code, no `scanning_mode="passive"`, no `async def _on_notify`
