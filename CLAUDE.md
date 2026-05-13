# CLAUDE.md

## Memory protocol

On session start — read before anything else:
```
memory/decisions.md   — architectural/technical decisions
memory/preferences.md — how user likes to work
```

On session end — update any file that changed. Only write non-obvious info lost between sessions.

When creating or editing files try to focus on relevant information and try to reduce the number of words to optimize token consumption.

## Repository status

Code lives at `engine/` (Python). Obsidian vault at `vault/RideOS/` (German-language planning notes — authoritative source of intent).

## Project

RideOS: personal macOS indoor cycling app.
- Hardware: Wahoo KICKR Core + Zwift Cog + Zwift Click
- BLE engine: Python + bleak → FTMS (read speed/power/cadence; write simulated grade)
- Virtual gearing USP: `effective_grade = real_grade / gear_factor` (10 gears, G1=0.5 easy, G10=1.8 hard)
- Zwift Click: no SDK → BLE sniffing required; keyboard is MVP stand-in + permanent fallback
- LLM layer: optional, isolated — NEVER controls trainer directly

## Architecture

- Layer 1 (engine): Python asyncio + bleak — BLE, gear engine, 4 Hz FTMS control loop
- Layer 2 (UI): React + Tailwind — cockpit display; talks to engine via WebSocket
- LLM layer: alongside, never inside the control loop

## MVP phase order (respect when proposing work)

1. Connect to KICKR, read watts/speed ✅
2. Set resistance via FTMS ✅
3. Virtual gears via keyboard ✅ (in progress)
4. GPX route integration (later)
5. Zwift Click BLE integration (last)

Deferred: Street View, multiplayer, video overlay.

## UI principle

Cockpit, not dashboard — glanceable in <1s, dark theme, one accent color.
Priority: Speed (primary) → Gear (prominent, USP) → Watt/Cadence → Grade.
Broadcast layer: mini-map (top-right) + elevation profile (bottom) — never dominate.

## Vault (authoritative intent — read only on command by user)

| Note | When to read |
|------|-------------|
| `vault/RideOS/Focus Project.md` | Scope, MVP phases, module breakdown |
| `vault/RideOS/webapp concept.md` | Architecture rationale, BLE bridge need |
| `vault/RideOS/Click integration.md` | BLE reverse-engineering procedure |
| `vault/RideOS/LLM option.md` | LLM boundaries + "never control trainer" rule |
| `vault/RideOS/Design, UI, UX.md` | Cockpit layout + broadcast overlay |

Notes are in German; follow user's language lead in responses.
