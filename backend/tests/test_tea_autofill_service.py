"""Category-matching logic for tea autofill, via TypeSafe's Jev."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import settings
from app.schemas.almanac import AlmanacEntry
from app.schemas.tea import CatalogueNode
from app.services import tea_autofill_service as service
from app.services import tea_catalogue_service as catalogue

_NODES = [
    CatalogueNode(id="oolong", parent_id=None, name="Oolong", name_zh="烏龍", default_origin=""),
    CatalogueNode(
        id="oolong.wuyi-yancha",
        parent_id="oolong",
        name="Wuyi yancha",
        name_zh="",
        default_origin="Wuyi Shan, Fujian",
    ),
    CatalogueNode(
        id="oolong.wuyi-yancha.da-hong-pao",
        parent_id="oolong.wuyi-yancha",
        name="Da Hong Pao",
        name_zh="大紅袍",
        default_origin="",
    ),
    CatalogueNode(id="green", parent_id=None, name="Green", name_zh="綠茶", default_origin=""),
    CatalogueNode(
        id="green.mystery", parent_id="green", name="Mystery Green", name_zh="", default_origin=""
    ),
]


@pytest.fixture(autouse=True)
def fixed_catalogue(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(catalogue, "merged_nodes", lambda username: _NODES)


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "typesafe_api_key", "sk-test-key")


@pytest.fixture
def no_almanac(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service.almanac_repo, "read_seed_entries", lambda: ())


def stub_typesafe(monkeypatch: pytest.MonkeyPatch, handler) -> list[httpx.Request]:
    """Route every httpx request through `handler`; return the captured requests."""
    seen: list[httpx.Request] = []

    def capture(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    real_client = httpx.Client

    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return real_client(*args, transport=httpx.MockTransport(capture), **kwargs)

    monkeypatch.setattr(service.httpx, "Client", factory)
    return seen


def choice_response(node_id: str, confidence: float):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answers": {
                    "category": {
                        "choice": node_id,
                        "confidence": confidence,
                        "probabilities": {node_id: confidence},
                    }
                }
            },
        )

    return handler


def test_suggest_raises_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "typesafe_api_key", "")
    with pytest.raises(service.AutofillNotConfiguredError):
        service.suggest("alice", "Da Hong Pao")


def test_suggest_raises_on_a_blank_name() -> None:
    with pytest.raises(ValueError):
        service.suggest("alice", "   ")


def test_suggest_returns_none_below_the_confidence_threshold(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.3))
    assert service.suggest("alice", "some tea") is None


def test_suggest_returns_the_matched_node(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))
    result = service.suggest("alice", "Da Hong Pao")
    assert result is not None
    assert result.catalogue_node_id == "oolong.wuyi-yancha.da-hong-pao"


def test_suggest_fills_origin_from_an_ancestors_default_origin(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))
    result = service.suggest("alice", "Da Hong Pao")
    assert result is not None
    assert result.origin == "Wuyi Shan, Fujian"


def test_suggest_falls_back_to_the_almanac_country_when_the_chain_has_no_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service.almanac_repo,
        "read_seed_entries",
        lambda: (
            AlmanacEntry(
                catalogue_node_id="green.mystery", country="Nepal", summary="A mystery green tea."
            ),
        ),
    )
    stub_typesafe(monkeypatch, choice_response("green.mystery", 0.9))
    result = service.suggest("alice", "Mystery Green")
    assert result is not None
    assert result.origin == "Nepal"


def test_suggest_sends_the_almanac_summary_as_candidate_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service.almanac_repo,
        "read_seed_entries",
        lambda: (
            AlmanacEntry(
                catalogue_node_id="oolong.wuyi-yancha.da-hong-pao",
                country="China",
                summary="A legendary Wuyi rock oolong.",
            ),
        ),
    )
    seen = stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))
    service.suggest("alice", "Da Hong Pao")
    assert b"legendary Wuyi rock oolong" in seen[0].content


def test_suggest_sends_the_jev_model_identifier(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    seen = stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))
    service.suggest("alice", "Da Hong Pao")
    assert b'"model"' in seen[0].content
    assert b"jev-latest" in seen[0].content


def test_suggest_returns_none_when_the_model_names_something_outside_the_candidate_set(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    stub_typesafe(monkeypatch, choice_response("not.a.real.node", 0.95))
    assert service.suggest("alice", "Da Hong Pao") is None


def test_suggest_raises_on_upstream_failure(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    stub_typesafe(monkeypatch, lambda _: httpx.Response(500, json={"error": "nope"}))
    with pytest.raises(service.AutofillUpstreamError):
        service.suggest("alice", "Da Hong Pao")


def test_suggest_raises_on_a_network_timeout(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    stub_typesafe(monkeypatch, timeout)
    with pytest.raises(service.AutofillUpstreamError):
        service.suggest("alice", "Da Hong Pao")
