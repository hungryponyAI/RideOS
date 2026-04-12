# RideOS

## What This Is

RideOS is a personal indoor cycling app that controls a Wahoo KICKR Core trainer via Bluetooth (FTMS), simulates virtual gearing, and tracks live riding metrics — without Zwift or any third-party platform. It runs locally on macOS as a Python backend paired with a React cockpit UI.

## Core Value

The virtual gearing system: shift up or down to change how hard a given grade feels, giving you full control over the resistance curve the trainer delivers.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Connect to KICKR Core via BLE and read speed, power, cadence in real time
- [ ] Set resistance / simulated grade on the KICKR via FTMS
- [ ] Virtual gearing: 10 gears that apply a factor to real grade (`effective_grade = real_grade / gear_factor`)
- [ ] Keyboard input to shift up/down (MVP stand-in for Zwift Click)
- [ ] React cockpit UI: speed (primary), gear (prominent), watt, cadence, simulated grade
- [ ] Live data flow from Python engine to React UI via WebSocket
- [ ] GPX route loading and position tracking (grade follows route)
- [ ] Zwift Click BLE integration (after keyboard gears work)

### Out of Scope

- Street View / video overlay — deferred, not needed for core loop
- Multiplayer — not relevant for personal use
- Windows / Linux support — macOS only for now
- Multi-user / auth — personal use, single rider
- LLM layer (coaching, route analysis) — optional future addition, never controls trainer directly

## Context

- Hardware: Wahoo KICKR Core + Zwift Cog + Zwift Click
- The Zwift Click has no official SDK — BLE sniffing (nRF Connect) required to reverse-engineer shift signals
- Browser alone cannot drive FTMS; a local Python service (bleak) is required as a BLE bridge
- FTMS is the standard but Wahoo has quirks — expect trial and error
- This project serves dual purpose: personal training tool + systems engineering portfolio piece

## Constraints

- **Platform**: macOS only — simplest BLE stack, hardware is on this machine
- **BLE library**: Python + bleak — more stable than noble for FTMS control
- **Frontend**: React + Tailwind — cockpit UI, not a dashboard
- **Realtime**: WebSockets between Python engine and React UI — 60fps target for metrics display
- **MVP discipline**: phases are strictly ordered; do not add later-phase features to earlier phases

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python + bleak for local engine | More stable BLE stack than noble; easier async for FTMS control loop | — Pending |
| Keyboard as Click stand-in for MVP | Avoids BLE reverse-engineering block; focus on control loop first | — Pending |
| LLM layer isolated, never controls trainer | Deterministic realtime control loop must not depend on LLM latency | — Pending |
| macOS only | Hardware is on one machine; simplest BLE path | — Pending |
| Personal use only | No auth, no multi-user; ship fast and iterate | — Pending |

---
*Last updated: 2026-04-12 after initialization*
