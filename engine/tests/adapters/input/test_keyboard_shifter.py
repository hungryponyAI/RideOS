"""Tests for KeyboardShifterAdapter _ShiftProxy event publishing."""
import time

from engine.adapters.input.keyboard_shifter import _ShiftProxy
from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.domain.events import GearShifted
from engine.domain.gears import GearEngine


def _make_proxy(gear: int = 6):
    engine = GearEngine(current_gear=gear)
    bus = AsyncioEventBus()
    return _ShiftProxy(engine, bus, time.monotonic), engine, bus


def test_shift_up_updates_engine_and_publishes():
    proxy, engine, bus = _make_proxy(gear=5)
    events: list[GearShifted] = []
    bus.subscribe(GearShifted, events.append)

    proxy.shift_up()

    assert engine.current_gear == 6
    assert len(events) == 1
    assert events[0].direction == "up"
    assert events[0].gear == 6


def test_shift_down_updates_engine_and_publishes():
    proxy, engine, bus = _make_proxy(gear=5)
    events: list[GearShifted] = []
    bus.subscribe(GearShifted, events.append)

    proxy.shift_down()

    assert engine.current_gear == 4
    assert len(events) == 1
    assert events[0].direction == "down"
    assert events[0].gear == 4


def test_multiple_shifts_publish_multiple_events():
    proxy, _, bus = _make_proxy(gear=5)
    events: list[GearShifted] = []
    bus.subscribe(GearShifted, events.append)

    proxy.shift_up()
    proxy.shift_up()
    proxy.shift_down()

    assert len(events) == 3


def test_event_timestamp_is_monotonic():
    proxy, _, bus = _make_proxy()
    events: list[GearShifted] = []
    bus.subscribe(GearShifted, events.append)

    before = time.monotonic()
    proxy.shift_up()
    after = time.monotonic()

    assert before <= events[0].t_mono <= after


def test_current_gear_proxied():
    proxy, engine, _ = _make_proxy(gear=8)
    assert proxy.current_gear == 8
    engine.current_gear = 3
    assert proxy.current_gear == 3
