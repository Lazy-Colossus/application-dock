"""CubeCoders AMP (ADS controller) client for the AMP Instances app.

The only module that talks to AMP. Every AMP call is POST
`{base}/API/<Module>/<Method>` with a JSON body; the session id travels as
`SESSIONID` in that body; the response is the method's raw JSON. An expired
session makes a gated call return `{"Title": "Unauthorized Access", ...}`, which
we recover from by logging in again once.

Raises `AmpNotConfiguredError` when credentials are missing and
`AmpUpstreamError` when AMP is unreachable, rejects the login, or refuses a
call; the router translates both.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.amp import Instance

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0

# AMP ApplicationState enum -> human label. Values AMP does not send fall back
# to "Unknown".
_APP_STATES: dict[int, str] = {
    -1: "Unknown",
    0: "Stopped",
    5: "Pre-start",
    7: "Configuring",
    10: "Starting",
    20: "Running",
    30: "Restarting",
    40: "Stopping",
    45: "Preparing for sleep",
    50: "Sleeping",
    60: "Waiting",
    70: "Installing",
    75: "Updating",
    80: "Awaiting input",
    100: "Failed",
    110: "Suspended",
    200: "Maintenance",
    250: "Indeterminate",
}

# Cached AMP session id, refreshed lazily and on expiry.
_session: str | None = None


class AmpNotConfiguredError(RuntimeError):
    """No AMP credentials are configured, so the app cannot talk to AMP."""


class AmpUpstreamError(RuntimeError):
    """AMP was unreachable, rejected the login, or refused a call."""


def _configured() -> bool:
    return bool(settings.amp_username and settings.amp_password)


def _post_api(method_path: str, payload: dict[str, Any]) -> Any:
    """POST one AMP API method and return its parsed JSON. The single HTTP seam;
    tests stub this."""
    url = f"{settings.amp_base_url.rstrip('/')}/API/{method_path}"
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        raise AmpUpstreamError(f"AMP request failed: {exc}") from exc


def _login() -> str:
    data = _post_api(
        "Core/Login",
        {
            "username": settings.amp_username,
            "password": settings.amp_password,
            "token": "",
            "rememberMe": False,
        },
    )
    session_id = data.get("sessionID") if isinstance(data, dict) else None
    if not isinstance(data, dict) or not data.get("success") or not session_id:
        raise AmpUpstreamError("AMP login failed")
    return session_id


def _ensure_session() -> str:
    global _session
    if _session is None:
        _session = _login()
    return _session


def _is_session_expired(data: Any) -> bool:
    return isinstance(data, dict) and data.get("Title") == "Unauthorized Access"


def _call(method_path: str, payload: dict[str, Any]) -> Any:
    """Call a gated AMP method, re-logging in once if the session has expired."""
    global _session
    session_id = _ensure_session()
    data = _post_api(method_path, {**payload, "SESSIONID": session_id})
    if _is_session_expired(data):
        _session = _login()
        data = _post_api(method_path, {**payload, "SESSIONID": _session})
    return data


def _state_label(app_state: Any, suspended: Any) -> str:
    if suspended:
        return "Suspended"
    if isinstance(app_state, int):
        return _APP_STATES.get(app_state, "Unknown")
    return "Unknown"


def _map_instance(raw: dict[str, Any]) -> Instance:
    metrics = raw.get("Metrics") or {}
    users = metrics.get("Active Users") or {}
    return Instance(
        id=raw["InstanceID"],
        name=raw.get("FriendlyName") or raw.get("InstanceName") or raw["InstanceID"],
        module=raw.get("Module") or "",
        running=bool(raw.get("Running")),
        state=_state_label(raw.get("AppState"), raw.get("Suspended")),
        active_users=users.get("RawValue"),
        max_users=users.get("MaxValue"),
    )


def list_instances() -> list[Instance]:
    if not _configured():
        raise AmpNotConfiguredError("AMP is not configured")
    targets = _call("ADSModule/GetInstances", {})
    if not isinstance(targets, list):
        raise AmpUpstreamError("Unexpected response from AMP")
    instances: list[Instance] = []
    for target in targets:
        for raw in target.get("AvailableInstances") or []:
            instances.append(_map_instance(raw))
    return instances


def start_instance(instance_id: str) -> None:
    if not _configured():
        raise AmpNotConfiguredError("AMP is not configured")
    data = _call("ADSModule/StartInstance", {"InstanceID": instance_id})
    if isinstance(data, dict) and data.get("Status") is False:
        raise AmpUpstreamError(data.get("Reason") or "AMP refused to start the instance")
