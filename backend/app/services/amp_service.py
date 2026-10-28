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
import re
import time
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


_STEAM_APPS_RE = re.compile(r"/apps/(\d+)/")


def _parse_steam_app_id(display_image_source: Any) -> int | None:
    """The Steam App ID embedded in AMP's DisplayImageSource, or None.

    Two forms are seen in the wild: `steam:<id>` and an image URL containing
    `/apps/<id>/`. Anything else (including null) yields None.
    """
    if not isinstance(display_image_source, str):
        return None
    if display_image_source.startswith("steam:"):
        rest = display_image_source.removeprefix("steam:")
        return int(rest) if rest.isdigit() else None
    match = _STEAM_APPS_RE.search(display_image_source)
    return int(match.group(1)) if match else None


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
        steam_app_id=_parse_steam_app_id(raw.get("DisplayImageSource")),
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


def _raw_instance(instance_id: str) -> dict[str, Any] | None:
    """AMP's raw record for an InstanceID (GUID), or None if it no longer exists."""
    targets = _call("ADSModule/GetInstances", {})
    for target in targets if isinstance(targets, list) else []:
        for raw in target.get("AvailableInstances") or []:
            if raw.get("InstanceID") == instance_id:
                return raw
    return None


def _amp_error(data: Any) -> str | None:
    """A failure message if `data` is an AMP error response, else None.

    AMP signals failure two ways: an ActionResult with ``Status: false``, or a
    method-invocation error envelope carrying ``Title``/``Message`` (usually with
    a ``StackTrace``) — e.g. a missing or wrong argument. The envelope has no
    ``Status`` key, so it must be matched explicitly or it reads as success.
    """
    if not isinstance(data, dict):
        return None
    if data.get("Status") is False:
        return data.get("Reason") or "AMP reported the call unsuccessful"
    if "StackTrace" in data or (data.get("Title") and data.get("Message")):
        return data.get("Message") or data.get("Title")
    return None


# How long to wait for an instance to come online after StartInstance before
# giving up on also starting its application (it is still booting; a follow-up
# start finishes the job). Interval * attempts ~= max wait.
_START_POLL_INTERVAL_SECONDS = 2.0
_START_POLL_ATTEMPTS = 15


def _raise_if_error(data: Any, instance_id: str, action: str) -> None:
    error = _amp_error(data)
    if error:
        logger.warning("AMP %s(id=%s) failed: %s", action, instance_id, error)
        raise AmpUpstreamError(error)


def _start_application(instance_id: str) -> None:
    """Start the game application inside an already-online instance.

    AMP proxies an instance-scoped call through the controller at
    ``ADSModule/Servers/<id>/API/<Module>/<Method>``.
    """
    data = _call(f"ADSModule/Servers/{instance_id}/API/Core/Start", {})
    # TEMP DIAGNOSTIC (verify the proxied Core/Start is accepted): remove once confirmed.
    logger.warning("AMP Core/Start(id=%s) response: %r", instance_id, data)
    _raise_if_error(data, instance_id, "Core/Start")


def _bring_instance_online(instance_id: str, name: str) -> bool:
    """StartInstance, then wait (bounded) for it to report Running.

    Returns whether it came online within the poll budget.
    """
    data = _call("ADSModule/StartInstance", {"InstanceName": name})
    _raise_if_error(data, instance_id, "StartInstance")
    for _ in range(_START_POLL_ATTEMPTS):
        time.sleep(_START_POLL_INTERVAL_SECONDS)
        raw = _raw_instance(instance_id)
        if raw and raw.get("Running"):
            return True
    return False


def start_instance(instance_id: str) -> None:
    """Fully start an instance's game server in one call.

    AMP splits a running server into an *instance* (the AMP process managing it)
    and the *application* (the game) inside it, each with its own lifecycle, so a
    fully stopped server needs both brought up:

    - If the instance is offline, ``ADSModule/StartInstance`` brings it online
      (identified by InstanceName, not the InstanceID the app keys on); AMP shows
      the in-between state — instance up, game not yet started — as "Idle".
    - Once online, the application is started via an instance-scoped ``Core/Start``.

    Both run here so a single click fully starts a stopped server. If the instance
    is too slow to come online we stop after starting it (it is still booting) and
    a follow-up start finishes the job.
    """
    if not _configured():
        raise AmpNotConfiguredError("AMP is not configured")
    raw = _raw_instance(instance_id)
    if raw is None:
        raise AmpUpstreamError(f"No AMP instance with id {instance_id}")
    if not raw.get("Running"):
        name = raw.get("InstanceName")
        if not isinstance(name, str) or not name:
            raise AmpUpstreamError(f"AMP instance {instance_id} has no InstanceName")
        if not _bring_instance_online(instance_id, name):
            logger.warning(
                "AMP instance %s did not come online in time; application not started",
                instance_id,
            )
            return
    _start_application(instance_id)
