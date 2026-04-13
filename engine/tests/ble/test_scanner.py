"""Unit tests for engine.ble.scanner — hardware-independent."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from engine.ble.scanner import (
    FTMS_SERVICE_UUID,
    KICKR_NAME,
    _advertises_ftms,
    find_kickr,
)


class _StubScanner:
    """Stands in for BleakScanner class. Tracks whether fallback was reached."""

    name_return: Any = None
    filter_return: Any = None
    name_called: bool = False
    filter_called: bool = False

    @classmethod
    async def find_device_by_name(cls, name: str, timeout: float) -> Any:
        cls.name_called = True
        assert name == KICKR_NAME
        return cls.name_return

    @classmethod
    async def find_device_by_filter(cls, predicate, timeout: float) -> Any:
        cls.filter_called = True
        # Exercise the predicate with a fake adv carrying the FTMS UUID.
        fake_adv = SimpleNamespace(service_uuids=[FTMS_SERVICE_UUID])
        assert predicate(object(), fake_adv) is True
        return cls.filter_return


def _reset_stub() -> None:
    _StubScanner.name_return = None
    _StubScanner.filter_return = None
    _StubScanner.name_called = False
    _StubScanner.filter_called = False


@pytest.mark.asyncio
async def test_find_kickr_returns_name_match_and_skips_filter():
    _reset_stub()
    sentinel = object()
    _StubScanner.name_return = sentinel

    result = await find_kickr(scanner_cls=_StubScanner, timeout=0.1)

    assert result is sentinel
    assert _StubScanner.name_called is True
    assert _StubScanner.filter_called is False


@pytest.mark.asyncio
async def test_find_kickr_falls_back_to_ftms_uuid_filter():
    _reset_stub()
    sentinel = object()
    _StubScanner.name_return = None
    _StubScanner.filter_return = sentinel

    result = await find_kickr(scanner_cls=_StubScanner, timeout=0.1)

    assert result is sentinel
    assert _StubScanner.filter_called is True


@pytest.mark.asyncio
async def test_find_kickr_returns_none_when_both_strategies_miss():
    _reset_stub()
    _StubScanner.name_return = None
    _StubScanner.filter_return = None

    result = await find_kickr(scanner_cls=_StubScanner, timeout=0.1)

    assert result is None
    assert _StubScanner.name_called is True
    assert _StubScanner.filter_called is True


def test_advertises_ftms_predicate():
    with_ftms = SimpleNamespace(service_uuids=[FTMS_SERVICE_UUID])
    without_ftms = SimpleNamespace(service_uuids=["00002a37-0000-1000-8000-00805f9b34fb"])
    none_list = SimpleNamespace(service_uuids=None)

    assert _advertises_ftms(object(), with_ftms) is True
    assert _advertises_ftms(object(), without_ftms) is False
    assert _advertises_ftms(object(), none_list) is False
