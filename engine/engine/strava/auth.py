"""Strava OAuth2 token management (copy-paste flow for local app)."""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

_log = logging.getLogger("rideos.strava.auth")

_SCOPE = "activity:read_all"
_AUTH_BASE = "https://www.strava.com/oauth/authorize"
_TOKEN_URL = "https://www.strava.com/oauth/token"
_REDIRECT_URI = "http://localhost/exchange_token"

CYCLING_SPORT_TYPES = frozenset({
    "Ride",
    "GravelRide",
    "MountainBikeRide",
    "VirtualRide",
    "EBikeRide",
    "EMountainBikeRide",
})


class StravaAuth:
    def __init__(self, config_path: Path, tokens_path: Path) -> None:
        self._config_path = config_path
        self._tokens_path = tokens_path
        self._client_id: Optional[int] = None
        self._client_secret: Optional[str] = None
        self._tokens: Optional[dict] = None
        self._athlete: Optional[dict] = None
        self._load_config()
        self._load_tokens()

    def _load_config(self) -> None:
        try:
            cfg = json.loads(self._config_path.read_text(encoding="utf-8"))
            self._client_id = int(cfg["client_id"])
            self._client_secret = str(cfg["client_secret"])
            _log.info("Strava: config loaded (client_id=%s)", self._client_id)
        except Exception as exc:
            _log.warning("Strava config not found or invalid: %s", exc)

    def _load_tokens(self) -> None:
        if not self._tokens_path.exists():
            return
        try:
            data = json.loads(self._tokens_path.read_text(encoding="utf-8"))
            self._tokens = data.get("tokens")
            self._athlete = data.get("athlete")
            _log.info("Strava: tokens loaded, athlete=%s", self.athlete_name)
        except Exception as exc:
            _log.warning("Could not load Strava tokens: %s", exc)

    def _save_tokens(self) -> None:
        self._tokens_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"tokens": self._tokens, "athlete": self._athlete}
        self._tokens_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    @property
    def is_configured(self) -> bool:
        return self._client_id is not None and self._client_secret is not None

    @property
    def is_connected(self) -> bool:
        return self._tokens is not None

    @property
    def athlete_name(self) -> Optional[str]:
        if not self._athlete:
            return None
        parts = [
            self._athlete.get("firstname", ""),
            self._athlete.get("lastname", ""),
        ]
        return " ".join(p for p in parts if p).strip() or None

    def get_auth_url(self) -> str:
        params = urllib.parse.urlencode({
            "client_id": self._client_id,
            "redirect_uri": _REDIRECT_URI,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": _SCOPE,
        })
        return f"{_AUTH_BASE}?{params}"

    def exchange_code(self, code: str) -> None:
        """Exchange authorization code for tokens. Raises RuntimeError on failure."""
        body = urllib.parse.urlencode({
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "code": code.strip(),
            "grant_type": "authorization_code",
        }).encode()
        req = urllib.request.Request(_TOKEN_URL, data=body, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"Strava auth failed ({exc.code}): {detail}") from exc
        self._tokens = {
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "expires_at": int(result["expires_at"]),
        }
        self._athlete = result.get("athlete")
        self._save_tokens()
        _log.info("Strava: authenticated as %s", self.athlete_name)

    def _refresh_if_needed(self) -> None:
        if self._tokens is None:
            raise RuntimeError("Not authenticated with Strava")
        if time.time() < self._tokens["expires_at"] - 300:
            return
        _log.info("Strava: refreshing access token")
        body = urllib.parse.urlencode({
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": self._tokens["refresh_token"],
            "grant_type": "refresh_token",
        }).encode()
        req = urllib.request.Request(_TOKEN_URL, data=body, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(
                f"Strava token refresh failed ({exc.code}): {detail}"
            ) from exc
        self._tokens["access_token"] = result["access_token"]
        self._tokens["refresh_token"] = result["refresh_token"]
        self._tokens["expires_at"] = int(result["expires_at"])
        self._save_tokens()

    def get_access_token(self) -> str:
        self._refresh_if_needed()
        return self._tokens["access_token"]

    def disconnect(self) -> None:
        self._tokens = None
        self._athlete = None
        if self._tokens_path.exists():
            self._tokens_path.unlink()
        _log.info("Strava: disconnected")
