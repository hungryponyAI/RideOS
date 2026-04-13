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
