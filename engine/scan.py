"""RideOS engine/scan.py — macOS Bluetooth permission + KICKR discovery diagnostic.

Run this BEFORE any engine code on a fresh machine. Silent permission blocks
on macOS CoreBluetooth return an empty scan with no exception (bleak docs +
RESEARCH.md Pitfall 1).

Usage:
    cd engine
    uv run python scan.py
"""
from __future__ import annotations

import asyncio
import sys

from bleak import BleakError, BleakScanner

FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb"
KICKR_NAME_PREFIX = "KICKR"


def _print_permission_hint() -> None:
    print("")
    print("No BLE devices found in 5 seconds.")
    print("If Bluetooth is ON and devices are nearby, this is almost certainly")
    print("a macOS CoreBluetooth permission block for the shell.")
    print("")
    print("Fix:")
    print("  System Settings > Privacy & Security > Bluetooth")
    print("  Enable access for your terminal app (Terminal, iTerm2, Ghostty, ...).")
    print("")
    print("Then re-run:  uv run python scan.py")


async def main() -> int:
    print("Scanning BLE for 5 seconds...")
    try:
        devices_and_adv = await BleakScanner.discover(
            timeout=5.0, return_adv=True
        )
    except BleakError as exc:
        print(f"BleakError during scan: {exc}", file=sys.stderr)
        print("Likely cause: Bluetooth permission not granted to this shell.")
        return 2

    if not devices_and_adv:
        _print_permission_hint()
        return 1

    kickr_hits: list[str] = []
    ftms_hits: list[str] = []

    print(f"Found {len(devices_and_adv)} device(s):")
    for address, (device, adv) in devices_and_adv.items():
        name = device.name or "(no name)"
        service_uuids = list(adv.service_uuids or [])
        ftms_flag = "[FTMS]" if FTMS_SERVICE_UUID in service_uuids else ""
        print(f"  {name:30s}  {address}  rssi={adv.rssi} {ftms_flag}")

        if name.upper().startswith(KICKR_NAME_PREFIX):
            kickr_hits.append(name)
        if FTMS_SERVICE_UUID in service_uuids:
            ftms_hits.append(name)

    print("")
    if kickr_hits:
        print(f"KICKR detected by name: {kickr_hits}")
    if ftms_hits:
        print(f"FTMS advertisers detected: {ftms_hits}")
    if not kickr_hits and not ftms_hits:
        print(
            "No KICKR / FTMS advertiser found in this scan. "
            "Confirm the trainer is powered and not paired to another app."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
