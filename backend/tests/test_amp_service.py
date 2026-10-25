"""Unit tests for amp_service. The external HTTP seam (`_post_api`) is stubbed,
so no real AMP or network is touched."""

from __future__ import annotations

import pytest

from app.services import amp_service


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_service.settings, "amp_username", "admin")
    monkeypatch.setattr(amp_service.settings, "amp_password", "pw")
    # Each test starts with no cached session.
    monkeypatch.setattr(amp_service, "_session", None)


def _instances_payload() -> list[dict]:
    return [
        {
            "AvailableInstances": [
                {
                    "InstanceID": "i1",
                    "FriendlyName": "MC",
                    "InstanceName": "mc01",
                    "Module": "Minecraft",
                    "Running": True,
                    "Suspended": False,
                    "AppState": 20,
                    "Metrics": {"Active Users": {"RawValue": 3, "MaxValue": 20}},
                }
            ]
        },
        {
            "AvailableInstances": [
                {
                    "InstanceID": "i2",
                    "FriendlyName": "Valheim",
                    "Module": "Valheim",
                    "Running": False,
                    "Suspended": False,
                    "AppState": 0,
                    "Metrics": {},
                }
            ]
        },
    ]


def test_list_instances_flattens_and_maps(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "sess-1"}
        if method_path == "ADSModule/GetInstances":
            return _instances_payload()
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    result = amp_service.list_instances()

    assert [i.id for i in result] == ["i1", "i2"]
    assert result[0].name == "MC"
    assert result[0].state == "Running"
    assert result[0].running is True
    assert result[0].active_users == 3
    assert result[0].max_users == 20
    assert result[1].state == "Stopped"
    assert result[1].active_users is None


def test_suspended_overrides_state(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return [
            {
                "AvailableInstances": [
                    {
                        "InstanceID": "i1",
                        "FriendlyName": "X",
                        "Module": "Generic",
                        "Running": False,
                        "Suspended": True,
                        "AppState": 0,
                        "Metrics": {},
                    }
                ]
            }
        ]

    monkeypatch.setattr(amp_service, "_post_api", fake_post)
    assert amp_service.list_instances()[0].state == "Suspended"


def test_relogin_on_expired_session(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {"logins": 0, "served_expired": False}

    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            state["logins"] += 1
            return {"success": True, "sessionID": f"s{state['logins']}"}
        if method_path == "ADSModule/GetInstances":
            if not state["served_expired"]:
                state["served_expired"] = True
                return {"Title": "Unauthorized Access"}
            return []
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    amp_service.list_instances()

    assert state["logins"] == 2  # initial login + one re-login after expiry


def test_start_instance_success(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = []

    def fake_post(method_path: str, payload: dict):
        seen.append((method_path, payload))
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        if method_path == "ADSModule/StartInstance":
            return {"Status": True}
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    amp_service.start_instance("i1")

    start = [c for c in seen if c[0] == "ADSModule/StartInstance"][0]
    assert start[1]["InstanceID"] == "i1"


def test_start_instance_refusal_raises_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return {"Status": False, "Reason": "no such instance"}

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    with pytest.raises(amp_service.AmpUpstreamError, match="no such instance"):
        amp_service.start_instance("nope")


def test_login_failure_raises_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        return {"success": False, "sessionID": ""}

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    with pytest.raises(amp_service.AmpUpstreamError):
        amp_service.list_instances()


def test_not_configured_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_service.settings, "amp_username", "")
    with pytest.raises(amp_service.AmpNotConfiguredError):
        amp_service.list_instances()


def test_parse_steam_app_id_from_steam_scheme() -> None:
    assert amp_service._parse_steam_app_id("steam:1604030") == 1604030


def test_parse_steam_app_id_from_apps_url() -> None:
    url = "url:https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1623730/header.jpg"
    assert amp_service._parse_steam_app_id(url) == 1623730


def test_parse_steam_app_id_none_for_missing_or_garbage() -> None:
    assert amp_service._parse_steam_app_id(None) is None
    assert amp_service._parse_steam_app_id("") is None
    assert amp_service._parse_steam_app_id("not-a-steam-source") is None


def test_map_instance_sets_steam_app_id(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return [
            {
                "AvailableInstances": [
                    {
                        "InstanceID": "i1",
                        "FriendlyName": "Pal",
                        "Module": "GenericModule",
                        "Running": True,
                        "Suspended": False,
                        "AppState": 20,
                        "Metrics": {},
                        "DisplayImageSource": "steam:1623730",
                    }
                ]
            }
        ]

    monkeypatch.setattr(amp_service, "_post_api", fake_post)
    result = amp_service.list_instances()
    assert result[0].steam_app_id == 1623730
