"""Reading a tea label photo: Claude's fields, sanity checks, and the Jev category."""

from __future__ import annotations

from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.core.config import settings
from app.schemas.tea import AutofillSuggestion
from app.services import tea_label_scan_service as service

JPEG = b"fake-jpeg-bytes"


class _FakeMessages:
    def __init__(self, outcome: object) -> None:
        self.outcome = outcome
        self.calls: list[dict] = []

    def parse(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def stub_claude(
    monkeypatch: pytest.MonkeyPatch,
    reading: service.LabelReading | None = None,
    *,
    stop_reason: str = "end_turn",
    error: Exception | None = None,
) -> _FakeMessages:
    outcome = error or SimpleNamespace(parsed_output=reading, stop_reason=stop_reason)
    messages = _FakeMessages(outcome)
    monkeypatch.setattr(service, "_client", lambda: SimpleNamespace(messages=messages))
    return messages


def reading(**overrides: object) -> service.LabelReading:
    fields: dict[str, object] = {
        "name": "Da Hong Pao 大紅袍",
        "vendor": "Wuyi Origin",
        "year": 2023,
        "cultivar": "",
        "grams": 100.0,
        "origin": "",
        "label_text": "大紅袍 Da Hong Pao Wuyi Origin 2023 100g",
    }
    fields.update(overrides)
    return service.LabelReading(**fields)


def stub_jev(
    monkeypatch: pytest.MonkeyPatch, outcome: AutofillSuggestion | Exception | None
) -> list[tuple]:
    # Jev's HTTP is exercised by the autofill tests and the scan API test; here
    # only the scan's use of the answer matters.
    calls: list[tuple] = []

    def fake(username: str, name: str, context: str = "") -> AutofillSuggestion | None:
        calls.append((username, name, context))
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(service.autofill, "match_category", fake)
    return calls


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test")


def test_maps_claudes_fields_and_the_jev_category(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, reading())
    jev = stub_jev(
        monkeypatch,
        AutofillSuggestion(catalogue_node_id="oolong.wuyi-yancha.da-hong-pao", origin="Wuyi Shan"),
    )

    result = service.scan("alice", JPEG, "image/jpeg")

    assert result.name == "Da Hong Pao 大紅袍"
    assert result.vendor == "Wuyi Origin"
    assert result.year == 2023
    assert result.grams == 100.0
    assert result.cultivar == ""
    assert result.catalogue_node_id == "oolong.wuyi-yancha.da-hong-pao"
    assert jev == [("alice", "Da Hong Pao 大紅袍", "大紅袍 Da Hong Pao Wuyi Origin 2023 100g")]


def test_sends_the_image_to_the_configured_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "label_scan_model", "claude-test-model")
    claude = stub_claude(monkeypatch, reading())
    stub_jev(monkeypatch, None)

    service.scan("alice", JPEG, "image/png")

    call = claude.calls[0]
    assert call["model"] == "claude-test-model"
    assert call["output_format"] is service.LabelReading
    image = call["messages"][0]["content"][0]
    assert image["type"] == "image"
    assert image["source"]["media_type"] == "image/png"


def test_label_origin_wins_over_the_category_default(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, reading(origin="Tongmu, Fujian"))
    stub_jev(monkeypatch, AutofillSuggestion(catalogue_node_id="x", origin="Wuyi Shan"))
    assert service.scan("alice", JPEG, "image/jpeg").origin == "Tongmu, Fujian"


def test_origin_falls_back_to_the_category_default(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, reading(origin=""))
    stub_jev(monkeypatch, AutofillSuggestion(catalogue_node_id="x", origin="Wuyi Shan"))
    assert service.scan("alice", JPEG, "image/jpeg").origin == "Wuyi Shan"


@pytest.mark.parametrize("year", [1080, 2099])
def test_drops_an_impossible_year(monkeypatch: pytest.MonkeyPatch, year: int) -> None:
    stub_claude(monkeypatch, reading(year=year))
    stub_jev(monkeypatch, None)
    assert service.scan("alice", JPEG, "image/jpeg").year is None


@pytest.mark.parametrize("grams", [0.0, -5.0])
def test_drops_non_positive_grams(monkeypatch: pytest.MonkeyPatch, grams: float) -> None:
    stub_claude(monkeypatch, reading(grams=grams))
    stub_jev(monkeypatch, None)
    assert service.scan("alice", JPEG, "image/jpeg").grams is None


@pytest.mark.parametrize(
    "jev_outcome",
    [
        None,
        service.autofill.AutofillNotConfiguredError("no key"),
        service.autofill.AutofillUpstreamError("down"),
    ],
)
def test_jev_trouble_leaves_the_category_empty_but_keeps_the_rest(
    monkeypatch: pytest.MonkeyPatch, jev_outcome: object
) -> None:
    stub_claude(monkeypatch, reading())
    stub_jev(monkeypatch, jev_outcome)  # type: ignore[arg-type]

    result = service.scan("alice", JPEG, "image/jpeg")

    assert result.catalogue_node_id is None
    assert result.name == "Da Hong Pao 大紅袍"


def test_skips_jev_when_nothing_was_read(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, reading(name="", label_text="", vendor="", year=None, grams=None))
    jev = stub_jev(monkeypatch, None)

    result = service.scan("alice", JPEG, "image/jpeg")

    assert jev == []
    assert result == service.LabelScanSuggestion()


def test_raises_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    with pytest.raises(service.LabelScanNotConfiguredError):
        service.scan("alice", JPEG, "image/jpeg")


def test_rejects_a_non_image_before_calling_claude(monkeypatch: pytest.MonkeyPatch) -> None:
    claude = stub_claude(monkeypatch, reading())
    with pytest.raises(ValueError):
        service.scan("alice", b"%PDF", "application/pdf")
    assert claude.calls == []


def test_sdk_error_becomes_an_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(
        monkeypatch,
        error=anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        ),
    )
    with pytest.raises(service.LabelScanUpstreamError):
        service.scan("alice", JPEG, "image/jpeg")


@pytest.mark.parametrize(("parsed", "stop"), [(None, "end_turn"), (None, "refusal")])
def test_refusal_or_no_output_becomes_an_upstream_error(
    monkeypatch: pytest.MonkeyPatch, parsed: object, stop: str
) -> None:
    stub_claude(monkeypatch, parsed, stop_reason=stop)  # type: ignore[arg-type]
    with pytest.raises(service.LabelScanUpstreamError):
        service.scan("alice", JPEG, "image/jpeg")


def test_truncated_or_invalid_json_becomes_an_upstream_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # messages.parse validates the reply itself; a reply cut off at max_tokens
    # raises pydantic's ValidationError, which is a ValueError (→ 422) unless caught.
    try:
        service.LabelReading.model_validate_json('{"name": "Da Hong')
    except ValueError as exc:
        truncated = exc
    stub_claude(monkeypatch, error=truncated)
    with pytest.raises(service.LabelScanUpstreamError):
        service.scan("alice", JPEG, "image/jpeg")


def test_max_tokens_stop_becomes_an_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_claude(monkeypatch, reading(), stop_reason="max_tokens")
    with pytest.raises(service.LabelScanUpstreamError):
        service.scan("alice", JPEG, "image/jpeg")


def test_upstream_failures_are_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    stub_claude(
        monkeypatch,
        error=anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        ),
    )
    with caplog.at_level("WARNING", logger=service.__name__):
        with pytest.raises(service.LabelScanUpstreamError):
            service.scan("alice", JPEG, "image/jpeg")
    assert any(record.exc_info for record in caplog.records)
