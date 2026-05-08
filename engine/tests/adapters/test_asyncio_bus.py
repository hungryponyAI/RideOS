"""AsyncioEventBus — subscribe, publish, error isolation."""
from __future__ import annotations

import pytest

from engine.adapters.eventbus.asyncio_bus import AsyncioEventBus
from engine.domain.events import GearShifted, TelemetryReading


def test_subscribed_handler_receives_event():
    bus = AsyncioEventBus()
    received: list[TelemetryReading] = []
    bus.subscribe(TelemetryReading, received.append)

    event = TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=1.0)
    bus.publish(event)

    assert len(received) == 1
    assert received[0] is event


def test_handler_not_called_for_different_type():
    bus = AsyncioEventBus()
    received: list[GearShifted] = []
    bus.subscribe(GearShifted, received.append)

    bus.publish(TelemetryReading(speed_kmh=30.0, power_w=200, cadence_rpm=90.0, t_mono=1.0))

    assert received == []


def test_multiple_handlers_all_called():
    bus = AsyncioEventBus()
    calls: list[int] = []
    bus.subscribe(TelemetryReading, lambda e: calls.append(1))
    bus.subscribe(TelemetryReading, lambda e: calls.append(2))

    bus.publish(TelemetryReading(speed_kmh=10.0, power_w=100, cadence_rpm=70.0, t_mono=0.0))

    assert calls == [1, 2]


def test_multiple_event_types_dispatched_independently():
    bus = AsyncioEventBus()
    telemetry_calls: list[TelemetryReading] = []
    gear_calls: list[GearShifted] = []

    bus.subscribe(TelemetryReading, telemetry_calls.append)
    bus.subscribe(GearShifted, gear_calls.append)

    bus.publish(TelemetryReading(speed_kmh=20.0, power_w=150, cadence_rpm=80.0, t_mono=1.0))
    bus.publish(GearShifted(gear=7, direction="up", t_mono=2.0))

    assert len(telemetry_calls) == 1
    assert len(gear_calls) == 1


def test_handler_exception_does_not_prevent_other_handlers():
    bus = AsyncioEventBus()
    calls: list[int] = []

    def bad_handler(e: TelemetryReading) -> None:
        raise RuntimeError("boom")

    bus.subscribe(TelemetryReading, bad_handler)
    bus.subscribe(TelemetryReading, lambda e: calls.append(1))

    # Should not raise; second handler must still run
    bus.publish(TelemetryReading(speed_kmh=10.0, power_w=100, cadence_rpm=70.0, t_mono=0.0))

    assert calls == [1]


def test_publish_with_no_subscribers_is_silent():
    bus = AsyncioEventBus()
    bus.publish(TelemetryReading(speed_kmh=10.0, power_w=100, cadence_rpm=70.0, t_mono=0.0))


def test_subscriber_count_helper():
    bus = AsyncioEventBus()
    assert bus.subscriber_count(TelemetryReading) == 0
    bus.subscribe(TelemetryReading, lambda e: None)
    bus.subscribe(TelemetryReading, lambda e: None)
    assert bus.subscriber_count(TelemetryReading) == 2
    assert bus.subscriber_count(GearShifted) == 0


def test_bus_integrates_with_projection():
    """Bus + projection wired together: published events update the view."""
    from engine.domain.projection import RideStateProjection

    bus = AsyncioEventBus()
    projection = RideStateProjection()
    bus.subscribe(TelemetryReading, projection.apply)
    bus.subscribe(GearShifted, projection.apply)

    bus.publish(TelemetryReading(speed_kmh=28.0, power_w=220, cadence_rpm=88.0, t_mono=1.0))
    bus.publish(GearShifted(gear=8, direction="up", t_mono=2.0))

    assert projection.view.speed_kmh == 28.0
    assert projection.view.gear == 8
