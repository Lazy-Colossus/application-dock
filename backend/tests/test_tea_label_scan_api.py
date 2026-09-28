"""The /api/tea/scan-label surface: status codes, plus Claude → Jev end to end."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import tea_repo as repo
from app.services import tea_autofill_service as autofill
from app.services import tea_label_scan_service as service

client = TestClient(app)
PHOTO = {"file": ("label.jpg", b"fake-jpeg-bytes", "image/jpeg")}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test")
    monkeypatch.setattr(settings, "typesafe_api_key", "sk-test-key")


def stub_claude(monkeypatch: pytest.MonkeyPatch, outcome: object) -> None:
    def parse(**_: object) -> object:
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    fake = SimpleNamespace(messages=SimpleNamespace(parse=parse))
    monkeypatch.setattr(service, "_client", lambda: fake)


def stub_typesafe(monkeypatch: pytest.MonkeyPatch, node_id: str, confidence: float) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answers": {
                    "category": {"choice": node_id, "confidence": confidence, "probabilities": {}}
                }
            },
        )

    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(autofill.httpx, "Client", factory)


def read(**overrides: object) -> SimpleNamespace:
    fields: dict[str, object] = {
        "name": "Da Hong Pao",
        "vendor": "Wuyi Origin",
        "year": 2023,
        "cultivar": "",
        "grams": 100.0,
        "origin": "",
        "label_text": "Da Hong Pao 2023 100g",
    }
    fields.update(overrides)
    return SimpleNamespace(parsed_output=service.LabelReading(**fields), stop_reason="end_turn")


def test_scan_returns_claudes_fields_and_the_jev_category(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, read())
    stub_typesafe(monkeypatch, "oolong.wuyi-yancha.da-hong-pao", 0.9)

    response = client.post("/api/tea/scan-label", files=PHOTO)

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Da Hong Pao"
    assert body["vendor"] == "Wuyi Origin"
    assert body["year"] == 2023
    assert body["grams"] == 100.0
    assert body["catalogue_node_id"] == "oolong.wuyi-yancha.da-hong-pao"
    assert body["origin"] == "Wuyi Shan, Fujian"  # inherited from the Wuyi yancha parent


def test_scan_is_422_for_a_non_image(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, read())
    response = client.post(
        "/api/tea/scan-label", files={"file": ("x.pdf", b"%PDF", "application/pdf")}
    )
    assert response.status_code == 422


def test_scan_is_422_for_an_oversized_image(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, read())
    big = b"x" * (5 * 1024 * 1024 + 1)
    response = client.post("/api/tea/scan-label", files={"file": ("big.jpg", big, "image/jpeg")})
    assert response.status_code == 422


def test_scan_is_503_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    response = client.post("/api/tea/scan-label", files=PHOTO)
    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


def test_scan_is_502_when_claude_refuses(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, SimpleNamespace(parsed_output=None, stop_reason="refusal"))
    response = client.post("/api/tea/scan-label", files=PHOTO)
    assert response.status_code == 502
