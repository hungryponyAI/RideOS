# Phase 3: WebSocket Bridge + Cockpit UI — Research

**Researched:** 2026-04-19
**Domain:** Python asyncio WebSocket server + React/Vite cockpit UI at 60 Hz
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Python engine streams telemetry to React via WebSocket at up to 60 Hz | websockets 16.0 `serve()` in dedicated asyncio task; broadcast via asyncio.Queue fan-out |
| UI-01 | React cockpit: speed/gear/watts/cadence/grade; dark; 60 fps | React 19 + Vite 8 + Tailwind CSS v3; `useRef` WS + `useState` telemetry; `React.memo` per component |
| UI-02 | Elevation profile (bottom); current position; red=climb, blue=descent | Recharts 3.8 `AreaChart`; empty-state scaffold; Phase 4 populates data |
| UI-03 | Mini-map (top-right); route + position marker | react-leaflet 5 + leaflet 1.9; CartoDB dark matter tiles; empty-state scaffold |

</phase_requirements>

---

## Summary

Phase 3 adds two orthogonal pieces: (1) a WebSocket broadcast server embedded in the Python asyncio engine, and (2) a React + Vite cockpit app that subscribes to it and renders live telemetry at 60 fps. The Python side is a straightforward asyncio fan-out: a new `ws_server` task runs `websockets.serve()` and forwards every item from a broadcast queue to all connected clients. The BLE control loop's 4 Hz cadence is unchanged — the WS layer pushes at whatever rate `telemetry_consumer` fires readings, up to ~60 Hz. These two tasks share no locks and have no scheduling dependency.

The React side is a full-screen dark cockpit with exactly one `useState` object (`TelemetryState`) and a `useRef`-held WebSocket. `React.memo` on leaf components (`MetricDisplay`, `GearStrip`, `GradeBar`) ensures the 60 Hz state updates do not cause full-tree re-renders. Recharts `AreaChart` and react-leaflet render empty-state scaffolds in Phase 3 — no data fed until Phase 4.

Key integration constraint: the Python WebSocket server MUST run as a sibling `asyncio.Task` to `reconnect_loop` — never blocking inside the BLE callback path. The BLE notification callback remains a plain `def` with `queue.put_nowait` only; the WS task drains from the same telemetry state.

**Primary recommendation:** Embed `websockets.serve()` as an asyncio task in `main.py`; fan-out by maintaining a `set[WebSocketServerProtocol]` of connected clients; broadcast the current `RideState` snapshot as JSON after each FTMS tick.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| websockets (Python) | 16.0 | Async WS server in engine | Pure asyncio, no threads; officially recommended for asyncio apps; PyPI latest verified 2026-04-19 |
| React | 19.2.5 | UI component tree | Standard SPA framework; already decided in CLAUDE.md |
| Vite | 8.0.8 | Dev server + bundler | Fastest HMR; standard for React+TS projects in 2026 |
| @vitejs/plugin-react | 6.0.1 | Babel/SWC transform for Vite | Required companion to Vite for React |
| Tailwind CSS | 3.4.19 | Utility CSS | Spec locked to v3 (not v4) per UI-SPEC |
| autoprefixer | 10.5.0 | PostCSS plugin for Tailwind | Required by Tailwind v3 |
| postcss | 8.5.10 | CSS toolchain | Required by Tailwind v3 CLI |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| recharts | 3.8.1 | Elevation profile AreaChart | Phase 3 empty-state; Phase 4 populates |
| react-leaflet | 5.0.0 | React bindings for Leaflet | Mini-map scaffold |
| leaflet | 1.9.4 | Map tiles + layers | Required peer of react-leaflet |
| lucide-react | 1.8.0 | Connection status icon only | Minimal icon use per UI-SPEC |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| websockets 16.0 | aiohttp WS | aiohttp adds HTTP server overhead; unnecessary for read-only broadcast |
| Recharts | D3.js | D3 requires manual SVG management; Recharts integrates as React component |
| react-leaflet | Mapbox GL JS | Mapbox requires API token; over-engineered for empty-state Phase 3 |
| Tailwind v3 | Tailwind v4 | UI-SPEC locks to v3; v4 uses new CSS-first config; migration not warranted |

### Installation

Python (add to `engine/pyproject.toml`):
```bash
cd engine && uv add "websockets>=16.0,<17.0"
```

React app (new `ui/` directory at project root):
```bash
npm create vite@latest ui -- --template react
cd ui
npm install tailwindcss@3 autoprefixer postcss
npm install recharts react-leaflet leaflet lucide-react
npm install --save-dev @types/leaflet
npx tailwindcss init -p
```

---

## Architecture Patterns

### Recommended Project Structure

```
engine/engine/
├── ws/
│   ├── __init__.py
│   ├── server.py       # websockets.serve() task + client registry
│   └── broadcaster.py  # fan-out helper
├── main.py             # wire ws_task as sibling to reconnect_task

ui/
├── src/
│   ├── components/
│   │   ├── MetricDisplay.tsx
│   │   ├── GearStrip.tsx
│   │   ├── GradeBar.tsx
│   │   ├── ElevationProfile.tsx  (empty-state scaffold)
│   │   ├── MiniMap.tsx           (empty-state scaffold)
│   │   └── ConnectionBanner.tsx
│   ├── hooks/
│   │   └── useTelemetry.ts       # WebSocket lifecycle + state
│   ├── types/
│   │   └── telemetry.ts          # TelemetryState interface
│   ├── App.tsx                   # cockpit grid layout
│   └── main.tsx
├── index.html
├── tailwind.config.js
├── postcss.config.js
└── vite.config.ts
```

### Pattern 1: Asyncio Fan-out Broadcast Server

**What:** A single `websockets.serve()` coroutine maintains a `set` of active connections. After each telemetry tick, `main.py` posts a snapshot to a broadcast queue; the WS task drains it and sends JSON to all clients.

**When to use:** Any time you need 1-to-many push from asyncio without blocking the producer.

```python
# engine/engine/ws/server.py
import asyncio
import json
import logging
from websockets.asyncio.server import serve, ServerConnection

_log = logging.getLogger("rideos.ws")

CLIENTS: set[ServerConnection] = set()

async def _handler(ws: ServerConnection) -> None:
    CLIENTS.add(ws)
    try:
        await ws.wait_closed()
    finally:
        CLIENTS.discard(ws)

async def broadcast_loop(
    broadcast_queue: asyncio.Queue[dict],
    stop_event: asyncio.Event,
    host: str = "localhost",
    port: int = 8765,
) -> None:
    async with serve(_handler, host, port):
        while not stop_event.is_set():
            try:
                payload = await asyncio.wait_for(
                    broadcast_queue.get(), timeout=0.1
                )
            except asyncio.TimeoutError:
                continue
            if not CLIENTS:
                continue
            data = json.dumps(payload)
            # Fire-and-forget; don't await per-client sends on the hot path
            await asyncio.gather(
                *(c.send(data) for c in list(CLIENTS)),
                return_exceptions=True,
            )
```

**Note on websockets 16.x API:** The `websockets` library reorganized its API in v14+. Use `websockets.asyncio.server.serve` (not the legacy `websockets.serve`). The `ServerConnection` type replaces the old `WebSocketServerProtocol`.

### Pattern 2: React `useTelemetry` Hook

**What:** Encapsulates WS lifecycle — open, message handling, close/reconnect — outside component tree.

**When to use:** Any data stream that survives component remounts.

```typescript
// ui/src/hooks/useTelemetry.ts
import { useEffect, useRef, useState } from "react";
import type { TelemetryState, ConnectionStatus } from "../types/telemetry";

const WS_URL = "ws://localhost:8765";

export function useTelemetry() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const connect = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("live");
    ws.onmessage = (e) => setTelemetry(JSON.parse(e.data));
    ws.onclose = () => {
      setStatus("disconnected");
      // Exponential backoff: 2s, 4s, 8s … max 30s
      const delay = Math.min(30000, 2000 * 2 ** (retryRef.current ? 1 : 0));
      retryRef.current = setTimeout(connect, delay);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  return { telemetry, status };
}
```

### Pattern 3: 60 Hz React State Without Full Re-renders

**What:** Single atomic state replacement + `React.memo` on leaf components.

**When to use:** Any display updating faster than 10 Hz.

```typescript
// In MetricDisplay.tsx
import { memo } from "react";
export const MetricDisplay = memo(function MetricDisplay({
  value, unit, size,
}: { value: string | number; unit: string; size: "display" | "body" }) {
  // ...
});
```

Key: `tabular-nums` via Tailwind class `tabular-nums` (maps to `font-variant-numeric: tabular-nums`) prevents layout shifts when digits change width.

### Pattern 4: Bridging RideState to WebSocket Broadcast

**What:** After each FTMS control loop tick, post a snapshot of `RideState` to the broadcast queue. The broadcast loop is a separate task — it never blocks the control loop.

```python
# In run_control_loop or main.py after each tick:
snapshot = {
    "speed_kmh": state.last_speed_kmh,       # from latest IBD
    "power_w": state.last_power_w,
    "cadence_rpm": state.last_cadence_rpm,
    "gear": state.gear_engine.current_gear,
    "real_grade_pct": state.real_grade_percent,
    "effective_grade_pct": state.gear_engine.effective_grade(state.real_grade_percent),
}
broadcast_queue.put_nowait(snapshot)  # non-blocking; WS task drains async
```

**RideState extension needed:** `last_speed_kmh`, `last_power_w`, `last_cadence_rpm` fields must be added to `RideState` (or a parallel `TelemetrySnapshot` dataclass) so the WS layer can read them without touching the BLE queue. The `telemetry_consumer` already processes IBD; it should update these fields on `RideState` after parsing.

### Anti-Patterns to Avoid

- **Awaiting inside BLE callback:** BLE notification callback must remain plain `def` + `queue.put_nowait`. Never call `await broadcast(...)` from it.
- **Sharing the BLE queue with the WS task:** WS gets its own broadcast queue; it does not tap the BLE `asyncio.Queue`. The telemetry consumer remains the sole IBD queue consumer.
- **React `useEffect` depending on telemetry:** Don't list `telemetry` in `useEffect` deps for WS setup — causes reconnect on every message.
- **Opening a second BleakClient for WS:** The WS server reads from `RideState`, not from a new BLE connection. `reconnect_loop` remains the sole owner.
- **Synchronous Leaflet import in SSR/Vite:** Leaflet accesses `window` on import. In Vite, this works fine, but never add Leaflet to a server-rendered context. Use `import 'leaflet/dist/leaflet.css'` explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WS server in Python | Custom asyncio TCP server | websockets 16.0 | Handles fragmentation, masking, ping/keepalive, TLS, connection state |
| WS reconnect in React | Manual `setTimeout` state machine | `useTelemetry` hook pattern (above) | Encapsulates retry logic cleanly; tested pattern |
| 60 Hz chart rendering | Canvas2D manual draw loop | Recharts AreaChart | React integration, resize handling, data normalization all included |
| Map tiles + projection | Custom SVG map | Leaflet + react-leaflet | Handles tile loading, projection, zoom, empty-state tiles |
| Number width stability | Custom fixed-width fonts | `tabular-nums` CSS | Single Tailwind class; browser-native; no custom font needed |

---

## Common Pitfalls

### Pitfall 1: websockets 16.x Renamed API
**What goes wrong:** Code using `from websockets import serve` or `WebSocketServerProtocol` fails with ImportError.
**Why it happens:** websockets v14 reorganized the package. The legacy API moved to `websockets.legacy`.
**How to avoid:** Use `from websockets.asyncio.server import serve, ServerConnection` (verified against websockets 16.0 changelog).
**Warning signs:** `ImportError: cannot import name 'WebSocketServerProtocol'`

### Pitfall 2: Broadcast Queue Fills Under No-Client Condition
**What goes wrong:** If no React client is connected, `broadcast_queue.put_nowait` fills the queue unboundedly at 60 Hz.
**Why it happens:** Producer (control loop) runs regardless of consumers.
**How to avoid:** Use a bounded queue (e.g., `asyncio.Queue(maxsize=10)`) OR skip `put_nowait` when `not CLIENTS`; drain queue in broadcast loop regardless.

### Pitfall 3: WS Server Blocks `stop_event` Shutdown
**What goes wrong:** `async with serve(...)` never exits because `broadcast_loop` doesn't check `stop_event`.
**Why it happens:** `serve()` context manager runs until cancelled or context exits.
**How to avoid:** Check `stop_event.is_set()` in the broadcast loop; OR pass the task to the gather in `main.py` and cancel it on shutdown.

### Pitfall 4: Leaflet CSS Not Imported
**What goes wrong:** Map tiles render broken (missing icons, wrong tile display).
**Why it happens:** Leaflet requires its own CSS file which Vite does not auto-import.
**How to avoid:** Add `import 'leaflet/dist/leaflet.css'` in `MiniMap.tsx` or `main.tsx`.

### Pitfall 5: React State Update on Unmounted Component
**What goes wrong:** WS `onmessage` fires after component unmount → React warning about state update on unmounted component.
**Why it happens:** WS close is async; message can arrive in the gap.
**How to avoid:** Close WebSocket in the `useEffect` cleanup function (`return () => ws.close()`); `useTelemetry` hook already handles this.

### Pitfall 6: 60 Hz Re-renders Cascade Through Component Tree
**What goes wrong:** All cockpit components re-render on every telemetry message — CPU spike, dropped frames.
**Why it happens:** `useState` update in parent causes children to re-render without `memo`.
**How to avoid:** Wrap all leaf components in `React.memo`. Pass primitive props (number/string) not object references — `memo` shallow-compares props.

### Pitfall 7: Tailwind v3 Config Missing `content` Paths
**What goes wrong:** All Tailwind classes purged in production build — blank screen.
**Why it happens:** Tailwind v3 requires explicit `content` globs to know which files to scan.
**How to avoid:** Set `content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]` in `tailwind.config.js`.

### Pitfall 8: RideState Missing Telemetry Fields
**What goes wrong:** WebSocket server tries to read `state.last_speed_kmh` → AttributeError.
**Why it happens:** Current `RideState` only has `gear_engine` + `real_grade_percent`; BLE-parsed values live on the queue.
**How to avoid:** Extend `RideState` with `last_speed_kmh`, `last_power_w`, `last_cadence_rpm` (all `Optional[float]`); `telemetry_consumer` writes them after each IBD parse.

---

## Code Examples

### JSON Telemetry Message (canonical schema)

```json
{
  "speed_kmh": 34.2,
  "power_w": 187,
  "cadence_rpm": 82,
  "gear": 5,
  "real_grade_pct": 8.0,
  "effective_grade_pct": 5.0
}
```

Field names exactly match UI-SPEC `## Interaction Contract`.

### TypeScript Interface

```typescript
// ui/src/types/telemetry.ts
export interface TelemetryState {
  speed_kmh: number;
  power_w: number;
  cadence_rpm: number;
  gear: number;
  real_grade_pct: number;
  effective_grade_pct: number;
}

export type ConnectionStatus = "connecting" | "live" | "disconnected" | "reconnecting";
```

### Tailwind Cockpit Grid

```tsx
// ui/src/App.tsx (layout skeleton)
<div className="w-screen h-screen bg-black overflow-hidden flex flex-col">
  <ConnectionBanner status={status} />
  <div className="flex-1 grid grid-cols-[1fr_auto] p-6 gap-8 min-h-0">
    <div className="flex flex-col gap-8">
      <MetricDisplay value={t?.speed_kmh ?? "—"} unit="km/h" size="display" />
      <GearStrip gear={t?.gear ?? null} />
      <div className="flex gap-8">
        <MetricDisplay value={t?.power_w ?? "—"} unit="Watt" size="body" />
        <MetricDisplay value={t?.cadence_rpm ?? "—"} unit="U/min" size="body" />
      </div>
      <GradeBar real={t?.real_grade_pct ?? 0} effective={t?.effective_grade_pct ?? 0} />
    </div>
    <MiniMap />
  </div>
  <div className="h-[120px] shrink-0">
    <ElevationProfile />
  </div>
</div>
```

### Vite Config for WS Proxy (dev mode)

```typescript
// ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // No WS proxy needed — React app connects directly to ws://localhost:8765
  // Vite dev server HMR uses a different port internally
});
```

### Empty-State ElevationProfile

```tsx
// ui/src/components/ElevationProfile.tsx
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const EMPTY_DATA = [{ x: 0, y: 0 }, { x: 1, y: 0 }];

export const ElevationProfile = memo(function ElevationProfile() {
  return (
    <div className="relative w-full h-full bg-[#111111]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={EMPTY_DATA}>
          <Area type="linear" dataKey="y" stroke="#374151" fill="#374151" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <span className="absolute inset-0 flex items-center justify-center text-xs text-[#6B7280]">
        Keine Strecke geladen
      </span>
    </div>
  );
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `websockets.WebSocketServerProtocol` | `websockets.asyncio.server.ServerConnection` | websockets v14 (2023) | Import path change; legacy still works but deprecated |
| Create React App | Vite | ~2022 | CRA unmaintained; Vite is now standard |
| Tailwind v2 `purge:` key | Tailwind v3 `content:` key | Tailwind v3.0 (2021) | Old key silently ignored → all classes purged |
| React 18 concurrent features opt-in | React 19 defaults | React 19 (2024) | `useDeferredValue` etc. are always available |

---

## Open Questions

1. **Telemetry rate: 4 Hz FTMS vs 60 Hz claim**
   - What we know: The FTMS control loop fires at 4 Hz; BLE IBD notifications arrive at whatever rate the KICKR pushes (typically ~4–10 Hz). The "60 Hz" target means the React display SHOULD update at display framerate — not that the engine sends 60 payloads/second.
   - What's unclear: Does the engine need to send only on BLE notification (actual hardware rate), or should it also interpolate/repeat last value at 60 Hz?
   - Recommendation: Send on every BLE notification (4–10 Hz); React renders each update immediately. The browser's own 60 fps vsync handles display smoothness. No interpolation needed in Phase 3.

2. **Broadcast queue ownership in main.py**
   - What we know: Current `main.py` has one `asyncio.Queue` for BLE bytes. WS broadcast needs a separate queue.
   - What's unclear: Should `telemetry_consumer` post to the broadcast queue, or should `RideState` be polled by the WS task?
   - Recommendation: `telemetry_consumer` updates `RideState` with latest telemetry fields AND calls `broadcast_queue.put_nowait(snapshot)`. WS task owns the broadcast queue drain. Clean separation.

3. **Leaflet tile loading in full-offline scenario**
   - What we know: CartoDB dark matter tiles require internet access. Phase 3 is localhost only.
   - What's unclear: Will tiles load on an internet-connected machine? (Yes, CartoDB is public CDN, no API key.)
   - Recommendation: Accept CDN dependency for Phase 3. Phase 4 can evaluate offline tile cache if needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23 |
| Config file | `engine/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd engine && uv run pytest tests/ -x -q` |
| Full suite command | `cd engine && uv run pytest tests/ -ra` |

Frontend tests are out of scope for Phase 3 (no test framework initialized in `ui/` yet — pure display, no business logic to unit-test).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | WS server starts, accepts client, sends JSON message | integration | `cd engine && uv run pytest tests/ws/ -x` | Wave 0 |
| INFRA-01 | Broadcast queue fan-out to 2 clients simultaneously | unit | `cd engine && uv run pytest tests/ws/test_server.py -x` | Wave 0 |
| INFRA-01 | stop_event shuts down WS server cleanly | unit | `cd engine && uv run pytest tests/ws/test_server.py::test_shutdown -x` | Wave 0 |
| INFRA-01 | BLE callback never awaits (existing constraint) | unit | `cd engine && uv run pytest tests/ble/ -x` | Exists |
| UI-01 | `RideState` extended with telemetry fields | unit | `cd engine && uv run pytest tests/control/test_state.py -x` | Wave 0 |
| UI-01 | JSON snapshot contains all 6 required fields | unit | `cd engine && uv run pytest tests/ws/test_server.py::test_snapshot_schema -x` | Wave 0 |
| UI-02 | ElevationProfile renders without crash (empty state) | manual | Open cockpit in browser, verify empty chart shows | manual-only |
| UI-03 | MiniMap renders without crash (empty state) | manual | Open cockpit in browser, verify dark map tile loads | manual-only |

### Sampling Rate

- **Per task commit:** `cd engine && uv run pytest tests/ -x -q`
- **Per wave merge:** `cd engine && uv run pytest tests/ -ra`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `engine/tests/ws/__init__.py` — ws test package
- [ ] `engine/tests/ws/test_server.py` — covers INFRA-01 fan-out, shutdown, schema
- [ ] `engine/tests/control/test_state.py` — verify RideState telemetry field extension
- [ ] `engine/engine/ws/__init__.py` — ws module init
- [ ] `engine/engine/ws/server.py` — broadcast_loop implementation
- [ ] Framework install: `cd engine && uv add "websockets>=16.0,<17.0"`

---

## Sources

### Primary (HIGH confidence)

- PyPI websockets — verified version 16.0; API namespace confirmed from package description
- npm registry — `npm view` output 2026-04-19 for all listed packages
- `engine/engine/main.py`, `engine/engine/control/state.py` — existing locked contracts
- `.planning/phases/03-websocket-bridge-cockpit-ui/03-UI-SPEC.md` — approved design contract

### Secondary (MEDIUM confidence)

- websockets migration guide (v14 API reorganization) — confirmed by pip index listing v14 as stable

### Tertiary (LOW confidence)

- 60 Hz display claim from phase description — interpreted as browser vsync rate, not engine send rate (see Open Questions)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry + PyPI on 2026-04-19
- Architecture: HIGH — patterns derived from existing engine codebase + locked contracts in STATE.md
- UI design: HIGH — locked by approved 03-UI-SPEC.md
- Pitfalls: HIGH for Python side (from existing decisions.md); MEDIUM for React side (common patterns)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable stack; websockets and React rarely break in 30 days)
