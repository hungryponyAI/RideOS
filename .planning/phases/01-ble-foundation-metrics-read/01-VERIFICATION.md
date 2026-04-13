---
phase: 01-ble-foundation-metrics-read
verified: 2026-04-13T00:00:00Z
status: human_needed
score: 11/11 automated must-haves verified
human_verification:
  - test: "Run `cd engine && uv run python scan.py` in a terminal with Bluetooth enabled"
    expected: "Non-empty device list printed, or explicit macOS permission hint if BT access not granted. Exit code 0 (devices found) or 1 (empty — permission needed). Must NOT raise an uncaught exception."
    why_human: "macOS CoreBluetooth permission state cannot be queried programmatically. The diagnostic output only has meaning when run against real hardware in the target shell."
  - test: "Run `cd engine && uv run python -m engine` with the KICKR Core powered on and pedaling"
    expected: "Log lines appear within ~15s: 'Connecting to KICKR CORE', then repeated 'TELEMETRY | speed=X.X km/h  power=XXX W  cadence=XX.X rpm' lines while pedaling. Speed, power, and cadence must all change with effort."
    why_human: "Live FTMS Indoor Bike Data notifications require real BLE hardware. No emulation is possible in the unit test environment."
  - test: "While `python -m engine` is running from the step above, physically unplug the KICKR's power/USB and then replug it"
    expected: "Within 5s of unplug: log lines 'Disconnected; attempting to stop notifications cleanly' and 'KICKR not found; retrying in 1.0s', '...retrying in 2.0s', etc. Within ~30s of replug: 'Connecting to KICKR CORE' and resumed TELEMETRY lines. The Python process must NOT exit during the outage."
    why_human: "Physical disconnect/reconnect cycle and the resulting asyncio.Event sequence cannot be emulated without real hardware."
---

# Phase 1: BLE Foundation & Metrics Read — Verification Report

**Phase Goal:** Python engine establishes a stable, resilient BLE link to the KICKR Core and parses live Indoor Bike Data into a usable telemetry stream.
**Verified:** 2026-04-13
**Status:** human_needed — all automated checks pass; 3 hardware-dependent items require operator confirmation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | uv project installs bleak 3.x and pytest-asyncio without error | VERIFIED | `engine/pyproject.toml` pins `bleak>=3.0.1,<4.0`; `.venv/` exists; `uv run python -m pytest tests/ -q` exits 0 |
| 2 | `python -m pytest tests/ -q` executes and reports all tests passing | VERIFIED | Test suite runs cleanly: `17 passed in 0.03s` — 5 parser + 4 scanner + 4 client + 4 reconnect |
| 3 | FTMS Indoor Bike Data byte fixtures cover all encoding corner cases | VERIFIED | `conftest.py` contains all 5 fixtures: `ibd_speed_only`, `ibd_speed_cadence_power`, `ibd_no_speed`, `ibd_power_negative`, `ibd_cadence_only_scaling` with documented flag bits |
| 4 | `parse_indoor_bike_data` correctly handles inverted speed flag, cadence /2, signed int16 power | VERIFIED | `engine/engine/ftms/parsers.py` exists with `_FLAG_MORE_DATA_SPEED_ABSENT`, `/2.0` cadence, `"<h"` signed power; 5 parser tests pass |
| 5 | `find_kickr` tries device name first, falls back to FTMS UUID filter | VERIFIED | `scanner.py` calls `find_device_by_name` then `find_device_by_filter`; 4 scanner unit tests pass covering all branches |
| 6 | BLE notification callback never awaits; raw bytes delivered via `queue.put_nowait` | VERIFIED | `client.py` `_on_notify` is `def` (not `async def`), single statement `queue.put_nowait(bytes(data))`; grep confirms no `async def _on_notify` anywhere |
| 7 | `telemetry_consumer` parses bytes, dispatches sync/async handlers, exits cleanly on `None` sentinel | VERIFIED | `client.py` implements all paths via `inspect.isawaitable`; 4 client unit tests pass |
| 8 | `reconnect_loop` implements capped exponential backoff with reset-on-success | VERIFIED | `reconnect.py` contains `backoff = min(backoff * 2, config.max_backoff)` and `backoff = config.initial_backoff` on success; 4 reconnect tests prove backoff doubling, cap-at-max, reset, and BleakError→backoff |
| 9 | `reconnect_loop` uses `asyncio.Event` for disconnect signalling (no polling) | VERIFIED | `disconnected = asyncio.Event()` and `await disconnected.wait()` in `reconnect.py` |
| 10 | `python -m engine` wires reconnect_loop + telemetry_consumer as concurrent asyncio tasks | VERIFIED | `main.py` creates both tasks via `asyncio.create_task`, awaits `asyncio.gather`; `engine/__main__.py` present for `python -m engine` invocation |
| 11 | `scan.py` standalone diagnostic prints device list or explicit macOS permission hint | VERIFIED | `scan.py` parses cleanly; contains `_print_permission_hint()` with `Privacy & Security > Bluetooth` text and explicit exit codes 0/1/2 |

**Score:** 11/11 automated truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/pyproject.toml` | uv project with bleak>=3.0.1, pytest, pytest-asyncio, `[tool.pytest.ini_options]` | VERIFIED | Contains all required declarations; `testpaths = ["tests"]`, `asyncio_mode = "auto"` |
| `engine/.python-version` | Pins Python 3.12 | VERIFIED | Contains `3.12` |
| `engine/.venv/` | Materialised lockfile and virtualenv | VERIFIED | Directory exists with `bin/`, `lib/` |
| `engine/scan.py` | Standalone BLE diagnostic using `BleakScanner` | VERIFIED | Contains `BleakScanner`, `FTMS_SERVICE_UUID`, `async def main`, permission hint, `if __name__ == "__main__"` |
| `engine/engine/__init__.py` | Package marker | VERIFIED | Exists (empty) |
| `engine/engine/ftms/__init__.py` | Package marker | VERIFIED | Exists (empty) |
| `engine/engine/ftms/parsers.py` | `parse_indoor_bike_data` + `IndoorBikeData` dataclass | VERIFIED | Substantive: frozen dataclass, named flag masks, correct struct formats, offset tracking for all 7 flag bits in scope |
| `engine/engine/ble/__init__.py` | Package marker | VERIFIED | Exists (empty) |
| `engine/engine/ble/scanner.py` | `find_kickr` with name-first + FTMS UUID fallback | VERIFIED | Substantive: `KICKR_NAME`, `FTMS_SERVICE_UUID`, `find_device_by_filter`, `_advertises_ftms` predicate; no `adapter=` or `scanning_mode="passive"` in live code |
| `engine/engine/ble/client.py` | Notification wiring + telemetry consumer | VERIFIED | Substantive: `start_indoor_bike_notify`, `stop_indoor_bike_notify`, `telemetry_consumer`, `INDOOR_BIKE_DATA_UUID`, `put_nowait`, sync callback, `inspect.isawaitable` dispatch |
| `engine/engine/ble/reconnect.py` | `reconnect_loop` + `ReconnectConfig` | VERIFIED | Substantive: exponential backoff with cap, `asyncio.Event` for disconnect, injectable `find_device`/`connect_client`/`sleep`, catches only `BleakError`/`OSError`, no `BleakDBusError` |
| `engine/engine/main.py` | Entry point wiring reconnect + consumer | VERIFIED | Substantive: `asyncio.create_task` for both, `asyncio.gather`, SIGINT/SIGTERM signal handlers, `async with BleakClient(device, disconnected_callback=on_disconnect)` |
| `engine/engine/__main__.py` | `python -m engine` bootstrap | VERIFIED | Contains `from engine.main import main` and `asyncio.run(main())` |
| `engine/tests/conftest.py` | 5 IBD byte fixtures with documented flags | VERIFIED | All 5 fixtures present with inline struct documentation |
| `engine/tests/ftms/test_parsers.py` | 5 passing parser tests (no xfail) | VERIFIED | No `xfail` markers; direct module-scope import from `engine.ftms.parsers`; all 5 tests pass |
| `engine/tests/ble/test_scanner.py` | 4 scanner unit tests (hardware-free) | VERIFIED | 4 async tests with `_StubScanner` double; all pass |
| `engine/tests/ble/test_client.py` | 4 client unit tests (queue doubles) | VERIFIED | 4 async tests covering sync handler, async handler, bad payload, None sentinel; all pass |
| `engine/tests/ble/test_reconnect.py` | 4 reconnect unit tests (injected fakes, no wall-clock) | VERIFIED | 4 async tests covering backoff doubling, cap, reset-on-success, BleakError path; all pass |
| `engine/README.md` | Run instructions including `## Run the engine (Phase 1)` | VERIFIED | Contains setup, scan.py, pytest, and engine run sections with manual smoke test recipe |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/pyproject.toml` | `engine/tests/` | `testpaths = ["tests"]` | WIRED | `testpaths = ["tests"]` present; pytest resolves tests directory correctly |
| `engine/tests/conftest.py` | `engine/tests/ftms/test_parsers.py` | pytest fixture injection | WIRED | Fixtures `ibd_speed_only`, `ibd_speed_cadence_power`, etc. consumed by all 5 parser tests via pytest parameter names |
| `engine/engine/ftms/parsers.py` | `engine/tests/ftms/test_parsers.py` | `from engine.ftms.parsers import parse_indoor_bike_data` | WIRED | Import at module scope; all 5 tests invoke parser directly |
| `engine/engine/ble/client.py` | `engine/engine/ftms/parsers.py` | `from engine.ftms.parsers import IndoorBikeData, parse_indoor_bike_data` | WIRED | Import line present; `parse_indoor_bike_data(payload)` called inside `telemetry_consumer` |
| `engine/engine/ble/client.py` | `BleakClient.start_notify` | `client.start_notify(INDOOR_BIKE_DATA_UUID, callback)` where callback calls `queue.put_nowait` | WIRED | `await client.start_notify(INDOOR_BIKE_DATA_UUID, _on_notify)` present; `_on_notify` body is solely `queue.put_nowait(bytes(data))` |
| `engine/engine/ble/reconnect.py` | `engine/engine/ble/client.py` | `from engine.ble.client import start_indoor_bike_notify, stop_indoor_bike_notify` | WIRED | Import present; both functions called inside the `async with connect_client(...)` block |
| `engine/engine/ble/reconnect.py` | `BleakClient.disconnected_callback` | `asyncio.Event` set from disconnect callback, awaited by loop body | WIRED | `disconnected = asyncio.Event()`, `_on_disconnect` sets it, `await disconnected.wait()` in loop body |
| `engine/engine/main.py` | `engine/engine/ble/reconnect.py` | `asyncio.gather(reconnect_task, consumer_task, ...)` | WIRED | `asyncio.create_task(reconnect_loop(...))` and `asyncio.create_task(telemetry_consumer(...))` both created; `asyncio.gather` awaits them on shutdown |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| BLE-01 | 01-01, 01-03 | User can connect to KICKR Core by device name or service UUID scan on macOS | SATISFIED (automated) / NEEDS HUMAN (live hardware) | `find_kickr` in `scanner.py` implements name-first + FTMS UUID fallback; unit tests prove both branches. Live hardware verification confirmed by operator in 01-04 smoke test (documented in 01-04-SUMMARY.md). |
| BLE-02 | 01-01, 01-02, 01-03 | App reads speed, power (watts), and cadence from FTMS Indoor Bike Data in real time | SATISFIED (automated) / NEEDS HUMAN (live readings) | Parser correctly handles all three fields and all three encoding rules; pipeline from BLE callback → queue → parser → `IndoorBikeData` is fully wired. Live TELEMETRY log verified by operator in 01-04 smoke test. |
| BLE-04 | 01-04 | App auto-reconnects to KICKR after BLE drop using exponential backoff without crashing | SATISFIED (automated) / NEEDS HUMAN (physical unplug/replug) | `reconnect_loop` implements full backoff algorithm; 4 unit tests verify doubling, cap, reset, and error handling. Physical disconnect/reconnect verified by operator in 01-04 smoke test. |

**Orphaned requirements check:** REQUIREMENTS.md maps BLE-01, BLE-02, BLE-04 to Phase 1. All three appear in plan frontmatter. No orphaned requirements.

**Out-of-scope requirements verified absent:** BLE-03 (FTMS write path) is correctly not present in any Phase 1 file.

---

### Anti-Patterns Found

| File | Pattern | Severity | Verdict |
|------|---------|----------|---------|
| `engine/engine/ble/scanner.py` lines 9-10 | `adapter=` and `scanning_mode="passive"` appear in doc comments | Info | Not a code anti-pattern — these are "Never do this" notes in the module docstring. No actual code uses either. |

No blockers or warnings found.

---

### Human Verification Required

The three items below need operator confirmation against real hardware. All automated checks pass. The 01-04-SUMMARY.md documents that the operator ran and approved all three during the smoke test — this section records what still needs re-confirmation in any new environment.

#### 1. macOS Bluetooth Permission Diagnostic

**Test:** `cd engine && uv run python scan.py`
**Expected:** Device list printed (exit 0) or explicit permission hint (exit 1). No uncaught exception (exit 2 would be a BleakError indicating a real BLE stack problem).
**Why human:** CoreBluetooth permission is per-binary per-shell; cannot be queried programmatically.

#### 2. Live Telemetry while Pedaling

**Test:** `cd engine && uv run python -m engine` with KICKR Core powered on; pedal for 30s
**Expected:** Within ~15s, log shows `Connecting to KICKR CORE` then repeated `TELEMETRY | speed=X.X km/h  power=XXX W  cadence=XX.X rpm` lines. All three metrics change as effort changes (none stuck at zero).
**Why human:** Live FTMS characteristic notifications require real BLE hardware and a moving trainer.

#### 3. Unplug/Replug Reconnect

**Test:** While `python -m engine` is running and telemetry is streaming, physically power-cycle the KICKR. Observe logs. Replug. Confirm reattach.
**Expected:** Disconnect log within 5s; `retrying in 1.0s`, `retrying in 2.0s` (doubling) visible; after replug, `Connecting to KICKR CORE` and resumed TELEMETRY within ~30s. Python process stays alive throughout.
**Why human:** Physical BLE disconnect event and asyncio.Event propagation requires the real CoreBluetooth stack.

---

### Gaps Summary

No gaps. All automated checks passed:
- 17/17 tests pass with zero failures, skips, or xfail markers
- All 19 artifact files exist and contain substantive, non-stub implementations
- All 8 key links verified as wired (imports present, functions called, data flows end-to-end)
- No anti-patterns that block the phase goal
- All three requirement IDs (BLE-01, BLE-02, BLE-04) are satisfied at the automated layer

The only open items are the three hardware-dependent smoke test checks documented in the human verification section above. Per 01-04-SUMMARY.md, all three were already approved by the operator during the Phase 1 close. Future environment changes (new machine, different shell, different Bluetooth state) would require re-running those checks.

---

_Verified: 2026-04-13_
_Verifier: Claude (gsd-verifier)_
