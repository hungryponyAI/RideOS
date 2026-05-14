"""Backward-compatibility shim — re-exports from transport/ws/.

All new code should import from engine.transport.ws directly.
This module will be removed in Phase 7 (frontend split).
"""
from engine.transport.ws.server import CLIENTS, RouteContext, broadcast_loop

__all__ = ["CLIENTS", "RouteContext", "broadcast_loop"]
