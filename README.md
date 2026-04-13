# RideOS

A custom indoor cycling app for the Wahoo KICKR Core — reads live speed, power, and cadence over Bluetooth and displays them in a cockpit UI.

---

## What you need

- **Mac** (macOS 12 or newer)
- **Wahoo KICKR Core** trainer, powered on and not connected to any other app (Wahoo Fitness, Zwift, etc.)
- **Python 3.12+** — check with `python3 --version`
- **uv** (Python package manager) — install once with:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

---

## First-time setup

```bash
cd engine
uv sync --extra dev
```

This downloads all dependencies into a local `.venv` folder. Takes ~30 seconds on first run.

---

## Step 1 — Fix Bluetooth permissions (do this once)

macOS blocks Bluetooth access by default. Run the scanner to check:

```bash
cd engine
uv run python scan.py
```

**If you see devices listed** — permissions are fine, skip to Step 2.

**If you see an empty list** (or an error about Bluetooth):
1. Open **System Settings → Privacy & Security → Bluetooth**
2. Find your terminal app (Terminal, iTerm2, Warp, etc.) in the list
3. Toggle it **on**
4. Run `uv run python scan.py` again — you should see your KICKR listed

---

## Step 2 — Start the engine

Make sure the KICKR is powered on, then:

```bash
cd engine
uv run python -m engine
```

**What you'll see while it's searching:**
```
... KICKR not found; retrying in 1.0s
... KICKR not found; retrying in 2.0s
```
(The wait doubles each retry up to 60s — just wait.)

**What you'll see once it connects and you start pedaling:**
```
... Connecting to KICKR CORE
... Subscribed to FTMS Indoor Bike Data; awaiting data...
... TELEMETRY | speed= 22.1 km/h  power= 189 W  cadence= 88.0 rpm
... TELEMETRY | speed= 22.3 km/h  power= 193 W  cadence= 89.0 rpm
```

Press **Ctrl-C** to stop cleanly.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "KICKR not found" forever | Trainer is off, or another app (Wahoo/Zwift) has it. Close other apps, power-cycle the trainer. |
| Empty scan.py output | Grant Bluetooth permission to your terminal — see Step 1. |
| `uv: command not found` | Re-open your terminal after installing uv, or run `source ~/.zshrc`. |
| Speed/cadence shows 0 but power works | Normal at a standstill — start pedaling. |
| Engine crashes on connect | Update macOS. BLE stack bugs exist in early macOS 12 releases. |

---

## Run the tests

```bash
cd engine
uv run python -m pytest tests/ -q
```

All 17 tests should pass with no failures.

---

## Project structure

```
engine/          Python BLE engine (this is what you run)
  engine/        Source code
    ble/         BLE scanner + client + reconnect logic
    ftms/        FTMS protocol parser (bytes → speed/power/cadence)
    main.py      Entry point
  tests/         Unit tests
  scan.py        macOS Bluetooth permission diagnostic
vault/RideOS/    Project notes and design decisions (Obsidian)
.planning/       Development roadmap and phase plans
```
