"""GPX file adapter — file I/O boundary wrapping engine.domain.route.

load_gpx_content and all pure transformations live in domain.route.
This module only adds the file-open step and re-exports for backward compat.
"""
from __future__ import annotations

from engine.domain.route import RouteData  # noqa: F401
from engine.domain.route import (  # noqa: F401
    _rolling_mean,
    extract_gpx_name,
    load_gpx_content,
    reverse_route,
    slice_route,
)


def load_gpx(path: str) -> RouteData:
    """Load a GPX file from the filesystem and parse it into a RouteData."""
    with open(path) as fh:
        return load_gpx_content(fh.read(), source_label=repr(path))
