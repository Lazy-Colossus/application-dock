"""Integration tests for the AMP endpoints. amp_service is stubbed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.amp import Instance
from app.services import amp_service

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
