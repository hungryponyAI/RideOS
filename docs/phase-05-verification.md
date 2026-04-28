# Phase 5 — Zwift Click Integration: Hardware Verification

**Verified:** 2026-04-27
**Hardware:** Wahoo KICKR Core + Zwift Click + macOS host
**Engine commit:** 51ab8ca7ea351df0500e91b14b938cf7d0c09894

## Pre-flight

- [ ] `cd engine && uv run pytest tests/ -q` → exit 0 (all unit tests green)
- [ ] `engine/engine/input/click.py` constants match `docs/click-ble-spike.md` "Confirmed values"

## Hardware test results

| # | Test | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Engine boots without Click present | Telemetry flows, keyboard works, warning logged, no crash | | PASS / FAIL / SKIP |
| 2 | Engine connects to Click on startup | "Zwift Click connected" log within 30 s; click_status:true on WS | | PASS / FAIL / SKIP |
| 3 | Plus button shifts up (5 presses) | Gear increments by 1 per press; capped at 10 | | PASS / FAIL / SKIP |
| 4 | Minus button shifts down (5 presses) | Gear decrements by 1 per press; floor at 1 | | PASS / FAIL / SKIP |
| 5 | Debounce on rapid plus burst (5 in 300 ms) | Fewer than 5 shifts (~3 expected); document actual count | | PASS / FAIL / SKIP |
| 6 | Keyboard fallback still works with Click connected | k/j shift gears alongside plus/minus | | PASS / FAIL / SKIP |
| 7 | Click disconnect mid-ride → reconnect | click_status:false, engine stable, reconnects when Click powers back on | | PASS / FAIL / SKIP |
| 8 | Clean shutdown (Ctrl-C) within 15 s, FTMS Stop + Reset issued | KICKR is not stuck at last grade after exit | | PASS / FAIL / SKIP |

## Observations

Free-form notes on anything surprising, latency that felt wrong, BLE drops, etc.

## Sign-off

- [ ] All "fallback" gates green (Tests 1, 6, 8) — phase ships even if Click-specific tests fail.
- [ ] All Click-specific gates green (Tests 2, 3, 4, 5, 7) — full GEAR-03 acceptance.

Signed: <user name>  Date: <YYYY-MM-DD>
