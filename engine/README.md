# RideOS Engine

Local Python engine for RideOS. Owns the BLE connection to the Wahoo KICKR Core and parses FTMS Indoor Bike Data.

## Setup

```bash
cd engine
uv sync --extra dev
```

## Run the macOS BLE permission diagnostic first

```bash
uv run python scan.py
```

If the scan returns 0 devices with Bluetooth on and the trainer powered, grant the terminal app Bluetooth access:
System Settings > Privacy & Security > Bluetooth > enable Terminal / iTerm2.

## Run tests

```bash
uv run python -m pytest tests/ -q
```

## Run the engine (Phase 1)

With the KICKR Core powered on and paired to no other app:

```bash
cd engine
uv run python -m engine
```

You should see:

- `KICKR not found; retrying in 1.0s` if the trainer is off — backoff doubles up to 60s.
- `Connecting to KICKR CORE` once found, then `TELEMETRY | speed=... power=... cadence=...` lines while you pedal.
- Unplug/replug the trainer: the engine stays running, logs the disconnect, rescans with backoff, reattaches.

Press Ctrl-C to shut down cleanly.

Phase 1 manual smoke test:
1. `uv run python scan.py` — confirms macOS Bluetooth permission.
2. `uv run python -m engine` — confirms live telemetry.
3. While running, physically unplug the KICKR's USB/power and replug — confirm reconnect.

## Run the engine (Phase 2)

Same command — Phase 2 adds virtual gearing, resistance control, and INFRA-02 safe shutdown:

```bash
cd engine
uv run python -m engine
```

**Configuring simulated grade:**
Edit the `DEFAULT_GRADE` constant at the top of `engine/engine/main.py` (default: `2.0 %`).
Phase 4 GPX replaces this with per-tick values from the route file.

**Keyboard controls:**
- `k` or `↑` (Up arrow) — shift up (harder, higher effective grade)
- `j` or `↓` (Down arrow) — shift down (easier, lower effective grade)
- Arrows arrive as 3-byte ESC sequences (`ESC [ A` / `ESC [ B`); `k`/`j` are the fallback.

**Log lines to watch:**
- `RIDE | gear=N/10 factor=X.XXX real=Y.X%% eff=Z.X%%` — printed every 5 s; shows current gear, factor, and effective grade sent to trainer.
- `Shift up → gear N` / `Shift down → gear N` — on each key press.
- `FTMS handshake complete; control loop may begin` — trainer accepted control.

**Safe shutdown:**
Press `Ctrl-C`. The engine sends FTMS Stop + Reset before disconnecting, returning the trainer to free-roll. Final log shows both opcodes.
`kill -9` bypasses the safe shutdown path (known limitation — trainer may stay at last set grade until powered off).

Phase 2 manual smoke test:
1. `uv run python -m engine` with KICKR powered on — confirm `FTMS handshake complete`.
2. Pedal; confirm `RIDE |` log lines with effective grade.
3. Press `k`/`j` — confirm gear + effective grade change in logs.
4. Ctrl-C — confirm final log shows STOP + RESET opcodes; trainer returns to free-roll.
5. Unplug/replug KICKR mid-ride — confirm backoff logs then reconnect + control loop resumption.
