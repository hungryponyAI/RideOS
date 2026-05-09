"""Tests for ClickShifterAdapter _ShiftProxy event publishing."""
import time
import pytest

from engine.adapters.ble.click_shifter import _ShiftProxy
from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.domain.events import GearShifted
from engine.domain.gears import GearEngine


def _make_proxy(gear: int = 6):
    engine = GearEngine(current_gear=gear)
    bus = AsyncioEventBus()
    clock = time.monotonic
    return _ShiftProxy(engine, bus, clock), engine, bus


def test_shift_up_publishes_event():
    proxy, engine, bus = _make_proxy(gear=6)
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    result = proxy.shift_up()

    assert result == 7
    assert engine.current_gear == 7
    assert len(received) == 1
    assert received[0].gear == 7
    assert received[0].direction == "up"


def test_shift_down_publishes_event():
    proxy, engine, bus = _make_proxy(gear=6)
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    result = proxy.shift_down()

    assert result == 5
    assert engine.current_gear == 5
    assert len(received) == 1
    assert received[0].gear == 5
    assert received[0].direction == "down"


def test_shift_up_at_max_clamps():
    proxy, engine, bus = _make_proxy(gear=12)
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    proxy.shift_up()

    assert engine.current_gear == 12
    assert received[0].gear == 12


def test_shift_down_at_min_clamps():
    proxy, engine, bus = _make_proxy(gear=1)
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    proxy.shift_down()

    assert engine.current_gear == 1
    assert received[0].gear == 1


def test_event_carries_monotonic_timestamp():
    proxy, _, bus = _make_proxy()
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    before = time.monotonic()
    proxy.shift_up()
    after = time.monotonic()

    assert before <= received[0].t_mono <= after


def test_current_gear_proxied():
    proxy, engine, _ = _make_proxy(gear=8)
    assert proxy.current_gear == 8
    engine.current_gear = 3
    assert proxy.current_gear == 3
