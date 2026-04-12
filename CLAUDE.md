# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This is **not a code repository yet** — it is an Obsidian vault (`vault/RideOS/`) containing German-language concept and planning notes for a project called **RideOS**. There is no source code, no package manager, no build system, and no tests. Do not invent commands. When the user asks to "build the MVP", expect to scaffold the project from scratch based on the notes.

## The project being planned

RideOS is a custom indoor cycling app — a self-built "Zwift-light" — centered on:

- Controlling a **Wahoo KICKR Core** trainer via **FTMS** (Fitness Machine Service over BLE): read speed/power/cadence, write resistance/simulated grade.
- A **virtual gearing system** as the core differentiating feature. Formula used throughout the notes: `effective_grade = real_grade / gear_factor`. Gears 1–10 with factors ~0.5 (easy) to ~1.8 (hard).
- Integrating the **Zwift Click** shifter, which has **no official SDK** — requires BLE sniffing (nRF Connect) to reverse-engineer the notify characteristic bytes for up/down. The notes explicitly recommend starting with a keyboard stand-in and only tackling Click integration after the rest works.

## Planned architecture (from the notes)

Two-layer split is intentional and load-bearing:

1. **Deterministic core / local engine** — Node.js (`noble`) or Python (`bleak`). Owns the BLE connection, the gear engine, and the real-time control loop that pushes FTMS commands to the KICKR. This layer must be deterministic and low-latency.
2. **Frontend** — React / Next.js (Tailwind) cockpit UI. Renders speed/gear/watt/cadence, mini-map (Mapbox or Leaflet), and elevation profile (D3 or Recharts). Communicates with the local engine (WebSockets implied).

An **optional LLM layer** sits alongside — not inside — the core: route segmentation, workout generation from GPX, natural-language route requests, AI coach commentary, auto-tagging. **Hard rule from the notes: the LLM must never drive the trainer directly.** The control loop stays deterministic.

## MVP phasing (from `Focus Project.md`)

The notes define a specific incremental order; respect it when proposing work:

1. Connect to KICKR, read watts/speed.
2. Set resistance manually.
3. Virtual gears via keyboard input.
4. GPX integration (optional, later).
5. Zwift Click integration (optional, last).

Street View, multiplayer, and video overlay are explicitly deferred.

## UI principle

The UI notes (`Design, UI, UX.md`) frame this as a **cockpit, not a dashboard** — glanceable in under a second, minimal touch interaction (Click + keyboard), dark theme with one accent color. Speed is the primary number, Gear is the USP and must be prominent. A secondary "broadcast layer" (mini-map top-right, elevation profile across the bottom) mirrors TV cycling overlays but must never dominate over speed/gear/resistance.

## Second brain — Obsidian vault

`vault/RideOS/` is the project's living knowledge base. **Before making any design, architecture, or implementation decision, read the relevant note(s) from this vault.** Treat them as the authoritative source of intent; they take precedence over assumptions.

| Note | When to read |
|------|-------------|
| `vault/RideOS/Focus Project.md` | Overall scope, MVP phases, module breakdown |
| `vault/RideOS/webapp concept.md` | Architecture rationale; why a browser alone is insufficient (needs a local BLE bridge) |
| `vault/RideOS/Click integration.md` | BLE reverse-engineering procedure for the Zwift Click |
| `vault/RideOS/LLM option.md` | Where LLMs add value and the "never control the trainer" boundary |
| `vault/RideOS/Design, UI, UX.md` | Cockpit UI layout and broadcast-overlay layering |

When the user adds new notes to the vault, read them before responding. If context is unclear or conflicting, ask the user to update the relevant vault note — then re-read it.

Notes are in German; follow the user's language lead in responses.
