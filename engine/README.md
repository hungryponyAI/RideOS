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
