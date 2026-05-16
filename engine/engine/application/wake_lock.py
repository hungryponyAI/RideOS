"""System wake-lock helpers for keeping the ride machine awake during rides."""
from __future__ import annotations

import logging
import os
import subprocess
import sys

_log = logging.getLogger("rideos.application.wake_lock")


class MacOSWakeLock:
    """Prevent macOS system/display sleep while an active ride is running."""

    def __init__(self) -> None:
        self._proc: subprocess.Popen[bytes] | None = None

    def start(self) -> None:
        if sys.platform != "darwin":
            return
        if self._proc is not None and self._proc.poll() is None:
            return
        try:
            self._proc = subprocess.Popen(
                ["/usr/bin/caffeinate", "-dimsu", "-w", str(os.getpid())],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            self._proc = None
            _log.exception("Failed to start macOS wake lock")

    def stop(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None or proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2.0)
