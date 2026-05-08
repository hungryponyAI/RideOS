"""BLE replay fixture: a FakeBleakClient that emits pre-recorded IBD notifications.

Usage in tests::

    client = ReplayBleakClient(frames=SAMPLE_RIDE_FRAMES, interval_s=0.25)
    await client.connect()
    # ... use client as a stand-in for BleakClient

The replay fires notifications at the configured interval, mimicking the real
KICKR sending IBD data at 4 Hz. After all frames are exhausted the client
continues firing the last frame (freeze-last strategy, matching real hardware
that keeps sending when the rider stops pedalling).
"""
from __future__ import annotations

import asyncio
import struct
from typing import Callable


# ---------------------------------------------------------------------------
# IBD packet builder helpers (matches conftest.py format)
# ---------------------------------------------------------------------------

def _ibd_speed_power_cadence(
    speed_kmh: float, power_w: int, cadence_rpm: float
) -> bytes:
    """Build a minimal IBD packet with speed + cadence + power present."""
    flags = 0x0044  # bit 2 (cadence) | bit 6 (power); bit 0 clear → speed present
    raw_speed = int(speed_kmh * 100)
    raw_cadence = int(cadence_rpm * 2)
    return (
        struct.pack("<H", flags)
        + struct.pack("<H", raw_speed)
        + struct.pack("<H", raw_cadence)
        + struct.pack("<h", power_w)
    )


def _ibd_coasting() -> bytes:
    """IBD packet with speed=0, power=0, cadence=0 (rider stopped)."""
    return _ibd_speed_power_cadence(0.0, 0, 0.0)


# ---------------------------------------------------------------------------
# Sample ride: 30 seconds at 4 Hz = 120 frames
# ---------------------------------------------------------------------------
# Ramp up 0-30 km/h, hold, ramp down. Power varies with speed.

def _build_sample_ride_frames(duration_s: float = 30.0, hz: float = 4.0) -> list[bytes]:
    """Generate a synthetic 30-second ride at 4 Hz."""
    n = int(duration_s * hz)
    frames: list[bytes] = []
    for i in range(n):
        t = i / hz  # seconds into ride
        if t < 5:
            speed = t * 6.0          # 0 → 30 km/h in 5 s
        elif t < 20:
            speed = 30.0
        else:
            speed = 30.0 - (t - 20) * 3.0  # ramp down
        speed = max(0.0, speed)
        power = int(speed * 7)       # rough estimate: 210 W at 30 km/h
        cadence = int(75 + speed / 2) if speed > 5 else 0
        frames.append(_ibd_speed_power_cadence(speed, power, float(cadence)))
    return frames


SAMPLE_RIDE_FRAMES: list[bytes] = _build_sample_ride_frames()


# ---------------------------------------------------------------------------
# ReplayBleakClient
# ---------------------------------------------------------------------------

IBD_UUID = "00002ad2-0000-1000-8000-00805f9b34fb"


class ReplayBleakClient:
    """Stand-in for BleakClient that replays pre-recorded IBD notification frames.

    Fires frames at `interval_s` intervals. After all frames are played back,
    keeps firing the final frame (freeze-last). Stops when stop_event is set.
    """

    def __init__(
        self,
        *,
        frames: list[bytes] | None = None,
        interval_s: float = 0.25,
        stop_event: asyncio.Event | None = None,
    ) -> None:
        self._frames = frames if frames is not None else SAMPLE_RIDE_FRAMES
        self._interval_s = interval_s
        self._stop_event = stop_event or asyncio.Event()
        self._notify_cbs: dict[str, Callable] = {}
        self._replay_task: asyncio.Task | None = None
        self.connected = False
        # Record writes like FakeBleakClient for assertions
        self.writes: list[tuple[str, bytes, bool]] = []

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *_):
        await self.disconnect()

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False
        if self._replay_task is not None and not self._replay_task.done():
            self._replay_task.cancel()
            try:
                await self._replay_task
            except (asyncio.CancelledError, Exception):
                pass

    async def start_notify(self, uuid: str, callback: Callable) -> None:
        self._notify_cbs[uuid] = callback
        if uuid == IBD_UUID and self._replay_task is None:
            self._replay_task = asyncio.create_task(
                self._replay_loop(callback), name="ble_replay"
            )

    async def stop_notify(self, uuid: str) -> None:
        self._notify_cbs.pop(uuid, None)

    async def write_gatt_char(self, uuid: str, data, *, response: bool = False) -> None:
        self.writes.append((uuid, bytes(data), response))

    async def _replay_loop(self, callback: Callable) -> None:
        for frame in self._frames:
            if self._stop_event.is_set():
                return
            callback(None, bytearray(frame))
            await asyncio.sleep(self._interval_s)

        # Freeze-last: keep firing the final frame until stop_event
        if self._frames:
            last = self._frames[-1]
            while not self._stop_event.is_set():
                callback(None, bytearray(last))
                await asyncio.sleep(self._interval_s)
