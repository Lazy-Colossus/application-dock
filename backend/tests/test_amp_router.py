"""Integration tests for the AMP endpoints. amp_service is stubbed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.amp import Instance
from app.services import amp_ports_service, amp_service, steam_service

client = TestClient(app)


def test_get_instances_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(
                id="i1",
                name="MC",
                module="Minecraft",
                running=True,
                state="Running",
                active_users=3,
                max_users=20,
            )
        ],
    )

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["id"] == "i1"
    assert body[0]["state"] == "Running"


def test_get_instances_not_configured_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> list[Instance]:
        raise amp_service.AmpNotConfiguredError("AMP is not configured")

    monkeypatch.setattr(amp_service, "list_instances", boom)

    resp = client.get("/api/amp/instances")
    assert resp.status_code == 503


def test_get_instances_upstream_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> list[Instance]:
        raise amp_service.AmpUpstreamError("AMP unreachable")

    monkeypatch.setattr(amp_service, "list_instances", boom)

    resp = client.get("/api/amp/instances")
    assert resp.status_code == 502


def test_start_instance_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    monkeypatch.setattr(
        amp_service, "start_instance", lambda instance_id: seen.update(id=instance_id)
    )

    resp = client.post("/api/amp/instances/i1/start")

    assert resp.status_code == 202
    assert seen["id"] == "i1"


def test_start_instance_upstream_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(instance_id: str) -> None:
        raise amp_service.AmpUpstreamError("refused")

    monkeypatch.setattr(amp_service, "start_instance", boom)

    resp = client.post("/api/amp/instances/i1/start")
    assert resp.status_code == 502


def test_get_instances_joins_port_and_leaves_unconfigured_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(id="i1", name="MC", module="Minecraft", running=True, state="Running"),
            Instance(id="i2", name="V", module="Valheim", running=False, state="Stopped"),
        ],
    )
    monkeypatch.setattr(amp_ports_service, "reconcile", lambda ids: {"i1": 27015})

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["port"] == 27015
    assert body[1]["port"] is None


def test_get_config_returns_public_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service, "public_ip", lambda: "203.0.113.5")

    resp = client.get("/api/amp/config")

    assert resp.status_code == 200
    assert resp.json() == {"public_ip": "203.0.113.5"}


def test_put_ports_persists_and_returns(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    monkeypatch.setattr(amp_ports_service, "set_ports", lambda ports: seen.update(ports) or ports)

    resp = client.put("/api/amp/ports", json={"ports": {"i1": 27015}})

    assert resp.status_code == 200
    assert resp.json() == {"ports": {"i1": 27015}}
    assert seen == {"i1": 27015}


def test_put_ports_bad_port_returns_422(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(ports: dict) -> dict:
        raise ValueError("port 0 for 'i1' is out of range 1-65535")

    monkeypatch.setattr(amp_ports_service, "set_ports", boom)

    resp = client.put("/api/amp/ports", json={"ports": {"i1": 0}})

    assert resp.status_code == 422


def test_get_instances_enriches_game_from_steam(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(
                id="i1",
                name="Pal",
                module="GenericModule",
                running=True,
                state="Running",
                steam_app_id=1623730,
            ),
            Instance(id="ads", name="ADS01", module="ADS", running=True, state="Running"),
        ],
    )
    monkeypatch.setattr(amp_ports_service, "reconcile", lambda ids: {})
    monkeypatch.setattr(
        steam_service, "game_name", lambda app_id: "Palworld" if app_id == 1623730 else None
    )

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["game"] == "Palworld"
    assert body[1]["game"] is None  # no steam_app_id → not resolved
