# Technology Stack

**Project:** RideOS — local indoor cycling trainer app (macOS)
**Researched:** 2026-04-12
**Overall confidence:** MEDIUM (training-data-derived; external verification tools were unavailable during this research pass — flagged where relevant)

---

## TL;DR — The Recommended Stack

| Layer | Choice | Version (as of 2025) | One-liner |
|------|--------|----------------------|-----------|
| BLE | `bleak` | ~0.22.x | Only serious async Python BLE lib; uses CoreBluetooth on macOS natively |
| FTMS | Hand-rolled on top of bleak | — | No mature "FTMS library" exists; parse GATT characteristics directly |
| Async runtime | `asyncio` (stdlib) | 3.12+ | Native to bleak; same loop drives WebSockets and control loop |
| WebSocket server | `websockets` (aaugustin/python-websockets) | ~13.x | Minimal, single-purpose, pairs cleanly with asyncio + bleak — no HTTP routing needed |
| Data modelling | `pydantic` v2 | ~2.9.x | Strong typing for telemetry payloads sent to UI; fast serialization |
| GPX parsing | `gpxpy` | ~1.6.x | De-facto standard for GPX in Python |
| Python version | CPython | 3.12+ | Matches bleak + pydantic support; `TaskGroup`, better asyncio ergonomics |
| Package manager | `uv` | ~0.4+ | Fast, modern replacement for pip/poetry; lockfile + venv in one tool |
| Frontend bundler | `Vite` | 5.x / 6.x | Zero-config React + HMR; tiny dev loop, tiny prod bundle |
| Frontend framework | `React` | 18.x (Strict/Concurrent) | Required by user; stable and well-supported |
| Styling | `Tailwind CSS` | 3.4.x (or 4.x if ready) | Required by user; utility-first matches cockpit UI rapid iteration |
| State (realtime) | `zustand` | 4.x | Tiny store; handles 60 Hz telemetry updates without React re-render storms |
| WS client | Native `WebSocket` API | — | Stdlib; no extra dep needed for single-endpoint local connection |
| Charts (later) | `uplot` via `uplot-react` | 1.6.x | 60 fps time-series; far cheaper than recharts/chartjs for live data |
| Process manager | `honcho` or shell `Makefile` | — | Spawns backend + frontend dev servers together |

---

## Recommended Stack — Detail

### Core BLE / Trainer Control

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `bleak` | ~0.22.x | Async BLE client (scan, connect, GATT read/write/notify) | Only Python BLE library with real cross-platform (including macOS) support and asyncio-native API. Maintained by hbldh; used by Home Assistant and essentially every Python BLE project in 2024–2025. On macOS it wraps Apple's **CoreBluetooth** via `pyobjc-framework-CoreBluetooth`. |
| `pyobjc-framework-CoreBluetooth` | pinned by bleak | CoreBluetooth bridge (macOS) | Installed transitively. Don't pin manually — let bleak resolve a compatible version. |
| `bleak-retry-connector` (optional) | ~3.x | Retry + connection stability helpers | Originating from Home Assistant; useful if macOS drops connections during long rides. Add only if you see real instability — not required from day one. |

**Confidence:** HIGH on `bleak` being the right choice. MEDIUM on exact 0.22.x version number (verify against PyPI at install time).

### FTMS (Fitness Machine Service)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hand-rolled FTMS parser/writer | n/a | Encode Control Point commands, decode Indoor Bike Data | **There is no production-quality "FTMS" Python library** as of 2025. Existing packages (`pycycling`, `ftms`, various hobby repos) are useful as *references* but not dependencies — they are thin, often stale, and you will fork them anyway for Wahoo quirks. |
| `pycycling` (reference only) | ~0.4.x | Reading its FTMS module as a spec | Good source code to read for bitfield layouts. Do **not** add as a runtime dependency if you want determinism. |

**Key FTMS specifics to implement manually:**
- UUID `0x1826` — Fitness Machine Service
- `0x2AD2` — Indoor Bike Data (notify) → power, cadence, speed
- `0x2AD9` — Fitness Machine Control Point (write w/ response, indicate)
- `0x2ACD` — Training Status
- Opcodes: `0x00` request control, `0x07` start/resume, `0x08` stop/pause, `0x11` set simulation parameters (grade goes here)
- Simulation Parameters payload: int16 wind speed (0.001 m/s), sint16 grade (0.01 %), uint8 Crr (0.0001), uint8 Cw (0.01 kg/m)

**Wahoo caveat:** Wahoo trainers support FTMS but also expose the proprietary Wahoo trainer service. Start FTMS-only; fall back to Wahoo-specific only if FTMS misbehaves. Flag this for the PITFALLS.md research file.

**Confidence:** HIGH on "no library, do it yourself." MEDIUM on exact opcode behavior under Wahoo firmware (expect trial/error — this is explicitly called out in PROJECT.md).

### WebSocket Bridge (Python ↔ React)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `websockets` (aaugustin) | ~13.x | WebSocket server inside the asyncio process | Tiny, async-native, zero HTTP baggage. A single `websockets.serve(handler, "localhost", 8765)` call is the entire server. Cleanly shares the asyncio loop with `bleak`. |

**Why NOT FastAPI / Starlette / Uvicorn:**
- FastAPI is a *framework* optimized for REST + OpenAPI. You need **one** WebSocket endpoint on localhost. Dragging in Starlette + Uvicorn + Pydantic-FastAPI-integration is ~20 MB of dependency weight and two extra layers of abstraction for zero gain.
- Starting uvicorn spawns a subprocess/worker model that complicates shared state between the control loop and the WS handler. `websockets` runs in the same loop as `bleak` — control loop and WS broadcaster literally share an `asyncio.Queue` or a single state object.
- FastAPI's dependency injection, request/response cycle, routing, and middleware stack are all dead weight for a single-client local app.

**Why NOT aiohttp:**
- Would work, but bigger than needed and its WebSocket API is slightly more verbose than `websockets`'s.

**Why NOT Socket.IO (`python-socketio`):**
- Adds a transport-negotiation protocol layer for a scenario (localhost, single client, known-good network) where it buys nothing. Use raw WebSockets.

**Bridge pattern (the shape of the code):**
```
┌─ asyncio event loop ──────────────────────────────────────┐
│                                                           │
│   bleak client ──notify──▶ telemetry dataclass (pydantic) │
│                                  │                        │
│                                  ▼                        │
│                          asyncio.Queue                    │
│                                  │                        │
│                                  ▼                        │
│   websockets handler ──json─▶ connected React clients     │
│                                                           │
│   websockets handler ◀──json── "shift_up" / "shift_down"  │
│                                  │                        │
│                                  ▼                        │
│   gearing logic → set_sim_params(grade / gear_factor)     │
│                                  │                        │
│                                  ▼                        │
│   bleak client ──write──▶ FTMS Control Point              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Keep it a single process, single event loop. Do not introduce threads unless a specific bleak callback forces it.

**Confidence:** HIGH. This is the canonical asyncio+BLE+WS pattern.

### Data / Domain

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pydantic` v2 | ~2.9.x | Telemetry + message typing, JSON serialization | v2's Rust core is fast enough for 60 Hz telemetry. Gives you one schema definition usable for validation, serialization, and (via `pydantic-to-typescript` or manual export) TS types in the UI. |
| `gpxpy` | ~1.6.x | Load/parse GPX route files, compute grade between points | De-facto standard; minimal deps. For grade you'll post-process (smoothing over ~50–100 m) — gpxpy gives you raw points, not grades. |
| `numpy` (optional) | ~2.x | Fast grade smoothing, resampling | Only pull in once you actually implement route-following. Overkill for MVP virtual-gearing. |

### Tooling

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| Python | 3.12+ | Runtime | `asyncio.TaskGroup`, better error groups, `typing.override`, mature bleak support. Avoid 3.13 unless all deps confirmed (check pyobjc on 3.13 at install time). |
| `uv` | ~0.4+ | Env + deps + lockfile | ~10–100× faster than pip/poetry, single tool, reproducible installs. Replaces pyenv + poetry + pip. |
| `ruff` | ~0.6+ | Lint + format | Replaces black + flake8 + isort. Fast enough to run on save. |
| `mypy` or `pyright` | latest | Type checking | Pyright is faster; either works. Critical because FTMS bitfields are easy to get wrong silently. |
| `pytest` + `pytest-asyncio` | latest | Tests, including fake BLE peripheral | You will want to mock bleak for unit tests. |

### Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `Node.js` | 20 LTS or 22 LTS | JS runtime for Vite | 20 LTS is the safe default through 2026. |
| `pnpm` | ~9.x | Package manager | Faster than npm, stricter than yarn, lockfile-first. |
| `Vite` | 5.x (or 6.x if stable at install time) | Dev server + bundler | HMR in <100 ms, native ESM dev, tiny production build. The right default for a React SPA local app. No reason to use Next.js (no SSR, no routing server, no deployment model). |
| `React` | 18.x | UI | Required by project. Use function components + hooks. Consider `React Compiler` (RC) once it stabilizes — it auto-memoizes, which helps with 60 Hz streams. |
| `TypeScript` | 5.5+ | Type safety | Non-negotiable for a WS contract that crosses process boundaries. |
| `Tailwind CSS` | 3.4.x (or 4.x if you accept churn) | Styling | Required by project. 4.x has a new engine; 3.4.x is more stable for 2025 — recommend 3.4.x unless you want to chase 4.x. |
| `zustand` | 4.x | Client state | Keeps the 60 Hz telemetry out of React's reconciliation for non-subscribed components. A naive `useState` on the top component would re-render the whole tree 60×/s. |
| `uplot` + `uplot-react` | 1.6.x | High-performance live charts (Phase 2+) | Literally designed for 60 fps time-series. Recharts/Chart.js will stutter. |
| `clsx` | ~2.x | Conditional classNames | 300-byte utility, universally used with Tailwind. |

**Why NOT:**
- **Next.js / Remix** — server-side framework; you have no server. Overkill.
- **Create React App** — deprecated; Vite replaces it.
- **Redux Toolkit** — too much boilerplate for a single-client app. Zustand is enough.
- **MUI / Chakra / shadcn** — Tailwind + hand-rolled is faster for a cockpit UI where every pixel matters. Consider `shadcn/ui` only if you want a starting component kit; don't pull a full library.
- **Electron / Tauri (for MVP)** — run the UI in a browser tab pointed at `localhost:5173`. Packaging comes later (see below).

**Confidence:** HIGH on Vite + React + Tailwind + zustand. MEDIUM on Tailwind 3 vs 4 (verify Tailwind 4 status when you start).

### Packaging / Running (Later Phase)

Not MVP-critical — listed for roadmap awareness:

| Option | When | Notes |
|--------|------|-------|
| Browser tab + `python main.py` | MVP | Simplest. Two terminals, done. |
| `Makefile` / `justfile` | MVP polish | One command to start backend + frontend. |
| `PyInstaller` or `briefcase` | If you want double-clickable backend | macOS signing is painful but tractable. |
| `Tauri` | If you want one native .app | Would wrap the Vite build and ideally embed the Python process; adds Rust toolchain. **Defer.** |
| `Electron` | — | Do not use. Heavy, no benefit over Tauri. |

---

## macOS-Specific BLE Considerations

These are load-bearing — a bad mac-BLE setup wastes days.

1. **CoreBluetooth backend is automatic in bleak.** You write the same code as on Linux; bleak picks CoreBluetooth on Darwin.

2. **macOS advertises devices by a system-assigned UUID, not their BLE MAC address.** This is a CoreBluetooth quirk, not a bleak bug. Consequence:
   - Do not hardcode a MAC. Store the **UUID** after first pairing, or scan by **device name** / advertised service UUID (`0x1826`).
   - The same KICKR will appear under a different UUID on a different Mac.

3. **TCC / Bluetooth permission prompt.** On first run, macOS will prompt for Bluetooth access for whatever binary launches bleak (Terminal, iTerm, VS Code, your packaged app). If you skip the prompt or deny it, bleak silently returns no devices. Check System Settings → Privacy & Security → Bluetooth.

4. **Running from an IDE vs terminal matters.** The permission is granted per parent process. If you scan fine from Terminal but not from VS Code's integrated terminal, that's why — grant it to VS Code too.

5. **No raw advertising data on macOS.** CoreBluetooth sanitizes advertising packets. Manufacturer data and some raw bytes are unavailable that you *would* get on Linux/BlueZ. Relevant because reverse-engineering the Zwift Click may be harder here than on a Linux box with BlueZ + `btmon`. Consider doing Click sniffing with nRF Connect on mobile (the project already plans this).

6. **Bluetooth flakiness after sleep/wake.** Known macOS behavior. Design the control loop to handle `BleakError` on any operation and re-scan + reconnect. Do not assume a connection survives a display sleep.

7. **Connection parameters are not user-controllable on macOS.** Unlike Linux, you can't tune connection interval from userland. Live with whatever CoreBluetooth negotiates. For FTMS (5–10 Hz updates) this is fine.

8. **No "unpair" API from Python.** If things get wedged, the user unpairs manually via System Settings Bluetooth panel.

**Confidence:** HIGH — these are well-known, long-standing macOS/CoreBluetooth behaviors reflected in bleak's docs and issue tracker over years.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| BLE library | `bleak` | `pygatt` | Linux-only (BlueZ) |
| BLE library | `bleak` | `bluepy` | Linux-only, unmaintained |
| BLE library | `bleak` | Node.js `@abandonware/noble` | PROJECT.md already decided against; less stable on macOS |
| WS server | `websockets` | `FastAPI` + `uvicorn` | Framework overhead, two-process model complicates shared state |
| WS server | `websockets` | `aiohttp` | Works, but heavier for a single endpoint |
| WS server | `websockets` | `python-socketio` | Transport negotiation is unnecessary on localhost |
| Async runtime | `asyncio` | `trio` / `anyio` | `bleak` is asyncio-native; swapping buys nothing |
| Bundler | `Vite` | `Next.js` | No server, no SSR; don't need it |
| Bundler | `Vite` | `Webpack` / `CRA` | Slower DX, CRA deprecated |
| State | `zustand` | `Redux Toolkit` | Overkill for single-user local app |
| State | `zustand` | `Context + useReducer` | Will re-render too much at 60 Hz |
| Styling | `Tailwind` | `CSS Modules` / `styled-components` | Slower iteration for cockpit UI |
| FTMS | hand-roll | `pycycling` as runtime dep | Too thin/stale for production; read source, don't depend |
| Py package manager | `uv` | `poetry` | uv is faster and has won the 2024–2025 cycle |
| Py package manager | `uv` | `pip + requirements.txt` | No lockfile determinism |

---

## Installation (Recommended Commands)

> Versions below are indicative targets. Verify latest at install time — confidence on exact pins is MEDIUM because external verification was unavailable in this research pass.

### Backend

```bash
# uv handles Python install + venv + deps
uv init
uv python install 3.12
uv add bleak pydantic gpxpy websockets
uv add --dev pytest pytest-asyncio ruff pyright

# Run
uv run python -m rideos
```

### Frontend

```bash
# In a separate directory, e.g. ui/
pnpm create vite@latest ui -- --template react-ts
cd ui
pnpm add zustand clsx
pnpm add -D tailwindcss@3 postcss autoprefixer
pnpm dlx tailwindcss init -p

# Run
pnpm dev   # Vite on http://localhost:5173
```

### Combined (optional)

```bash
# justfile (or Makefile)
dev:
    honcho start -f Procfile.dev

# Procfile.dev
backend: uv run python -m rideos
frontend: cd ui && pnpm dev
```

---

## Open Questions / Verify At Install Time

These are MEDIUM-confidence pins that you should re-check on the day you install — web verification was unavailable during this research pass.

- [ ] Latest stable `bleak` version (expect 0.22.x, but confirm).
- [ ] Latest stable `websockets` version (expect 13.x).
- [ ] Latest stable `pydantic` v2 version.
- [ ] `pyobjc-framework-CoreBluetooth` compatibility on macOS 14 / 15 / (26?) and Python 3.13.
- [ ] Tailwind v4 production-ready? If yes, reassess vs 3.4.x.
- [ ] Vite 6 stable? If yes, default to it; otherwise Vite 5.
- [ ] React Compiler (RC) stability — nice-to-have for 60 Hz rendering.
- [ ] `uv`'s workspace support for combined Python+UI monorepo layout.

---

## Sources

External verification tools (WebSearch, Context7, WebFetch) were not available in this research pass; this document is derived from training data through May 2025 plus first-principles reasoning about the asyncio + bleak + WebSocket bridge pattern.

- `bleak` — https://github.com/hbldh/bleak (official repo; CoreBluetooth backend documented)
- `websockets` — https://websockets.readthedocs.io/ (aaugustin; asyncio-native server)
- `pydantic` v2 — https://docs.pydantic.dev/latest/
- `uv` — https://docs.astral.sh/uv/
- `Vite` — https://vitejs.dev/
- `zustand` — https://github.com/pmndrs/zustand
- `gpxpy` — https://github.com/tkrajina/gpxpy
- FTMS spec — Bluetooth SIG, "Fitness Machine Service" (GATT Specification Supplement)
- macOS CoreBluetooth UUID behavior — Apple CoreBluetooth docs + bleak issue tracker (longstanding)

**Recommendation:** Before committing to pinned versions in `pyproject.toml` / `package.json`, run a quick WebSearch/Context7 pass on the starred libraries above to confirm current stable versions, since this research pass could not access live sources.
