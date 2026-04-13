"""BLE discovery for the Wahoo KICKR Core.

Strategy: try device name first (most reliable when the KICKR advertises
its canonical name), then fall back to an FTMS service UUID filter for the
case where the name is missing or changed by user configuration.

macOS note (RESEARCH.md Pitfall 2, Anti-Patterns):
  - Never scan by MAC address (CoreBluetooth exposes UUIDs, not MACs).
  - Never pass scanning_mode="passive" (raises BleakError on macOS).
  - Never pass adapter= (deprecated; only one adapter on macOS).
"""
from __future__ import annotations

from typing import Optional

from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

KICKR_NAME: str = "KICKR CORE"
FTMS_SERVICE_UUID: str = "00001826-0000-1000-8000-00805f9b34fb"


def _advertises_ftms(device: BLEDevice, adv: AdvertisementData) -> bool:
    """Predicate for BleakScanner.find_device_by_filter."""
    return FTMS_SERVICE_UUID in (adv.service_uuids or [])


async def find_kickr(
    scanner_cls: type[BleakScanner] = BleakScanner,
    timeout: float = 10.0,
) -> Optional[BLEDevice]:
    """Discover the KICKR Core by name, falling back to FTMS service UUID.

    Args:
        scanner_cls: Injected for unit tests. Production callers omit it.
        timeout: Scan timeout in seconds for EACH strategy (total up to 2x).

    Returns:
        The first matching BLEDevice, or None if neither strategy hits.
    """
    device = await scanner_cls.find_device_by_name(KICKR_NAME, timeout=timeout)
    if device is not None:
        return device

    device = await scanner_cls.find_device_by_filter(
        _advertises_ftms, timeout=timeout
    )
    return device
