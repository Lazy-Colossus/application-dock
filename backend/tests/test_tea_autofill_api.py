"""The /api/tea/autofill surface: status codes for the Jev-backed category match."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import tea_repo as repo
from app.services import tea_autofill_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "typesafe_api_key", "sk-test-key")


def stub_typesafe(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    def capture(request: httpx.Request) -> httpx.Response:
        return handler(request)

    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return real_client(*args, transport=httpx.MockTransport(capture), **kwargs)

    monkeypatch.setattr(service.httpx, "Client", factory)


def choice_response(node_id: str, confidence: float):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answers": {
                    "category": {"choice": node_id, "confidence": confidence, "probabilities": {}}
                }
            },
        )

    return handler


def test_autofill_returns_the_matched_category(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))

    response = client.post("/api/tea/autofill", json={"name": "Da Hong Pao"})

    assert response.status_code == 200
    assert response.json()["catalogue_node_id"] == "oolong.wuyi-yancha.da-hong-pao"


def test_autofill_returns_null_when_unsure(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.1))

    response = client.post("/api/tea/autofill", json={"name": "some tea"})

    assert response.status_code == 200
    assert response.json() is None


def test_autofill_is_422_for_a_blank_name() -> None:
    response = client.post("/api/tea/autofill", json={"name": "   "})
    assert response.status_code == 422


def test_autofill_is_503_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "typesafe_api_key", "")
    response = client.post("/api/tea/autofill", json={"name": "Da Hong Pao"})
    assert response.status_code == 503


def test_autofill_is_502_on_upstream_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_typesafe(monkeypatch, lambda _: httpx.Response(500, json={"error": "nope"}))
    response = client.post("/api/tea/autofill", json={"name": "Da Hong Pao"})
    assert response.status_code == 502
