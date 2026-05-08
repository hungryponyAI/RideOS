# RideOS — Architectural Refactor Plan

**Author**: Software architect role
**Status**: Draft, awaiting review
**Date**: 2026-05-08
**Scope**: Whole codebase — engine (Python) + cockpit (React/TypeScript)

---

## 0. Executive summary

RideOS today is a working but architecturally tangled prototype: a god-dataclass
(`RideState`) mutated by half a dozen producers, a 700-line WebSocket handler, a
500-line `App.tsx`, and a single `useTelemetry` hook that mixes telemetry,
route-library state, Strava status, and connection lifecycle. It works because
one developer holds the whole graph in their head. That doesn't scale to
collaborators, doesn't survive feature growth, and makes bugs (like the silent
`time` import that just took 90 minutes to find) harder than they need to be.

This refactor restructures the codebase around **ports & adapters** with an
**event-sourced read model** at the core. Pure domain logic moves into a
testable, I/O-free module. BLE, Strava, persistence, and the WebSocket transport
become adapters behind interfaces. State changes flow through a single event
bus, so the read model — and any future projections (training history, replay,
analytics) — fall out for free.

The migration is **strangler-fig**: the app stays runnable on every commit. No
"rewrite branch", no week-long bisection holes. Each phase has measurable exit
criteria and can be paused/resumed.

---

## 1. Goals (in priority order)

1. **Easy to add features.** New features (Strava upload, training database, ride
   replay, redesigned cockpit) should land in one feature folder, not threaded
   through five files.
2. **Easy to debug.** Every state change is an event with a timestamp. Replaying
   the event log reproduces any bug exactly. No more "what mutated `RideState`
   between tick 43 and tick 44".
3. **Ready for collaborators.** Module boundaries are explicit, types are
   complete, tests pin behavior, CI runs on every PR. Onboarding doc points at
   the right module per task.
4. **Foundation for cloud / multi-user**, without paying the cost today. The
   ports layer means swapping local SQLite for a remote API later is a one-file
   change, not a rewrite.

## 2. Non-goals

- **Not a rewrite.** No greenfield "v2 branch". Existing features keep working
  every commit.
- **Not a tech-stack change.** Python + asyncio + bleak on the engine; React +
  Vite + Tailwind on the cockpit. Same versions.
- **Not a microservices split.** The engine stays a single process. Splitting
  into services solves problems we don't have.
- **Not a DI framework.** No `dependency-injector`, `wired`, or similar. Manual
  composition root, ports are protocols, that's enough.
- **Not multi-user / not auth-hardened.** L2/L3 security is *prepared for* (clean
  Strava-secret handling, ports for repositories) but not *implemented now*.
- **No new product features during the refactor.** Features land *after* the
  phase that unblocks them.

## 3. Hard rules (load-bearing constraints)

These come from `CLAUDE.md` and the vault notes — they shape the architecture
and must survive the refactor:

- **The control loop is deterministic and BLE-direct.** No queue, no LLM, no
  network in the FTMS write path. 4 Hz tick stays 4 Hz tick.
- **The LLM (when added) never touches the trainer.** Reads from the read
  model, writes nowhere except to its own outputs.
- **No internet required for a ride.** Strava, cloud sync, anything network-based
  is optional. A user with no Wi-Fi can still load a saved GPX and ride.
- **MVP-phase ordering is respected.** Click integration, multiplayer, video
  overlay are all explicitly post-MVP. The architecture must not require them.

## 4. Target architecture

### 4.1 Layer diagram (backend)

```
┌──────────────────────────────────────────────────────────────────┐
│  composition root (main.py)                                      │
│  reads config, instantiates adapters, wires services             │
└──────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────┐
│  transport — translates wire formats to/from service calls       │
│  ┌────────────────┐  ┌────────────────┐                          │
│  │ ws/router      │  │ http/api       │  (future)                │
│  └────────────────┘  └────────────────┘                          │
│            │                  │                                  │
│            ▼                  ▼                                  │
│        application services (use-cases)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │
│  │ RideService    │  │ RouteService   │  │ StravaService  │      │
│  └────────────────┘  └────────────────┘  └────────────────┘      │
│            │                  │                  │               │
│            ▼                  ▼                  ▼               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  domain core (pure Python, no I/O, no asyncio in types)  │    │
│  │  gears · route math · phase machine · erg · ftms_codec   │    │
│  │  events · projections (read model)                       │    │
│  └──────────────────────────────────────────────────────────┘    │
│            ▲                                                     │
│            │ ports (protocols) — domain depends on these         │
│            │                                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  adapters (own all I/O)                                  │    │
│  │  ble/kickr · ble/click · strava/http · sqlite/* ·        │    │
│  │  input/keyboard · eventbus/asyncio                       │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Dependency rule**: code in an inner layer never imports from an outer one.
Domain can be tested with no asyncio running. Adapters depend on domain (for
event types) but domain doesn't know they exist.

### 4.2 Module layout (backend)

```
engine/engine/
  domain/                       # PURE — no I/O, no asyncio
    __init__.py
    events.py                   # all event types (frozen dataclasses)
    gears.py                    # GearEngine (already pure, just relocated)
    route.py                    # RouteData + transformations
    erg.py                      # erg tables
    ftms_codec.py               # encode/decode FTMS bytes (was control_point.py)
    phase_machine.py            # warmup → route → cooldown logic (no asyncio)
    projection.py               # event → RideStateView read model
    types.py                    # RideStateView, value objects

  application/                  # use-case orchestration
    __init__.py
    ride_service.py             # start_ride / pause / resume / shift / end
    route_service.py            # CRUD over routes, GPX parse, library
    strava_service.py           # connect / sync / upload (future)
    training_service.py         # ride history, stats (future)

  ports/                        # interfaces (Python Protocols)
    __init__.py
    trainer.py                  # TrainerPort (set_grade, set_target_power, ...)
    shifter.py                  # ShifterPort (events: shift_up, shift_down)
    repos.py                    # RouteRepo, RideRepo, TokenRepo, etc.
    strava.py                   # StravaPort (auth_url, exchange, sync, upload)
    eventbus.py                 # EventBus (publish, subscribe)
    clock.py                    # Clock (monotonic, wall) — for testability

  adapters/
    ble/
      kickr_trainer.py          # implements TrainerPort via bleak
      click_shifter.py          # implements ShifterPort via bleak
      reconnect.py
      scanner.py
    persistence/
      sqlite/
        __init__.py
        connection.py           # sqlite3 connection factory
        migrations/             # versioned schema
          001_initial.sql
        route_repo.py
        ride_repo.py
        token_repo.py
    strava/
      http_client.py
      oauth.py                  # token storage via TokenRepo
    input/
      keyboard_shifter.py
    eventbus/
      asyncio_bus.py            # in-process pub/sub on the event loop
    clock/
      system_clock.py

  transport/
    ws/
      server.py                 # owns websocket lifecycle (small)
      inbound.py                # message-type → service-method dispatch
      outbound.py               # subscribes to projection, broadcasts
      schemas.py                # pydantic models for inbound messages
    http/
      (future)

  config/
    settings.py                 # pydantic-settings from TOML + env
    logging.py

  main.py                       # composition root
  __main__.py                   # entry: python -m engine
```

### 4.3 Module layout (frontend)

```
ui/src/
  app/
    App.tsx                     # router shell + global providers (small)
    routes.tsx                  # route definitions
    providers/
      WSProvider.tsx            # connection lifecycle, status state
      ThemeProvider.tsx
      SettingsProvider.tsx

  features/
    ride/
      RideScreen.tsx
      hooks/
        useRideTelemetry.ts     # selector subset of state
        useRidePhase.ts
        useErgCountdown.ts
      components/
        MetricsPanel.tsx
        BadgeBar.tsx            # ghost gap + elapsed + distance
        PhaseBanner.tsx         # warmup/cooldown countdown
        ErgCountdown.tsx
        TargetMetric.tsx        # measured + target stacked
        GearStrip.tsx
        ElevationProfile.tsx
        MiniMap.tsx
    pre-ride/
      PreRideScreen.tsx
      RouteCard.tsx
      RouteCardExpanded.tsx
      RideOptions.tsx
      RouteTrimSlider.tsx
    routes/
      hooks/useRouteLibrary.ts
    settings/
      SettingsPanel.tsx
      hooks/useAthleteSettings.ts
    strava/
      StravaConnectModal.tsx
      hooks/useStravaStatus.ts
    training/                   # NEW — added in phase 7
      TrainingHistory.tsx
      RideDetail.tsx

  shared/
    ws/
      useWS.ts                  # generic ws connection hook
      useWSSubscription.ts      # subscribe to a specific message type
      protocol.ts               # outbound message helpers
    ui/                         # design-system primitives
      Badge.tsx
      Metric.tsx
      Button.tsx
      Modal.tsx
    types/
      telemetry.ts
      route.ts
      messages.ts
    hooks/
      useKeybindings.ts

  styles/
    index.css
    tokens.css                  # CSS variables — single source of truth
```

The current `useTelemetry` returning **fourteen things** is the smell to
delete. Replace with: one `WSProvider` owns the connection; feature-scoped
hooks (`useRideTelemetry`, `useStravaStatus`, `useRouteLibrary`) each
subscribe to their slice via `useWSSubscription(type)`.

## 5. State architecture: event bus + read-model projection

This is the single highest-leverage change in the refactor.

### 5.1 The problem today

`RideState` is a mutable dataclass. The following all write to it:
- `_on_reading` (BLE telemetry callback)
- `RouteTracker` (asyncio task)
- `GhostTracker` (asyncio task)
- `KeyboardShifter` (thread)
- `_start_ride` handler (WS handler task)
- `run_phases` (asyncio task)
- `run_control_loop` (asyncio task — for erg debouncing)

Six writers, no synchronization beyond "we're all on the same event loop". When
something is wrong, the only way to find out is to log every writer and
correlate by hand. Removing a field requires reading every file.

### 5.2 Target model

**Events flow one way**: adapters publish, services and the projection
subscribe. The read model is a function of the event log.

```
[BLE notification] ──► KickrAdapter ──► PowerReadingReceived ──┐
[Click button]    ──► ClickAdapter ──► ShiftRequested ────────┤
[Keyboard]        ──► KbAdapter ──► ShiftRequested ───────────┤
[WS inbound]      ──► WSInbound ──► RideStartRequested ───────┤  EventBus
[Tracker tick]    ──► RouteService ──► PositionAdvanced ──────┤  pub/sub
[Phase timer]     ──► PhaseMachine ──► RidePhaseChanged ──────┘
                                                  │
                                                  ▼
                          ┌──────────────────────────────────────┐
                          │ RideStateProjection                  │
                          │ event → new RideStateView (immutable)│
                          └──────────────────────────────────────┘
                                                  │
                                                  ▼
              ┌───────────────────────┬───────────────────────────┐
              │ WS outbound (4 Hz)    │ SqliteRideRepo (event log)│
              │ broadcasts view diff  │ persists every event      │
              └───────────────────────┴───────────────────────────┘
```

### 5.3 Concrete event types

Frozen dataclasses, JSON-serialisable:

```python
@dataclass(frozen=True)
class TelemetryReading:           # from KICKR
    speed_kmh: float | None
    power_w: int | None
    cadence_rpm: float | None
    t_mono: float

@dataclass(frozen=True)
class GearShifted:
    gear: int
    direction: Literal["up", "down"]
    t_mono: float

@dataclass(frozen=True)
class PositionAdvanced:
    position_m: float
    grade_idx: int
    grade_pct: float
    lap_index: int
    t_mono: float

@dataclass(frozen=True)
class RidePhaseChanged:
    phase: Literal["warmup", "route", "cooldown", "done"]
    target_power_w: float | None
    phase_end_mono: float | None
    t_mono: float

@dataclass(frozen=True)
class ErgTargetCommitted:
    power_w: float
    cadence_rpm: int | None
    t_mono: float

# … plus RideStarted, RideEnded, RouteLoaded, GhostUpdated, etc.
```

### 5.4 Why this is the right call

- **Debugging** — every event has a timestamp; pickle the event stream and you
  can replay any bug deterministically. The "did the broadcast loop crash?"
  question becomes "show me the last 100 events".
- **Testability** — feed events into the projection, assert on the view. No
  asyncio in domain tests.
- **New features come for free** — Strava upload reads from the event log.
  Training history is `SELECT * FROM ride_events WHERE ride_id=?`. Replay UI
  reads the same log.
- **No god-object** — `RideStateView` is immutable; readers can't mutate it.
  Writers only emit events.

### 5.5 Cost

- One-time conceptual onboarding for collaborators.
- A few hundred lines of new code (event types, projection, bus).
- More allocations per tick (immutable view rebuild). Negligible at 4 Hz, but
  measure to be sure.

## 6. Persistence: SQLite + event-sourced ride log

### 6.1 Schemas

```sql
-- routes (replaces routes/*.json sidecars)
CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'gpx_upload' | 'strava'
  strava_id TEXT,
  added_at TEXT NOT NULL,         -- ISO8601 UTC
  total_dist_m REAL NOT NULL,
  elevation_gain_m REAL NOT NULL,
  elevation_loss_m REAL NOT NULL,
  best_time_s REAL,
  ride_count INTEGER NOT NULL DEFAULT 0,
  gpx_blob BLOB NOT NULL          -- the original GPX, for re-parse / re-export
);

-- ride sessions
CREATE TABLE rides (
  id TEXT PRIMARY KEY,            -- uuid
  route_id TEXT REFERENCES routes(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_s REAL,
  distance_m REAL,
  avg_power_w REAL,
  max_power_w REAL,
  reverse INTEGER NOT NULL DEFAULT 0,
  laps INTEGER NOT NULL DEFAULT 1,
  warmup_s INTEGER NOT NULL DEFAULT 0,
  cooldown_s INTEGER NOT NULL DEFAULT 0,
  erg_mode INTEGER NOT NULL DEFAULT 0,
  cutout_start_m REAL,
  cutout_end_m REAL,
  uploaded_to_strava_id TEXT
);

-- event-sourced telemetry log (append-only)
CREATE TABLE ride_events (
  ride_id TEXT NOT NULL REFERENCES rides(id),
  seq INTEGER NOT NULL,           -- monotonically increasing within ride
  t_ms INTEGER NOT NULL,          -- ms since ride start
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,          -- JSON
  PRIMARY KEY (ride_id, seq)
);
CREATE INDEX idx_ride_events_type ON ride_events(ride_id, event_type);

-- secrets (encrypted at rest)
CREATE TABLE strava_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token_enc BLOB NOT NULL,
  refresh_token_enc BLOB NOT NULL,
  expires_at INTEGER NOT NULL,
  athlete_id TEXT,
  athlete_name TEXT,
  scopes TEXT
);
```

### 6.2 Storage choices

- **SQLite via stdlib `sqlite3`** — zero new deps, fully embedded, file-per-db.
  Move to SQLAlchemy only if/when we add a server-side variant.
- **Schema migrations**: numbered `.sql` files run on startup against
  `PRAGMA user_version`. No alembic — overkill for a local app.
- **Event payload as JSON**: one column, schema-on-read. Keep events
  forward-compatible (new fields, never reorder).
- **GPX blob in SQLite**: one less directory of orphan files; easy backup (copy
  one `.db`).
- **Tokens encrypted** with `cryptography.fernet`, key stored in OS keychain
  (`keyring` library) — not in the db file. See §8.

### 6.3 Event-log volume

At 4 Hz × 1 hour = 14,400 events. ~120 bytes/event JSON ≈ 1.7 MB per ride raw.
Acceptable. If it grows, we compact post-ride into per-ride aggregates and
discard the raw log >30 days old (still keep aggregate).

## 7. Deployment topology

You said **Vercel**. Here's the model:

```
                         (cloud)                    (local — user's Mac)
┌──────────────────────┐         ┌──────────────────────────────────┐
│  rideos.vercel.app   │         │  KICKR Core (BLE)                │
│  React/Vite static   │         │       │                          │
│  build               │         │       ▼                          │
│                      │         │  engine (uv run)                 │
│       │              │  ws://  │       │                          │
│       └──────────────────────► │  ws://localhost:8765             │
│                      │         │  http://localhost:8765/api/...   │
│  https only          │         │                                  │
└──────────────────────┘         └──────────────────────────────────┘
```

Notes / constraints:

- **Mixed-content**: browsers (Chromium, Firefox) treat `ws://localhost` as a
  secure context even from `https://` pages. Confirmed today, but keep it as a
  smoke test in CI so a future browser policy change doesn't surprise us.
- **First-run UX**: Vercel-hosted page loads, tries `ws://localhost:8765`, fails
  if engine isn't running, shows install/start instructions. Don't pretend it
  works without the local engine.
- **"Bridgeless" cloud deploy is not in scope.** When multi-user/cloud sync
  arrives, we add a relay/signaling component — that's a phase-7+ decision, not
  this refactor.
- **Vercel build = `ui/` directory only.** The engine is not deployed. Vercel
  build command runs `npm run build`; nothing else.
- **Public URL means Strava OAuth redirect can finally point at a stable
  domain** — easier than the current `localhost` callback. Schedule this for
  the Strava-service phase.

## 8. Security (L1 baseline)

You picked L1 (don't leak secrets). That's fine for a local app today. The
plan still preps for L2/L3 cleanly.

### 8.1 Now (L1, mandatory)

- **`.env` for all secrets**, gitignored. Strava `client_secret` moves out of
  `engine/config/strava.json` into env.
- **Pre-commit `gitleaks`** on every commit. CI runs it on every PR.
- **Strava tokens encrypted at rest** in the SQLite db with `cryptography.fernet`;
  key stored in OS keychain via `keyring` (Mac Keychain on darwin). Never in
  the db file, never in env, never logged.
- **WebSocket bound to `127.0.0.1`** (it already is — keep it explicit, document
  it). No `0.0.0.0`. No CORS-permissive defaults.
- **Inbound message validation** with pydantic schemas. Reject unknown types,
  oversized payloads (16 MB cap is fine, but enforce per-type smaller limits
  for things like `gear_shift`).
- **GPX upload safety**: parse in a worker thread, reject >5 MB files, no path
  in the file content is ever opened. Today's `load_route_content` path is
  fine; just keep the file handling concentrated in `RouteService`.
- **Dependency hygiene**: `uv` lockfile pins Python deps with hashes. `npm audit`
  in CI weekly. Renovate or Dependabot for upgrade PRs.

### 8.2 Prepared for L2 (turn-on-when-needed)

- Ports for `TokenRepo`, `RouteRepo`, etc. — swap local SQLite for remote API
  without touching domain.
- Auth hook on the WS server (currently no-op, becomes a token check).
- Structured logging with PII tagging — easy to redact when logs leave the
  machine.

### 8.3 Won't do now (explicitly out of scope)

- TLS on the WS server (browser localhost exemption suffices).
- CSRF on a non-existent REST API.
- Rate limiting / DDoS protection (single-user local).
- RBAC, multi-tenant isolation.

## 9. Testing strategy

You picked **C** (full coverage incl. UI/E2E) with manual verification OK
during the refactor. Concretely:

| Layer | Tooling | Coverage target |
|-------|---------|-----------------|
| Domain (gears, route, erg, ftms_codec, projection, phase_machine) | pytest | **100% line / 95% branch** |
| Application services | pytest + fakes | **90%** of public methods |
| Adapters | pytest + integration harness | smoke tests with replay fixtures |
| Transport (WS) | pytest + websockets test client | every inbound message type, 1 happy + 1 sad path |
| Frontend components | Vitest + Testing Library | every interactive component, prop-driven |
| Frontend hooks | Vitest | every public hook |
| E2E | Playwright against mock backend | start-ride flow, gear shift, pause/resume, route load |

**During the refactor**: tests are written *as we go*, not retrofitted. New
domain code lands with tests. Existing-code-being-moved keeps current tests
passing. Manual verification covers the seams between phases.

**Test fixtures** worth building once and reusing:
- A recorded BLE notification trace (a real ride's worth of bytes) + a fake
  bleak client that replays it. Lets us run the engine end-to-end without
  hardware.
- A canned GPX route fixture set (flat, climby, with cutouts) for route math.
- A recorded WS message stream for frontend E2E replay.

## 10. Migration plan (strangler-fig phases)

Each phase is a **single PR** (or small stack). The app runs end-to-end after
every merge. Phases are sequenced so each unblocks the next; **don't reorder**
without thinking through the dependency.

### Phase 0 — Safety net & instrumentation *(no behavior change)*

1. CI workflow: `ruff`, `mypy --strict` on `engine/`, `pytest`, `eslint`,
   `tsc --noEmit`, `vitest`, `gitleaks`.
2. Pre-commit hooks for the same.
3. Replace ad-hoc prints with structured logging (`structlog`).
4. Build the BLE replay fixture + fake bleak adapter (the integration harness).
5. Write the *current* behavior into pinning tests — the gear engine is good,
   add tests for `RouteTracker`, phase machine, erg debouncer, `_start_ride`.

**Exit criteria**: CI green; replay harness boots and runs a 30-second
recorded ride end-to-end without hardware; pinning tests pass.

### Phase 1 — Extract domain core

Move the already-pure modules into `domain/`:

- `gears/engine.py` → `domain/gears.py`
- `ftms/control_point.py` (encode/decode) → `domain/ftms_codec.py`
- `route/loader.py`, `route/model.py`, `route/erg.py` → `domain/route.py`,
  `domain/erg.py`
- `route/tracker.py`'s **logic** (not the asyncio task) → `domain/`. The task
  becomes a thin adapter that calls into the domain function on each tick.

No behavior change. Imports update across the codebase. Tests still pass.

**Exit criteria**: `domain/` imports nothing from `adapters/`, `transport/`, or
asyncio. Coverage on domain ≥80% line.

### Phase 2 — Define ports and event bus

1. Write `ports/` protocols: `TrainerPort`, `ShifterPort`, `EventBus`, `Clock`,
   `RouteRepo`, `TokenRepo`.
2. Implement `adapters/eventbus/asyncio_bus.py`.
3. Define event types in `domain/events.py`.
4. Build `domain/projection.py` — events in, immutable `RideStateView` out.

The bus is wired up but **nothing publishes events yet**. The existing
`RideState` mutation continues. This phase is preparation.

**Exit criteria**: bus + projection unit-tested in isolation; 5 sample event
types defined; no behavior change.

### Phase 3 — Wrap existing I/O behind adapters

For each existing I/O module, create an adapter that implements the matching
port:

- `adapters/ble/kickr_trainer.py` — wraps the FTMS controller, implements
  `TrainerPort`.
- `adapters/ble/click_shifter.py` — wraps `run_click_shifter`, implements
  `ShifterPort`. Publishes `ShiftRequested` events to the bus.
- `adapters/strava/http_client.py` — wraps existing Strava code, implements
  `StravaPort`.
- `adapters/persistence/sqlite/*` — first SQLite repos for `RouteRepo` and
  `TokenRepo`. Migration from existing JSON: one-shot script that runs on
  startup if the DB doesn't exist.

The application services don't exist yet — for now `main.py` keeps the old
wiring but uses the adapters internally. This is the strangler-fig step:
adapters are in place, old call sites still work.

**Exit criteria**: every direct `bleak.*` / `requests.*` import is in an
adapter; rest of the code only sees ports.

### Phase 4 — Application services + event-driven core

Replace direct mutation of `RideState` with services that publish events.

- `application/ride_service.py`: start/pause/resume/end, gear shifts, lap
  events. Owns the phase machine, owns the route tracker tick.
- `application/route_service.py`: GPX parse, library CRUD, route-data
  broadcast.
- `application/strava_service.py`: connect, sync, (later) upload.

The control loop now reads from `RideStateView` (the projection), not the old
`RideState`. The old `RideState` dataclass is **deleted** in this phase.

This is the largest single phase. Budget for it.

**Exit criteria**: `RideState` class no longer exists in source; control loop
reads from the projection; an event log can be enabled via a feature flag and
contains every meaningful state change of a 30-second ride.

### Phase 5 — Persist the event log

1. SQLite migrations 002 and 003 add `rides` and `ride_events` tables.
2. Subscribe a `RideRepoSink` to the event bus that appends to `ride_events`.
3. `RideService.end_ride` finalises the `rides` row with summary stats.

After this phase, every ride is recorded. The event log is a feature, not just
debug telemetry.

**Exit criteria**: ride-history queries against SQLite return correct stats
for a known recorded ride; event log file size is within budget (§6.3).

### Phase 6 — WebSocket transport rewrite

1. `transport/ws/inbound.py`: pydantic-validated dispatch table mapping
   `type` → service method. The current 700-line `_handler` is gone.
2. `transport/ws/outbound.py`: subscribes to projection updates, throttles to
   4 Hz, broadcasts. The current `_state_broadcast_loop` becomes this — it
   moves from `main.py` into transport.

**Exit criteria**: zero business logic in `transport/`. Adding a new message
type is a one-file change in `inbound.py` + new method on the relevant
service.

### Phase 7 — Frontend split

1. Create `app/`, `features/`, `shared/` directories.
2. Carve `App.tsx` into `RideScreen.tsx`, `PreRideScreen.tsx`, providers.
3. Split `useTelemetry` into `WSProvider` + per-feature subscription hooks.
4. Extract design-system primitives (`Badge`, `Metric`, `Button`) into
   `shared/ui/`.
5. Vitest tests for every interactive component.
6. Playwright E2E against the mock-backend fixture.

This phase is also where the **design refactoring** lives. The structure is
ready — visual changes happen feature-by-feature without touching transport
or state.

**Exit criteria**: no file in `features/` reaches into another `features/*`
directory; no component imports `useTelemetry` (it's deleted); E2E suite
passes for the four golden flows.

### Phase 8 — New features (post-refactor)

These are *enabled* by the refactor, not part of it:

- **Strava upload** — `StravaService.upload_ride(ride_id)`; reads event log,
  builds `.fit` or `.tcx`, posts to Strava.
- **Training history view** — `features/training/`; reads from `rides` and
  `ride_events`.
- **Cockpit redesign** — under `features/ride/`; iterates on the design
  freely without touching transport or state.
- **Multi-user/cloud sync prep** — swap SQLite repos for HTTP repos behind
  the same ports.

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 4 (event-driven core) lands a subtle bug that only shows up mid-ride | High | Pinning tests in phase 0; ride-on-the-trainer manual test after phase 4; rollback plan = revert that PR |
| Event log volume grows unbounded | Medium | Compact-and-retain policy in §6.3; add monitoring on db file size from day one |
| Strava OAuth breaks during the auth refactor | Medium | Keep old strava module operational until adapter is proven on a test account |
| Vercel deploy hits a browser mixed-content edge case | Low | Smoke test in CI hits the deployed Vercel URL → ws://localhost; flag if it ever stops working |
| Refactor stalls because each phase feels too small to ship | Medium | Each phase has clear exit criteria; don't merge until they're all green; do not ship "phase 4 part 1 of 3" |
| Pinning tests are too tightly coupled and break with every refactor PR | Medium | Pin behavior at the *port* level, not internal call shapes; test "given inbound X, broadcast contains Y" not "function Z gets called once" |

## 12. Open questions for the architect (you)

These are decisions I'd take by default, but flag here in case you disagree:

1. **`structlog` vs stdlib logging?** I'd default to `structlog` for structured
   JSON output that's grep-friendly. Adds one dep.
2. **Schema migrations: hand-rolled SQL or `aerich` / `alembic`?** Default:
   hand-rolled `.sql` numbered files. Ten lines of runner code, no extra deps.
3. **Event-log retention default**: keep raw events 30 days, then drop and keep
   only summary stats? Or keep forever and figure it out later? Default: keep
   forever for now; it's small.
4. **Frontend state lib (Zustand, Jotai, just hooks)?** Default: just hooks +
   context. We're not at the complexity that needs Zustand.
5. **Storybook?** Useful for the design refactor (phase 8). Default: yes,
   added in phase 7. Vitest-compatible.
6. **Python version**: today's `pyproject.toml` says `>=3.11`. Confirm we can
   require **3.11+** (uses `typing.Self`, `tomllib`).

## 13. What I'm asking you to approve

- The **target architecture** (§4–§5).
- The **phase ordering** (§10).
- The **L1 security baseline** (§8.1).
- The **persistence model** (§6).
- The **out-of-scope list** (§2 + §8.3) — equally important.

Once you sign off, phase 0 is roughly a day of CI/test infra and is the right
first PR. Each subsequent phase is small enough to estimate honestly when we
get to it.
