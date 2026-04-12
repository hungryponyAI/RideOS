# Research Summary: RideOS

**Synthesized:** 2026-04-12
**Sources:** STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md
**Overall Confidence:** MEDIUM (no live web verification; architecture HIGH, version pins MEDIUM, Wahoo quirks LOW-MEDIUM)

---

## Executive Summary

RideOS is a personal macOS trainer cockpit whose entire value is virtual gearing — software-defined gear ratios that translate GPX route grade into FTMS resistance via `effective_grade = real_grade / gear_factor`. The recommended implementation is a single Python asyncio process (bleak + websockets) bridged to a React/Vite cockpit via WebSocket, with all BLE traffic owned by the Python engine and a monotonic 4 Hz control loop as the only writer to the trainer. The primary risks are concentrated in Phases 1–2: macOS CoreBluetooth Bluetooth permission silently blocking scans, the mandatory FTMS Request Control handshake being skipped, and BLE notification callbacks inadvertently blocking the event loop — all three have known mitigations.

---

## Key Findings

### Stack

- **bleak ~0.22.x** — only viable Python BLE library for macOS; auto-selects CoreBluetooth backend
- **FTMS must be hand-rolled** — no production library exists; use `pycycling` as reference only
- **websockets ~13.x** — correct WS server for a single localhost endpoint; NOT FastAPI/uvicorn (framework overhead with zero benefit here); share one asyncio event loop with bleak
- **Zustand 4.x** — non-negotiable for 60 Hz React telemetry; naive useState causes full-tree re-renders
- **uplot** — only viable live chart library at 60 fps
- **Tooling:** Python 3.12+, uv, Vite 5/6, TypeScript 5.5+, Tailwind 3.4.x, pnpm

### Features

Table stakes are bounded and sequential:

```
BLE connect → metrics read → resistance write → virtual gearing
→ keyboard shift → cockpit UI → GPX loading → position tracking
```

The Zwift Click is a **research spike** (proprietary undocumented BLE protocol) — must not block the core loop. The keyboard shifter is a permanent fallback, not a temporary stand-in.

**Anti-features (explicit scope boundaries, not deferred):** avatars, cloud sync, multiplayer, ERG mode builder, social, accounts, leaderboards.

### Architecture

Two-process local system — Python engine + browser cockpit — connected by a single WebSocket.

**The key structural invariant:** only `control_loop.py` writes to the trainer. WS commands mutate `GearEngine`/`RouteEngine` state; the next 4 Hz tick picks up changes. This keeps write cadence deterministic and protects the trainer from keyboard floods or route grade noise.

**Reconnect logic** is a separate asyncio task from the control loop — they must never block each other.

### Top 5 Pitfalls

| # | Pitfall | Prevention |
|---|---------|------------|
| 1 | Missing FTMS Request Control + Start + Reset handshake — grade writes silently have zero effect | Run full handshake before any write; re-run after every reconnect |
| 2 | macOS CoreBluetooth silent permission block — scans return empty with no error | Write `scan.py` diagnostic in Phase 1; document per-shell-host permission grant |
| 3 | FTMS write rate > 4 Hz — KICKR firmware throttles, write queue backs up, adapter wedges | Coalesce to 4 Hz with epsilon-change gating |
| 4 | BLE notification callbacks triggering async BLE ops — event loop deadlock mid-ride | Callbacks push only to `asyncio.Queue`; never await inside a callback |
| 5 | FTMS grade unit encoding — grade is int16 in 0.01% units (5.0% = 500); off-by-100 makes all grades feel identical | Unit-test the byte encoder with known values before connecting to trainer |

---

## Suggested Phase Structure (6 phases)

| Phase | Name | Core Deliverable |
|-------|------|-----------------|
| 1 | BLE Foundation + FTMS Read | Stable bleak connection, parsed Indoor Bike Data, TelemetryBus |
| 2 | FTMS Control Loop + Virtual Gearing | 4 Hz control loop, full handshake, GearEngine (10 gears), keyboard shift — **first real ride** |
| 3 | WebSocket Bridge + React Cockpit | WSServer, Zustand store, cockpit UI (speed/gear/watt/cadence/grade) at 60 Hz |
| 4 | GPX Route Integration | RouteEngine, haversine position tracking, grade-from-route fed into control loop |
| 5 | Zwift Click Integration | Research spike: nRF Connect capture, community OSS review, ShiftInput swap |
| 6 | Ride Export + Data Ownership | Session log, CSV export, optional FIT file |

---

## Research Flags Before Implementation

| Phase | Flag |
|-------|------|
| 1 | Check bleak issue tracker for macOS 14/15 CoreBluetooth regressions |
| 2 | Wahoo KICKR FTMS quirks — check QZ/ftms-bike OSS + plan empirical calibration spike |
| 5 | Full Zwift Click spike — check `zwift-click` GitHub and QZ source before starting |

---

## Open Design Decisions (for requirements phase)

1. Gear factor curve shape — linear vs geometric progression across 10 gears
2. Grade smoothing window size before sending to FTMS
3. Speed model for GPX position integration (trainer speed vs estimated virtual speed)
4. Shift debounce window (keyboard and Click)
5. FTMS write cadence fine-tuning — 4 Hz is the starting point, may need empirical adjustment
