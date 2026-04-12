# Feature Landscape

**Domain:** Personal indoor cycling trainer app (KICKR Core + FTMS + virtual gearing)
**Researched:** 2026-04-12
**Confidence:** MEDIUM (training-data + PROJECT.md context; WebSearch/Context7 not available in this run — flag for validation before committing to a phase plan that depends on specific competitor features)

---

## Context Framing

RideOS is NOT a Zwift replacement. It is a personal, single-user, local-first cockpit for a KICKR Core + Zwift Cog + Zwift Click setup. The core USP is **virtual gearing** — a software-defined gear ratio that transforms GPX route grade into effective resistance via `effective_grade = real_grade / gear_factor`. The "game" layer (avatars, worlds, social) that Zwift/Rouvy lean on is explicitly rejected.

This categorization reflects that framing: "table stakes" means *table stakes for a personal cockpit that controls a trainer and rides a route*, NOT table stakes for a consumer cycling platform.

---

## Table Stakes

Features without which the app is unusable for its stated purpose. Missing any of these = the core loop is broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| BLE connection to KICKR Core (FTMS) | No trainer = no product | High | Wahoo FTMS quirks; bleak on macOS; must be resilient to drops. PROJECT.md constraint. |
| Live metrics read: power, cadence, speed | Core feedback loop; rider needs to see effort | Medium | FTMS Indoor Bike Data characteristic; 1Hz minimum, 4Hz ideal |
| Resistance / simulated grade write via FTMS | Without this, the trainer is just a flywheel | High | FTMS Control Point; Wahoo-specific acknowledgement handling |
| Virtual gearing (10 gears, grade factor math) | THE USP — `effective_grade = real_grade / gear_factor` | Medium | Gear table is a tuned curve, not linear; needs thoughtful defaults |
| Shift input (keyboard MVP, Zwift Click later) | Without shifting, gearing is static and useless | Low (kbd) / High (Click) | Click has no SDK — BLE sniffing required per PROJECT.md |
| Cockpit UI: speed (primary), gear (prominent), watts, cadence, grade | Rider's HUD; everything else is academic | Medium | React + Tailwind; 60fps target per constraints |
| WebSocket data bridge (Python → React) | Browser can't do FTMS; must bridge | Medium | Low-latency, reconnecting, backpressure-aware |
| GPX route loading | Without a route, there's no grade to modulate | Medium | Parse track + elevation; interpolate along distance |
| Position tracking along route (distance → grade) | Grade must follow the ride, not be static | Medium | Integrate speed over time → distance → grade lookup |
| Session start/stop | Rider needs to begin and end a ride deliberately | Low | Trivial but non-negotiable for UX |
| Graceful BLE disconnect handling | Dropouts happen; app must not freeze or crash | Medium | Reconnect loop; UI must surface state |

**Table stakes are bounded and finite.** This is the MVP surface — nothing below is required for a first usable ride.

---

## Differentiators

Features that make RideOS better *for personal use* than Zwift. These are not generic "better than Zwift" claims — they are better *for a rider who wants a focused training tool, not a game*.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Virtual gearing with tunable factor table** | Lets rider define their own resistance curve; rewrite cassette in software | Medium | Core USP. Advantage over Zwift's fixed virtual shifting is *user-tunable* factors |
| Local-first, no account, no cloud | Starts instantly, no login, no queue, no updates forced mid-ride | Low | Structural — falls out of architecture choice |
| Deterministic, low-latency control loop | No game engine overhead; shifts feel immediate | Medium | <50ms shift-to-resistance ideal |
| Minimal, readable cockpit (no map, no avatar) | Rider can focus on effort, not cosmetics | Low | Design-driven, not code-heavy |
| GPX-driven rides from real terrain | Ride your own routes, not fantasy worlds | Medium | Leverages existing GPX libraries in Python |
| Session log / ride export (FIT or CSV) | Rider owns their data; upload to Strava/Intervals.icu manually | Medium | FIT file spec is stable; CSV is trivial |
| Scriptable / hackable | Python backend means the rider can modify gear tables, add features | Low | Structural — falls out of Python + local |
| LLM coaching layer (optional, isolated) | Post-ride analysis without coupling to control loop | High | Explicitly isolated per PROJECT.md; never touches trainer |
| Custom gear presets per route | A climb profile wants different gears than a flat — save and load | Low | Extension of gearing system |
| Power zones / HR zones overlay (optional) | Simple training context without full TrainerRoad complexity | Low | If HR monitor is added later |

**Prioritized differentiator for MVP:** virtual gearing with tunable factors. Everything else is post-MVP.

---

## Anti-Features

Features Zwift/Rouvy/SYSTM have that RideOS **deliberately does not build**. Recording these prevents scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Avatars / 3D worlds / Watopia-style rendering | Not the product; huge scope; personal use | GPX route + numbers. Video overlay explicitly deferred per PROJECT.md |
| Multiplayer / group rides / meetups | Personal use only per PROJECT.md | Single-rider session model |
| Social feed, kudos, followers | Not relevant for personal use | None |
| User accounts / auth / cloud sync | Personal, single-machine | Local files only |
| Race events, leaderboards, rankings | Gamification is explicitly out of scope | None — local ride log only |
| Structured workout builder (ERG mode blocks) | Scope creep; TrainerRoad owns this | Optional future phase; not MVP. Gearing + GPX is the workout |
| Training plan engine | Coaching app territory, not trainer cockpit | Out of scope; could be LLM layer later |
| In-app video / Street View overlay | Deferred per PROJECT.md | None for now |
| Windows / Linux / iOS / Android ports | macOS only per PROJECT.md | None |
| Auto-updates / telemetry / analytics | Local-first; no phone-home | None |
| Power-up / XP / level systems | Game mechanics, not training | None |
| Music integration | Not the product | Use system music player |
| Virtual rides of famous courses (Rouvy-style prerecorded video) | Scope; licensing; not the USP | GPX-only |
| Companion mobile app | macOS + keyboard/Click is the entire surface | None |
| Voice chat / text chat | Single user | None |

---

## Feature Dependencies

```
BLE connection (FTMS)
  └─> Live metrics read
        └─> Cockpit UI metrics display
              └─> WebSocket bridge (precondition for UI)
  └─> Resistance write
        └─> Virtual gearing math
              ├─> Shift input (keyboard MVP)
              │     └─> Zwift Click BLE (post-keyboard)
              └─> GPX route loading
                    └─> Position tracking
                          └─> Grade-follows-route behavior
                                └─> Session log / export
                                      └─> LLM coaching layer (optional, isolated)
```

**Critical path:** BLE → metrics → resistance write → gearing math → keyboard shift → cockpit UI. This is the minimum viable ride.

**GPX dependency:** gearing is demonstrable with a static grade, but only *valuable* once grade comes from a route. Static-grade mode is a useful intermediate step; GPX should not block the gearing proof-of-concept.

---

## MVP Recommendation

Build in this order — each step produces something runnable:

1. **BLE connect + live metrics read** (prove hardware bridge)
2. **Resistance write + static grade control** (prove bidirectional FTMS)
3. **Virtual gearing math + keyboard shift** (prove the USP)
4. **Cockpit UI via WebSocket** (give the rider a HUD)
5. **GPX loading + position tracking** (make gearing contextual)
6. **Zwift Click BLE integration** (replace keyboard)
7. **Ride log / export** (own the data)

**Defer:**
- Custom gear presets per route — wait for real usage to reveal need
- LLM layer — post-MVP, isolated concern
- HR monitor / zones — only if rider adds hardware
- FIT export — CSV is fine until a concrete import target is chosen

---

## Open Questions for Requirements Phase

1. **Gear factor curve:** linear (e.g. 0.5, 0.6, ..., 1.4) or non-linear (real cassette-like ratios)? Affects feel dramatically.
2. **Grade smoothing:** GPX grade is noisy. Smooth over distance window, or pass raw? Affects resistance-write cadence.
3. **Speed model:** use trainer-reported speed, or compute from power + virtual mass + effective grade? Zwift does the latter; simpler apps use the former.
4. **Resistance-write frequency:** FTMS can be hit aggressively or sparingly. Too aggressive = Wahoo acks pile up; too sparse = laggy shifts.
5. **Shift debouncing:** how fast can the rider shift? Gate at UI or engine layer?

These are not research questions — they are design decisions for the first implementation phase. Flag them early.

---

## Confidence Notes

- **Competitor feature sets (Zwift/Rouvy/TR/SYSTM):** MEDIUM. Based on training data, not verified against current (2026) feature lists. The specific features called out (avatars, ERG mode, structured workouts, video overlay) are stable core offerings unlikely to have changed categorically.
- **FTMS / Wahoo behavior:** MEDIUM-LOW. PROJECT.md already flags "Wahoo has quirks — expect trial and error." Don't treat FTMS assumptions as verified — they will need empirical validation in the BLE phase.
- **Zwift Click reverse engineering:** LOW. No official SDK per PROJECT.md. Treat as research spike, not a planned deliverable.
- **Virtual gearing formula:** HIGH (defined in PROJECT.md as project-native; not a library dependency).

## Sources

- `.planning/PROJECT.md` (HIGH — project-native truth)
- Training-data knowledge of Zwift / Rouvy / TrainerRoad / SYSTM feature sets (MEDIUM — unverified in this session; WebSearch was unavailable)
- FTMS / BLE GATT specifications (MEDIUM — well-known standard; Wahoo-specific behavior needs empirical validation)

**Validation recommended before phase planning:** re-run this research with WebSearch access to confirm (a) no major competitor feature shifts since training cutoff, and (b) current state of Zwift Click BLE reverse-engineering community work (nRF Connect dumps, open-source shift decoders).
