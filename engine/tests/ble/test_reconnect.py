"""Unit tests for engine.ble.reconnect — no real BLE, no wall-clock sleep."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, Callable, List, Optional
from unittest import mock

import pytest

from engine.ble.reconnect import ReconnectConfig, reconnect_loop


class _FakeClient:
    """Minimal BleakClient stand-in: records start/stop_notify calls."""

    def __init__(self) -> None:
        self.started: List[str] = []
        self.stopped: List[str] = []

    async def start_notify(self, uuid: str, _cb) -> None:
        self.started.append(uuid)

    async def stop_notify(self, uuid: str) -> None:
        self.stopped.append(uuid)


def _make_connect(
    client: _FakeClient,
    disconnect_when: Callable[[], Optional[asyncio.Event]] = lambda: None,
):
    """Build an injectable connect_client that yields client, optionally auto-disconnecting."""

    @asynccontextmanager
    async def _cm(device, on_disconnect):
        # Simulate the disconnected_callback firing as soon as control re-enters the loop.
        async def _trigger():
            await asyncio.sleep(0)
            on_disconnect(client)

        task = asyncio.create_task(_trigger())
        try:
            yield client
        finally:
            task.cancel()

    return _cm


@pytest.mark.asyncio
async def test_backoff_doubles_when_device_not_found_and_stops_on_event():
    sleeps: List[float] = []
    stop = asyncio.Event()
    calls = {"count": 0}

    async def never_found() -> Any:
        calls["count"] += 1
        if calls["count"] >= 4:
            stop.set()
        return None

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)

    async def never_connect(device, on_disconnect):  # pragma: no cover
        raise AssertionError("connect_client must not be called when device is None")

    await reconnect_loop(
        queue=asyncio.Queue(),
        find_device=never_found,
        connect_client=never_connect,
        config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
        sleep=fake_sleep,
        stop_event=stop,
    )

    # First three None results: sleep then double; 4th sets stop, loop returns before sleep.
    assert sleeps == [1.0, 2.0, 4.0]


@pytest.mark.asyncio
async def test_backoff_caps_at_max():
    sleeps: List[float] = []
    stop = asyncio.Event()
    calls = {"count": 0}

    async def never_found() -> Any:
        calls["count"] += 1
        if calls["count"] >= 10:
            stop.set()
        return None

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)

    async def never_connect(device, on_disconnect):  # pragma: no cover
        raise AssertionError

    await reconnect_loop(
        queue=asyncio.Queue(),
        find_device=never_found,
        connect_client=never_connect,
        config=ReconnectConfig(initial_backoff=1.0, max_backoff=8.0),
        sleep=fake_sleep,
        stop_event=stop,
    )

    # 1, 2, 4, 8, 8, 8, 8, 8, 8 — capped at max_backoff
    assert sleeps[:4] == [1.0, 2.0, 4.0, 8.0]
    assert all(s == 8.0 for s in sleeps[4:])


@pytest.mark.asyncio
async def test_backoff_resets_after_successful_discovery():
    sleeps: List[float] = []
    stop = asyncio.Event()
    fake_client = _FakeClient()

    sequence: List[Any] = [
        None,                                    # miss → sleep 1
        None,                                    # miss → sleep 2
        SimpleNamespace(name="KICKR CORE"),      # HIT → reset backoff
        None,                                    # miss → sleep 1 (NOT 4)
    ]
    idx = {"i": 0}

    async def find() -> Any:
        i = idx["i"]
        idx["i"] += 1
        if i >= len(sequence):
            stop.set()
            return None
        return sequence[i]

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)

    connect = _make_connect(fake_client)

    await reconnect_loop(
        queue=asyncio.Queue(),
        find_device=find,
        connect_client=connect,
        config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
        sleep=fake_sleep,
        stop_event=stop,
    )

    # miss, miss, HIT (reconnect cycle, no sleep for reset), miss
    assert sleeps == [1.0, 2.0, 1.0]
    assert fake_client.started == ["00002ad2-0000-1000-8000-00805f9b34fb"]


@pytest.mark.asyncio
async def test_bleak_error_on_connect_triggers_backoff():
    from bleak import BleakError

    sleeps: List[float] = []
    stop = asyncio.Event()
    idx = {"i": 0}

    async def find() -> Any:
        i = idx["i"]
        idx["i"] += 1
        if i >= 2:
            stop.set()
            return None
        return SimpleNamespace(name="KICKR CORE")

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)

    @asynccontextmanager
    async def bad_connect(device, on_disconnect):
        raise BleakError("fake disconnect during handshake")
        yield  # pragma: no cover

    await reconnect_loop(
        queue=asyncio.Queue(),
        find_device=find,
        connect_client=bad_connect,
        config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
        sleep=fake_sleep,
        stop_event=stop,
    )

    # Two failures before stop_event sets on the 3rd find() call.
    assert sleeps == [1.0, 2.0]


# ---------------------------------------------------------------------------
# Task 2 (02-04): controller wired into reconnect_loop; shutdown-before-notify
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_control_loop_wired_and_shutdown_before_notify_stop():
    """reconnect_loop with ride_state: controller.shutdown() called BEFORE
    stop_indoor_bike_notify (RESEARCH.md Pitfall 6 / INFRA-02 guarantee).
    """
    from engine.control.controller import FtmsController
    from engine.control.athlete import AthleteProfile
    from engine.gears.engine import GearEngine
    from engine.ftms.control_point import OpCode

    call_order: List[str] = []
    stop = asyncio.Event()

    # --- fake client that satisfies FtmsController handshake + auto-responses ---
    class _TrackingClient(_FakeClient):
        """Extends _FakeClient to track shutdown and stop_notify calls."""

        def __init__(self):
            super().__init__()
            self.writes: List = []
            self._notify_cbs: dict = {}

        async def start_notify(self, uuid: str, cb) -> None:
            self._notify_cbs[uuid] = cb
            self.started.append(uuid)

        async def stop_notify(self, uuid: str) -> None:
            call_order.append("stop_indoor_bike_notify")
            self.stopped.append(uuid)

        async def write_gatt_char(self, uuid: str, data, *, response: bool = False) -> None:
            payload = bytes(data)
            self.writes.append((uuid, payload, response))
            # Auto-success for all known opcodes
            opcode = payload[0] if payload else 0xFF
            _success = bytes([0x80, opcode, 0x01])
            loop = asyncio.get_event_loop()
            cb = self._notify_cbs.get(uuid)
            if cb is not None:
                loop.call_soon(cb, None, bytearray(_success))

    tracking_client = _TrackingClient()

    # Patch FtmsController.shutdown to record call order
    original_shutdown = FtmsController.shutdown

    async def _tracked_shutdown(self_ctrl):
        call_order.append("controller.shutdown")
        await original_shutdown(self_ctrl)

    device = SimpleNamespace(name="KICKR CORE")

    @asynccontextmanager
    async def _connect(dev, on_disconnect):
        # Fire disconnect + stop_event after one yield turn so the loop exits
        async def _trigger():
            await asyncio.sleep(0)
            stop.set()
            on_disconnect(tracking_client)

        task = asyncio.create_task(_trigger())
        try:
            yield tracking_client
        finally:
            task.cancel()

    async def find():
        return device

    from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
    from engine.control.athlete import AthleteProfile
    from engine.control.erg_debouncer import ErgDebouncer
    from engine.domain.projection import RideStateProjection

    gear_engine = GearEngine()
    bus = AsyncioEventBus()
    projection = RideStateProjection()
    erg_debouncer = ErgDebouncer(bus)

    with mock.patch.object(FtmsController, "shutdown", _tracked_shutdown):
        await reconnect_loop(
            queue=asyncio.Queue(),
            find_device=find,
            connect_client=_connect,
            config=ReconnectConfig(initial_backoff=1.0, max_backoff=60.0),
            sleep=asyncio.sleep,
            stop_event=stop,
            athlete=AthleteProfile(),
            projection=projection,
            erg_debouncer=erg_debouncer,
            gear_engine=gear_engine,
        )

    # INFRA-02: shutdown must precede stop_indoor_bike_notify
    assert "controller.shutdown" in call_order
    assert "stop_indoor_bike_notify" in call_order
    shutdown_pos = call_order.index("controller.shutdown")
    notify_stop_pos = call_order.index("stop_indoor_bike_notify")
    assert shutdown_pos < notify_stop_pos, (
        f"Expected controller.shutdown before stop_indoor_bike_notify, "
        f"but got order: {call_order}"
    )
