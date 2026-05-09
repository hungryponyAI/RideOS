"""Tests for KickrTrainerAdapter."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from engine.adapters.ble.kickr_trainer import KickrTrainerAdapter


def _make_controller(controlled: bool = True):
    ctrl = MagicMock()
    ctrl.controlled = controlled
    ctrl.set_simulation_grade = AsyncMock()
    ctrl.set_target_power = AsyncMock()
    return ctrl


@pytest.mark.asyncio
async def test_set_grade_drops_when_disconnected():
    adapter = KickrTrainerAdapter()
    await adapter.set_grade(5.0)  # no controller — must not raise


@pytest.mark.asyncio
async def test_set_grade_delegates_when_connected():
    adapter = KickrTrainerAdapter()
    ctrl = _make_controller()
    adapter.attach(ctrl)
    await adapter.set_grade(3.5)
    ctrl.set_simulation_grade.assert_awaited_once_with(3.5)


@pytest.mark.asyncio
async def test_set_target_power_delegates():
    adapter = KickrTrainerAdapter()
    ctrl = _make_controller()
    adapter.attach(ctrl)
    await adapter.set_target_power(200.0)
    ctrl.set_target_power.assert_awaited_once_with(200)


@pytest.mark.asyncio
async def test_detach_stops_writes():
    adapter = KickrTrainerAdapter()
    ctrl = _make_controller()
    adapter.attach(ctrl)
    adapter.detach()
    await adapter.set_grade(5.0)
    ctrl.set_simulation_grade.assert_not_awaited()


def test_is_connected_false_before_attach():
    assert KickrTrainerAdapter().is_connected is False


def test_is_connected_true_after_attach():
    adapter = KickrTrainerAdapter()
    adapter.attach(_make_controller(controlled=True))
    assert adapter.is_connected is True


def test_is_connected_false_when_controller_not_controlled():
    adapter = KickrTrainerAdapter()
    adapter.attach(_make_controller(controlled=False))
    assert adapter.is_connected is False


@pytest.mark.asyncio
async def test_set_basic_resistance_noop():
    adapter = KickrTrainerAdapter()
    ctrl = _make_controller()
    adapter.attach(ctrl)
    await adapter.set_basic_resistance(50)  # no-op; must not raise or call anything
