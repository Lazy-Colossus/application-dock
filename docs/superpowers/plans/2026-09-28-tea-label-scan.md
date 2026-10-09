# Tea Label Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the New Tea page, photograph a tea's label and have the form fill in name, category, origin, vendor, year, cultivar and grams, optionally keeping the photo as the tea's photo.

**Architecture:** A new endpoint `POST /api/tea/scan-label` hands the image to `tea_label_scan_service`, which asks Claude Haiku 4.5 (vision, structured output) to read the label into typed fields, then reuses the existing Jev category match (`tea_autofill_service.match_category`) with the label text as extra context. The frontend downscales the photo, calls the endpoint through the catalogue store, fills only empty fields in one merged patch, and `NewTeaPage` uploads the photo through the existing image endpoint after a successful create when "Use as tea photo" is ticked.

**Tech Stack:** FastAPI / Pydantic v2 / official `anthropic` Python SDK 1.x (`messages.parse`), httpx (TypeSafe), Vue 3 `<script setup lang="ts">`, Pinia, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-28-tea-label-scan-design.md`

## Global Constraints

- Backend is strict 3-layer: HTTP exceptions only in `app/routers/tea.py`; services raise stdlib/custom exceptions.
- `tea_label_scan_service.py` is the only module that imports `anthropic`; `tea_autofill_service.py` stays the only module that talks to TypeSafe.
- Model: `settings.label_scan_model`, default `"claude-haiku-4-5"`. Key: `settings.anthropic_api_key` (env `ANTHROPIC_API_KEY`), default `""`.
- Call Claude through the official SDK (`anthropic.Anthropic(...).messages.parse(..., output_format=LabelReading)`), not raw httpx. Do not pass `temperature`/`top_p`/`top_k` (removed in SDK 1.x).
- Image rules reuse `tea_service.image_extension`: JPEG/PNG/WebP/GIF, ≤ 5MB, else `ValueError` → 422.
- Error mapping: `ValueError` → 422, `LabelScanNotConfiguredError` → 503, `LabelScanUpstreamError` → 502.
- A Jev failure or low confidence never fails a scan; `catalogue_node_id` is just `null`.
- The scan only fills fields that are currently empty (`""` / `null`; `grams_remaining` only from `0`); origin also honours the existing `touchedOrigin` guard.
- All frontend HTTP through `@/composables/useApi` (`api.upload` for multipart). Store actions set `loading` in `try/finally` and route errors to `error.value`.
- Backend: `black . && ruff check .` clean (line length 100). Frontend: `npm run lint` clean.
- Commit directly on `main` (personal app; no feature branches). End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deviation from spec, deliberate: `downscaleImage` decides by **file size and type** (> 1.5MB, or not JPEG/PNG/WebP → re-encode to ≤ 1600px JPEG), not by pixel dimensions, so small files skip decoding entirely and the passthrough is unit-testable in jsdom.

## Review Focus

1. **A phone photo over 5MB or in HEIC.** Expect it to be re-encoded to a JPEG under the limit before upload, not rejected with 422. Pinned by the `image.spec.ts` large-file test (Task 4).
2. **The scanned photo that can't be decoded by the browser** (e.g. HEIC on desktop Chrome). Expect "Couldn't open this photo" and no request, not an unhandled rejection. Pinned in `TeaForm.spec.ts` (Task 5).
3. **Scanning, then typing, then scanning again.** Expect the second scan to leave the typed fields alone. Covered by the pure `labelScanPatch` tests (Task 4) plus the form test that a pre-filled vendor is kept (Task 5).
4. **Claude returns a nonsense year (e.g. 1080, 2099) or 0 grams.** Expect them dropped, so Save never meets a 422 from the write endpoint. Pinned in the service tests (Task 2).
5. **Tea saved but photo upload fails.** Expect the tea saved and the user on its detail page, with the error visible. Pinned in `NewTeaPage.spec.ts` (Task 6).

---

### Task 1: Split Jev category matching so it accepts label context

**Files:**
- Modify: `backend/app/services/tea_autofill_service.py` (the `suggest` function, currently lines ~84–152)
- Test: `backend/tests/test_tea_autofill_service.py`

**Interfaces:**
- Produces: `match_category(username: str, name: str, context: str = "") -> AutofillSuggestion | None`. Raises `AutofillNotConfiguredError` / `AutofillUpstreamError`. Does **not** validate a blank name (the scan may have only label text).
- `suggest(username: str, name: str) -> AutofillSuggestion | None` keeps its current behaviour.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_tea_autofill_service.py`:

```python
def test_match_category_sends_label_text_as_state_when_given(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    seen = stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))

    result = service.match_category("alice", "Da Hong Pao", "大紅袍 Wuyi Shan 2023 100g")

    assert result is not None
    body = json.loads(seen[0].content)
    assert body["state"] == {"tea_name": "Da Hong Pao", "label_text": "大紅袍 Wuyi Shan 2023 100g"}
    assert "label_text" in body["questions"]["category"]["instructions"]


def test_match_category_omits_label_text_without_context(
    monkeypatch: pytest.MonkeyPatch, no_almanac: None
) -> None:
    seen = stub_typesafe(monkeypatch, choice_response("oolong.wuyi-yancha.da-hong-pao", 0.9))

    service.match_category("alice", "Da Hong Pao")

    body = json.loads(seen[0].content)
    assert body["state"] == {"tea_name": "Da Hong Pao"}
    assert "label_text" not in body["questions"]["category"]["instructions"]


def test_match_category_raises_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "typesafe_api_key", "")
    with pytest.raises(service.AutofillNotConfiguredError):
        service.match_category("alice", "", "some label text")
```

Add `import json` to the imports at the top of the file.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_autofill_service.py -v`
Expected: the three new tests FAIL with `AttributeError: module ... has no attribute 'match_category'`; existing tests pass.

- [ ] **Step 3: Implement** — in `tea_autofill_service.py`, replace the start of `suggest` through the `body = {...}` block so the file reads:

```python
_INSTRUCTIONS = (
    "tea_name is free text someone typed while adding a tea to their "
    "personal cabinet. It may be a bare tea name or a vendor product "
    "title decorated with a harvest year, weight, or brand name around "
    "the actual tea. Which catalogue entry does the tea itself refer to?"
)
_LABEL_INSTRUCTIONS = (
    " label_text, when present, is all the text read off the tea's packaging; "
    "use it as further evidence."
)


def suggest(username: str, name: str) -> AutofillSuggestion | None:
    label = name.strip()
    if not label:
        raise ValueError("a tea name is required")
    return match_category(username, label)


def match_category(username: str, name: str, context: str = "") -> AutofillSuggestion | None:
    if not autofill_enabled():
        raise AutofillNotConfiguredError(
            "Autofill is not configured on this server (TYPESAFE_API_KEY)"
        )

    nodes = catalogue.merged_nodes(username)
    index = catalogue.node_index(nodes)
    almanac_by_node = {entry.catalogue_node_id: entry for entry in almanac_repo.read_seed_entries()}
    criteria = {
        node.id: _describe(_path_of(index, node.id), almanac_by_node.get(node.id)) for node in nodes
    }

    state = {"tea_name": name.strip()}
    instructions = _INSTRUCTIONS
    if context:
        state["label_text"] = context
        instructions += _LABEL_INSTRUCTIONS

    body = {
        "model": "jev-latest",
        "state": state,
        "questions": {
            "category": {
                "type": "choice",
                "instructions": instructions,
                "criteria": criteria,
            }
        },
    }
```

Leave everything from `try: with httpx.Client(...)` to the end of the function unchanged (it now belongs to `match_category`). Update the module docstring's first paragraph to: "Given the free-text name someone typed while adding a tea (and, from a label scan, the text read off the packet), asks a single Choice judgment over every catalogue node…".

- [ ] **Step 4: Run all autofill tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_autofill_service.py tests/test_tea_autofill_api.py -v`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd backend && .venv/bin/black app tests && .venv/bin/ruff check app tests
git add app/services/tea_autofill_service.py tests/test_tea_autofill_service.py
git commit -m "refactor(tea): split Jev category match so it accepts label context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Label scan service (Claude vision + Jev)

**Files:**
- Modify: `backend/requirements.txt` (add `anthropic`)
- Modify: `backend/app/core/config.py` (two settings)
- Modify: `backend/app/schemas/tea.py` (rename `_MIN_YEAR` → `MIN_YEAR`; add `LabelScanSuggestion`)
- Create: `backend/app/services/tea_label_scan_service.py`
- Test: `backend/tests/test_tea_label_scan_service.py`

**Interfaces:**
- Consumes: `tea_autofill_service.match_category(username, name, context)` (Task 1); `tea_service.image_extension(content, content_type)`.
- Produces:
  - `app.schemas.tea.LabelScanSuggestion` (fields: `name: str = ""`, `catalogue_node_id: str | None = None`, `origin: str = ""`, `vendor: str = ""`, `year: int | None = None`, `cultivar: str = ""`, `grams: float | None = None`).
  - `tea_label_scan_service.scan(username: str, content: bytes, content_type: str) -> LabelScanSuggestion`
  - `tea_label_scan_service.LabelScanNotConfiguredError`, `LabelScanUpstreamError` (both `RuntimeError`).
  - `tea_label_scan_service._client() -> anthropic.Anthropic`, a module-level seam that tests replace.

- [ ] **Step 1: Add the dependency and settings**

Append to `backend/requirements.txt`:

```
anthropic>=1.8,<2
```

Run: `cd backend && .venv/bin/pip install -r requirements-dev.txt`
Expected: installs `anthropic` 1.8.x (and `httpx2` transitively). The existing `httpx==0.27.2` pin stays; TypeSafe still uses it.

In `backend/app/core/config.py`, directly after `typesafe_api_key: str = ""`, add:

```python

    # Anthropic (Claude vision) — Tea Cabinet label scan. Server-side only.
    # With this unset, the scan endpoint reports itself unconfigured (503).
    anthropic_api_key: str = ""
    label_scan_model: str = "claude-haiku-4-5"
```

In `backend/app/schemas/tea.py`, rename `_MIN_YEAR` to `MIN_YEAR` (definition at line ~42 and its use in `TeaWriteRequest.year`), then after `class AutofillSuggestion` add:

```python
class LabelScanSuggestion(BaseModel):
    """What a photo of a tea's label could fill in. Empty/None = not read."""

    name: str = ""
    catalogue_node_id: str | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = None
    cultivar: str = ""
    grams: float | None = None
```

- [ ] **Step 2: Write the failing tests** — create `backend/tests/test_tea_label_scan_service.py`:

```python
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_label_scan_service.py -v`
Expected: collection ERROR, `ModuleNotFoundError: No module named 'app.services.tea_label_scan_service'`.

- [ ] **Step 4: Implement** — create `backend/app/services/tea_label_scan_service.py`:

```python
"""Label scan for the Tea Cabinet: read a photo of a tea's packaging.

Claude (vision) reads the label into typed fields; the existing Jev category
match then runs on what it read, with the full label text as extra evidence.
This is the only module that talks to Anthropic.

Raises `ValueError` for an image that can't be sent, plus
`LabelScanNotConfiguredError` and `LabelScanUpstreamError`; the router
translates them.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime

import anthropic
from pydantic import BaseModel

from app.core.config import settings
from app.schemas.tea import MIN_YEAR, AutofillSuggestion, LabelScanSuggestion
from app.services import tea_autofill_service as autofill
from app.services.tea_service import image_extension

_TIMEOUT_SECONDS = 20.0
_MAX_TOKENS = 1024
_PROMPT = (
    "This is a photo of a tea's packaging or label. Read it into the fields. "
    "Copy text as printed, keeping Chinese or Japanese characters. Leave a field "
    "empty (or null) when the label doesn't clearly show it; never guess. "
    "`name` is the tea itself (for example 'Da Hong Pao 大紅袍'), not the brand, shop, "
    "or a marketing line. `vendor` is the brand or shop. `year` is the harvest or "
    "production year. `grams` is the net weight of the package in grams. `origin` is "
    "the place the tea comes from, as printed. `label_text` is all legible text."
)
_UPSTREAM_MESSAGE = "Couldn't read the label right now"


class LabelScanNotConfiguredError(RuntimeError):
    """No Anthropic credentials are configured, so a scan cannot work."""


class LabelScanUpstreamError(RuntimeError):
    """Claude refused, failed, or timed out."""


class LabelReading(BaseModel):
    """Claude's structured output: an internal contract, not the API shape."""

    name: str
    vendor: str
    year: int | None
    cultivar: str
    grams: float | None
    origin: str
    label_text: str


def scan_enabled() -> bool:
    return bool(settings.anthropic_api_key)


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=settings.anthropic_api_key, timeout=_TIMEOUT_SECONDS, max_retries=1
    )


def _read(content: bytes, content_type: str) -> LabelReading:
    image = {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": content_type,
            "data": base64.standard_b64encode(content).decode("ascii"),
        },
    }
    try:
        response = _client().messages.parse(
            model=settings.label_scan_model,
            max_tokens=_MAX_TOKENS,
            messages=[{"role": "user", "content": [image, {"type": "text", "text": _PROMPT}]}],
            output_format=LabelReading,
        )
    except anthropic.APIError as exc:
        raise LabelScanUpstreamError(_UPSTREAM_MESSAGE) from exc
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise LabelScanUpstreamError(_UPSTREAM_MESSAGE)
    return response.parsed_output


def _category(username: str, name: str, label_text: str) -> AutofillSuggestion | None:
    """Jev is a bonus here: when it's down or unsure, the scan still returns what Claude read."""
    if not (name or label_text):
        return None
    try:
        return autofill.match_category(username, name, label_text)
    except (autofill.AutofillNotConfiguredError, autofill.AutofillUpstreamError):
        return None


def scan(username: str, content: bytes, content_type: str) -> LabelScanSuggestion:
    image_extension(content, content_type)
    if not scan_enabled():
        raise LabelScanNotConfiguredError(
            "Label scan is not configured on this server (ANTHROPIC_API_KEY)"
        )

    reading = _read(content, content_type)
    name = reading.name.strip()
    # Dropped here so the form never holds a value the tea write endpoint would reject.
    year = reading.year if reading.year and MIN_YEAR <= reading.year <= datetime.now(UTC).year else None
    grams = reading.grams if reading.grams and reading.grams > 0 else None

    category = _category(username, name, reading.label_text.strip())
    return LabelScanSuggestion(
        name=name,
        catalogue_node_id=category.catalogue_node_id if category else None,
        origin=reading.origin.strip() or (category.origin if category else ""),
        vendor=reading.vendor.strip(),
        year=year,
        cultivar=reading.cultivar.strip(),
        grams=grams,
    )
```

If `black` wraps the `year = ...` line past 100 chars, let it; do not hand-shorten logic.

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_label_scan_service.py tests/test_tea_schemas.py tests/test_tea_api.py -v`
Expected: all PASS (the schema/API tests confirm the `MIN_YEAR` rename broke nothing).

- [ ] **Step 6: Lint and commit**

```bash
cd backend && .venv/bin/black app tests && .venv/bin/ruff check app tests
git add requirements.txt app/core/config.py app/schemas/tea.py app/services/tea_label_scan_service.py tests/test_tea_label_scan_service.py
git commit -m "feat(tea): label scan service — Claude vision reads the label, Jev picks the category

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/tea/scan-label` endpoint and compose env

**Files:**
- Modify: `backend/app/routers/tea.py` (imports; new route after `autofill_tea`; module docstring)
- Modify: `docker-compose.yml` (`environment:`)
- Test: `backend/tests/test_tea_label_scan_api.py`

**Interfaces:**
- Consumes: `tea_label_scan_service.scan`, `LabelScanNotConfiguredError`, `LabelScanUpstreamError`, `LabelReading`, `_client` (Task 2); `LabelScanSuggestion` schema.
- Produces: `POST /api/tea/scan-label`, multipart field `file` → `200 LabelScanSuggestion` JSON | 422 | 503 | 502.

- [ ] **Step 1: Write the failing tests** — create `backend/tests/test_tea_label_scan_api.py`:

```python
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_label_scan_api.py -v`
Expected: FAIL — `404` (route doesn't exist) or `405`.

- [ ] **Step 3: Implement the route** — in `backend/app/routers/tea.py`:

Add to imports:

```python
from fastapi.concurrency import run_in_threadpool
```

add `LabelScanSuggestion,` to the `from app.schemas.tea import (...)` list (alphabetical, after `CreateNodeRequest`), and

```python
from app.services import tea_label_scan_service as label_scan
```

after the `tea_curve_service` import. Directly after the `autofill_tea` function, add:

```python
@router.post("/scan-label", response_model=LabelScanSuggestion)
async def scan_tea_label(
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> LabelScanSuggestion:
    content = await file.read()
    try:
        # The SDK call is blocking; keep it off the event loop.
        return await run_in_threadpool(
            label_scan.scan, current_user, content, file.content_type or ""
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except label_scan.LabelScanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except label_scan.LabelScanUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
```

In the module docstring's exception list, append: "`LabelScanNotConfiguredError` / `AutofillNotConfiguredError` -> 503 and their upstream errors -> 502."

- [ ] **Step 4: Pass the keys through compose** — in `docker-compose.yml`, after the `GOOGLE_MAPS_BROWSER_KEY` line, add:

```yaml
      # Tea Cabinet AI helpers. Unset = the feature answers 503; nothing else changes.
      TYPESAFE_API_KEY: ${TYPESAFE_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
```

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: all PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && .venv/bin/black app tests && .venv/bin/ruff check app tests
cd .. && git add backend/app/routers/tea.py backend/tests/test_tea_label_scan_api.py docker-compose.yml
git commit -m "feat(tea): POST /api/tea/scan-label; pass TypeSafe and Anthropic keys through compose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend building blocks — types, `scanLabel` store action, downscaling, fill rules

**Files:**
- Modify: `frontend/src/apps/tea/types.ts` (after `AutofillSuggestion`)
- Modify: `frontend/src/apps/tea/stores/useTeaCatalogueStore.ts`
- Create: `frontend/src/apps/tea/image.ts`
- Create: `frontend/src/apps/tea/labelScan.ts`
- Test: `frontend/src/apps/tea/stores/useTeaCatalogueStore.spec.ts`, `frontend/src/apps/tea/image.spec.ts`, `frontend/src/apps/tea/labelScan.spec.ts`

**Interfaces:**
- Consumes: `POST /tea/scan-label` (Task 3) via `api.upload<T>(path, file)`.
- Produces:
  - `interface LabelScanSuggestion { name: string; catalogue_node_id: string | null; origin: string; vendor: string; year: number | null; cultivar: string; grams: number | null }`
  - `interface ScanChoice { file: File; usePhoto: boolean }`
  - `useTeaCatalogueStore().scanLabel(file: File): Promise<LabelScanSuggestion | null>`
  - `downscaleImage(file: File, maxSide?: number): Promise<File>` (throws if the browser can't decode it)
  - `labelScanPatch(draft: TeaWrite, suggestion: LabelScanSuggestion, originTouched: boolean): { change: Partial<TeaWrite>; filled: string[] }`

- [ ] **Step 1: Add the types** — in `frontend/src/apps/tea/types.ts`, after `AutofillSuggestion`:

```ts
export interface LabelScanSuggestion {
  name: string;
  catalogue_node_id: string | null;
  origin: string;
  vendor: string;
  year: number | null;
  cultivar: string;
  grams: number | null;
}

/** A photo picked for a label scan, and whether it should become the tea's photo. */
export interface ScanChoice {
  file: File;
  usePhoto: boolean;
}
```

- [ ] **Step 2: Write the failing store tests** — in `useTeaCatalogueStore.spec.ts`, add an `uploadMock` next to `postMock` in the `vi.hoisted(...)` block, add `upload: uploadMock` to the mocked `api` object, reset it in `beforeEach` alongside the others, and append inside the existing `describe`:

```ts
  it("scanLabel uploads the photo and returns the suggestion", async () => {
    const suggestion = {
      name: "Da Hong Pao",
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
      vendor: "",
      year: 2023,
      cultivar: "",
      grams: 100,
    };
    uploadMock.mockResolvedValue(suggestion);
    const store = useTeaCatalogueStore();
    const file = new File(["x"], "label.jpg", { type: "image/jpeg" });

    const result = await store.scanLabel(file);

    expect(uploadMock).toHaveBeenCalledWith("/tea/scan-label", file);
    expect(result).toEqual(suggestion);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("scanLabel surfaces a failure and returns null", async () => {
    uploadMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Label scan is not configured on this server" }),
    );
    const store = useTeaCatalogueStore();

    const result = await store.scanLabel(new File(["x"], "label.jpg", { type: "image/jpeg" }));

    expect(result).toBeNull();
    expect(store.error).toContain("not configured");
    expect(store.loading).toBe(false);
  });
```

- [ ] **Step 3: Write the failing pure-function tests** — create `frontend/src/apps/tea/labelScan.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { labelScanPatch } from "./labelScan";
import type { LabelScanSuggestion, TeaWrite } from "./types";

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
  };
}

const full: LabelScanSuggestion = {
  name: "Da Hong Pao",
  catalogue_node_id: "oolong.wuyi",
  origin: "Wuyi Shan, Fujian",
  vendor: "Wuyi Origin",
  year: 2023,
  cultivar: "Qi Dan",
  grams: 100,
};

describe("labelScanPatch", () => {
  it("fills every empty field and lists what it filled", () => {
    const { change, filled } = labelScanPatch(blank(), full, false);
    expect(change).toEqual({
      name: "Da Hong Pao",
      catalogue_node_id: "oolong.wuyi",
      origin: "Wuyi Shan, Fujian",
      vendor: "Wuyi Origin",
      year: 2023,
      cultivar: "Qi Dan",
      grams_purchased: 100,
      grams_remaining: 100,
    });
    expect(filled).toEqual(["name", "category", "origin", "vendor", "year", "cultivar", "grams"]);
  });

  it("never overwrites something already there", () => {
    const draft = {
      ...blank(),
      name: "My name",
      catalogue_node_id: "green",
      vendor: "My shop",
      year: 2020,
      grams_purchased: 50,
      grams_remaining: 20,
    };
    const { change, filled } = labelScanPatch(draft, full, false);
    expect(change).toEqual({ origin: "Wuyi Shan, Fujian", cultivar: "Qi Dan" });
    expect(filled).toEqual(["origin", "cultivar"]);
  });

  it("leaves origin alone once the person has typed in it, even if they cleared it", () => {
    const { change } = labelScanPatch(blank(), full, true);
    expect(change.origin).toBeUndefined();
  });

  it("sets grams purchased but keeps a non-zero grams remaining", () => {
    const { change } = labelScanPatch({ ...blank(), grams_remaining: 30 }, full, false);
    expect(change.grams_purchased).toBe(100);
    expect(change.grams_remaining).toBeUndefined();
  });

  it("returns nothing for an empty suggestion", () => {
    const empty: LabelScanSuggestion = {
      name: "",
      catalogue_node_id: null,
      origin: "",
      vendor: "",
      year: null,
      cultivar: "",
      grams: null,
    };
    expect(labelScanPatch(blank(), empty, false)).toEqual({ change: {}, filled: [] });
  });
});
```

- [ ] **Step 4: Write the failing downscale tests** — create `frontend/src/apps/tea/image.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { downscaleImage } from "./image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downscaleImage", () => {
  it("passes a small JPEG through untouched", async () => {
    const file = new File(["small"], "label.jpg", { type: "image/jpeg" });
    expect(await downscaleImage(file)).toBe(file);
  });

  it("re-encodes a large photo to a JPEG no wider than the limit", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D); // jsdom has no canvas implementation
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
    const big = new File([new Uint8Array(2_000_000)], "IMG_0042.HEIC", { type: "image/heic" });

    const result = await downscaleImage(big);

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0042.jpg");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalled();
  });

  it("throws when the browser can't decode the photo", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("unsupported", "InvalidStateError");
      }),
    );
    const heic = new File(["x"], "IMG.HEIC", { type: "image/heic" });
    await expect(downscaleImage(heic)).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/labelScan.spec.ts src/apps/tea/image.spec.ts src/apps/tea/stores/useTeaCatalogueStore.spec.ts`
Expected: FAIL — missing modules `./labelScan`, `./image`, and `store.scanLabel is not a function`.

- [ ] **Step 6: Implement the store action** — in `useTeaCatalogueStore.ts`, add `LabelScanSuggestion` to the type import, and after `autofill`:

```ts
  async function scanLabel(file: File): Promise<LabelScanSuggestion | null> {
    loading.value = true;
    try {
      const suggestion = await api.upload<LabelScanSuggestion>("/tea/scan-label", file);
      error.value = null;
      return suggestion;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }
```

and add `scanLabel` to the returned object.

- [ ] **Step 7: Implement `labelScan.ts`**:

```ts
import type { LabelScanSuggestion, TeaWrite } from "./types";

/**
 * The fields a label scan may fill: only ones still empty, so a scan never
 * overwrites typing (and a second scan never overwrites the first's result
 * once the person has corrected it). `filled` names them for the message.
 */
export function labelScanPatch(
  draft: TeaWrite,
  suggestion: LabelScanSuggestion,
  originTouched: boolean,
): { change: Partial<TeaWrite>; filled: string[] } {
  const change: Partial<TeaWrite> = {};
  const filled: string[] = [];

  if (suggestion.name && !draft.name.trim()) {
    change.name = suggestion.name;
    filled.push("name");
  }
  if (suggestion.catalogue_node_id && !draft.catalogue_node_id) {
    change.catalogue_node_id = suggestion.catalogue_node_id;
    filled.push("category");
  }
  if (suggestion.origin && !originTouched && !draft.origin) {
    change.origin = suggestion.origin;
    filled.push("origin");
  }
  if (suggestion.vendor && !draft.vendor) {
    change.vendor = suggestion.vendor;
    filled.push("vendor");
  }
  if (suggestion.year !== null && draft.year === null) {
    change.year = suggestion.year;
    filled.push("year");
  }
  if (suggestion.cultivar && !draft.cultivar) {
    change.cultivar = suggestion.cultivar;
    filled.push("cultivar");
  }
  if (suggestion.grams !== null && draft.grams_purchased === null) {
    change.grams_purchased = suggestion.grams;
    if (draft.grams_remaining === 0) change.grams_remaining = suggestion.grams;
    filled.push("grams");
  }
  return { change, filled };
}
```

- [ ] **Step 8: Implement `image.ts`**:

```ts
const MAX_SIDE = 1600;
// Phone cameras produce 3–8MB photos, over the server's 5MB limit; files under
// this size in a type the server keeps go up byte-for-byte, undecoded.
const PASSTHROUGH_BYTES = 1_500_000;
const PASSTHROUGH_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const JPEG_QUALITY = 0.85;

/** A photo small enough to upload: re-encoded as JPEG, longest side ≤ `maxSide`. */
export async function downscaleImage(file: File, maxSide = MAX_SIDE): Promise<File> {
  if (file.size <= PASSTHROUGH_BYTES && PASSTHROUGH_TYPES.has(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Couldn't re-encode the photo");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}
```

- [ ] **Step 9: Run to verify they pass**

Run: `cd frontend && npx vitest run src/apps/tea/labelScan.spec.ts src/apps/tea/image.spec.ts src/apps/tea/stores/useTeaCatalogueStore.spec.ts`
Expected: all PASS.

- [ ] **Step 10: Lint and commit**

```bash
cd frontend && npm run lint
git add src/apps/tea/types.ts src/apps/tea/stores/useTeaCatalogueStore.ts src/apps/tea/stores/useTeaCatalogueStore.spec.ts src/apps/tea/image.ts src/apps/tea/image.spec.ts src/apps/tea/labelScan.ts src/apps/tea/labelScan.spec.ts
git commit -m "feat(tea): scanLabel store action, photo downscaling, and label fill rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Scan label" on the tea form

**Files:**
- Modify: `frontend/src/apps/tea/components/TeaForm.vue`
- Test: `frontend/src/apps/tea/components/TeaForm.spec.ts`

**Interfaces:**
- Consumes: `useTeaCatalogueStore().scanLabel`, `downscaleImage`, `labelScanPatch`, `ScanChoice` (Task 4).
- Produces: new emit `"update:scan": [value: ScanChoice | null]` on `TeaForm`. Test ids: `scan-label` (button), `scan-input` (file input), `scan-thumb`, `scan-use-photo` (checkbox), `scan-message`.

- [ ] **Step 1: Write the failing tests** — in `TeaForm.spec.ts`:

Change the hoisted mock to include `uploadMock`, and add an image mock *before* `import TeaForm`:

```ts
const { postMock, uploadMock } = vi.hoisted(() => ({ postMock: vi.fn(), uploadMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: postMock, put: vi.fn(), del: vi.fn(), upload: uploadMock },
}));
const { downscaleMock } = vi.hoisted(() => ({ downscaleMock: vi.fn() }));
vi.mock("../image", () => ({ downscaleImage: downscaleMock }));
```

In the top-level `beforeEach`, add:

```ts
  uploadMock.mockReset();
  downscaleMock.mockReset();
  downscaleMock.mockImplementation(async (file: File) => file);
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:thumb");
  URL.revokeObjectURL = vi.fn();
```

Append a new block at the end of the file:

```ts
const SUGGESTION = {
  name: "Da Hong Pao",
  catalogue_node_id: "oolong.wuyi",
  origin: "Wuyi Shan, Fujian",
  vendor: "Wuyi Origin",
  year: 2023,
  cultivar: "",
  grams: 100,
};

async function pickPhoto(wrapper: ReturnType<typeof form>, file: File) {
  const input = wrapper.get('[data-testid="scan-input"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

describe("TeaForm label scan", () => {
  const photo = () => new File(["x"], "label.jpg", { type: "image/jpeg" });

  it("fills the empty fields from the scan in one patch and says what it filled", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(uploadMock).toHaveBeenCalledWith("/tea/scan-label", expect.any(File));
    const emitted = wrapper.emitted("update:modelValue") ?? [];
    expect(emitted).toHaveLength(1);
    const last = emitted[0][0] as TeaWrite;
    expect(last.name).toBe("Da Hong Pao");
    expect(last.catalogue_node_id).toBe("oolong.wuyi");
    expect(last.vendor).toBe("Wuyi Origin");
    expect(last.year).toBe(2023);
    expect(last.grams_purchased).toBe(100);
    expect(last.grams_remaining).toBe(100);
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe(
      "Filled name, category, origin, vendor, year, grams",
    );
  });

  it("keeps what the person already typed", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form({ ...blank(), name: "My Rock Tea", vendor: "Local shop" });

    await pickPhoto(wrapper, photo());

    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.name).toBe("My Rock Tea");
    expect(last.vendor).toBe("Local shop");
  });

  it("shows a thumbnail and emits the photo with 'use as tea photo' off, then on", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form();
    const file = photo();

    await pickPhoto(wrapper, file);

    expect(wrapper.get('[data-testid="scan-thumb"]').attributes("src")).toBe("blob:thumb");
    expect(wrapper.emitted("update:scan")?.at(-1)?.[0]).toEqual({ file, usePhoto: false });

    await wrapper.get('[data-testid="scan-use-photo"]').setValue(true);
    expect(wrapper.emitted("update:scan")?.at(-1)?.[0]).toEqual({ file, usePhoto: true });
  });

  it("says so when the photo had nothing new to fill", async () => {
    uploadMock.mockResolvedValue({
      name: "",
      catalogue_node_id: null,
      origin: "",
      vendor: "",
      year: null,
      cultivar: "",
      grams: null,
    });
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe(
      "Couldn't read anything new from this photo",
    );
  });

  it("shows the server's error when the scan fails", async () => {
    uploadMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Label scan is not configured on this server" }),
    );
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(wrapper.get('[data-testid="scan-message"]').text()).toContain("not configured");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("tells the person when the photo can't be opened, without calling the server", async () => {
    downscaleMock.mockRejectedValue(new Error("unsupported"));
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(uploadMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe("Couldn't open this photo");
    expect(wrapper.find('[data-testid="scan-thumb"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaForm.spec.ts`
Expected: the new `TeaForm label scan` tests FAIL (`Unable to get [data-testid="scan-input"]`); existing tests still pass.

- [ ] **Step 3: Implement the template** — in `TeaForm.vue`, directly after the `field-image-url` `<input ... />`, insert:

```html
    <div class="form__scan">
      <button
        type="button"
        class="form__autofill"
        data-testid="scan-label"
        :disabled="scanning"
        @click="scanInput?.click()"
      >
        {{ scanning ? "Reading label…" : "Scan label" }}
      </button>
      <input
        ref="scanInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="form__scan-input"
        data-testid="scan-input"
        @change="onScanChosen"
      />
    </div>
    <div v-if="scanPreview" class="form__scan-result">
      <img :src="scanPreview" class="form__scan-thumb" data-testid="scan-thumb" alt="Scanned label" />
      <label class="form__scan-use">
        <input type="checkbox" data-testid="scan-use-photo" :checked="usePhoto" @change="onUsePhoto" />
        Use as tea photo
      </label>
    </div>
    <p v-if="scanMessage" class="form__autofill-message" data-testid="scan-message">
      {{ scanMessage }}
    </p>
```

- [ ] **Step 4: Implement the script** — in `TeaForm.vue` `<script setup>`:

Change the vue import to `import { computed, onBeforeUnmount, ref } from "vue";`, add

```ts
import { downscaleImage } from "../image";
import { labelScanPatch } from "../labelScan";
```

add `ScanChoice` to the `../types` type import, and extend the emits:

```ts
const emit = defineEmits<{
  "update:modelValue": [value: TeaWrite];
  "update:scan": [value: ScanChoice | null];
  "add-node": [parentId: string];
}>();
```

After `onAutofill`, add:

```ts
const scanInput = ref<HTMLInputElement | null>(null);
const scanning = ref(false);
const scanMessage = ref("");
const scanFile = ref<File | null>(null);
const scanPreview = ref<string | null>(null);
const usePhoto = ref(false);

function emitScan(): void {
  emit("update:scan", scanFile.value ? { file: scanFile.value, usePhoto: usePhoto.value } : null);
}

function setScanFile(file: File): void {
  if (scanPreview.value) URL.revokeObjectURL(scanPreview.value);
  scanFile.value = file;
  scanPreview.value = URL.createObjectURL(file);
  emitScan();
}

function onUsePhoto(event: Event): void {
  usePhoto.value = (event.target as HTMLInputElement).checked;
  emitScan();
}

async function onScanChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = ""; // so picking the same photo again still fires change
  if (!picked) return;
  scanMessage.value = "";
  scanning.value = true;
  try {
    let file: File;
    try {
      file = await downscaleImage(picked);
    } catch {
      scanMessage.value = "Couldn't open this photo";
      return;
    }
    setScanFile(file);
    const suggestion = await catalogueStore.scanLabel(file);
    if (!suggestion) {
      scanMessage.value = catalogueStore.error || "Couldn't read the label right now";
      return;
    }
    const { change, filled } = labelScanPatch(props.modelValue, suggestion, touchedOrigin.value);
    if (filled.length === 0) {
      scanMessage.value = "Couldn't read anything new from this photo";
      return;
    }
    patch(change);
    scanMessage.value = `Filled ${filled.join(", ")}`;
  } finally {
    scanning.value = false;
  }
}

onBeforeUnmount(() => {
  if (scanPreview.value) URL.revokeObjectURL(scanPreview.value);
});
```

- [ ] **Step 5: Style it** — append to the `<style scoped lang="scss">` block:

```scss
.form__scan {
  display: flex;
  margin-bottom: 8px;
}
.form__scan-input {
  display: none;
}
.form__scan-result {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.form__scan-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid #3b3026;
}
.form__scan-use {
  color: #9a8b78;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaForm.spec.ts`
Expected: all PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd frontend && npm run lint
git add src/apps/tea/components/TeaForm.vue src/apps/tea/components/TeaForm.spec.ts
git commit -m "feat(tea): Scan label on the tea form fills empty fields from a photo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keep the scanned photo on save

**Files:**
- Modify: `frontend/src/apps/tea/pages/NewTeaPage.vue`
- Test: `frontend/src/apps/tea/pages/NewTeaPage.spec.ts`

**Interfaces:**
- Consumes: `TeaForm`'s `update:scan` emit and `ScanChoice` (Tasks 4–5); `useTeaCabinetStore().uploadImage(teaId: string, file: File): Promise<void>` (existing, sets `error` on failure).

- [ ] **Step 1: Write the failing tests** — in `NewTeaPage.spec.ts`:

Add `uploadMock: vi.fn()` to the `vi.hoisted` block and `upload: uploadMock` to the mocked `api`. The file's `beforeEach` already calls `vi.clearAllMocks()`, which covers `uploadMock`; each new test sets its own resolved value. Add `import TeaForm from "../components/TeaForm.vue";` after the `NewTeaPage` import. Append inside the top-level `describe`:

```ts
  async function fillRequired(wrapper: Awaited<ReturnType<typeof render>>) {
    await wrapper.get('[data-testid="field-name"]').setValue("Da Hong Pao");
    wrapper.getComponent(TeaForm).vm.$emit("update:modelValue", {
      ...(wrapper.getComponent(TeaForm).props("modelValue") as object),
      catalogue_node_id: "oolong",
    });
    await flushPromises();
  }

  const photo = () => new File(["x"], "label.jpg", { type: "image/jpeg" });

  it("uploads the scanned photo after saving when 'use as tea photo' is ticked", async () => {
    const wrapper = await render();
    await fillRequired(wrapper);
    const file = photo();
    wrapper.getComponent(TeaForm).vm.$emit("update:scan", { file, usePhoto: true });
    postMock.mockResolvedValue(tea());
    uploadMock.mockResolvedValue(tea({ image_url: "/api/tea/teas/created-1/image" }));

    await wrapper.get('[data-testid="new-save"]').trigger("click");
    await flushPromises();

    expect(uploadMock).toHaveBeenCalledWith("/tea/teas/created-1/image", file);
    expect(push).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "created-1" } });
  });

  it("doesn't upload the scanned photo when the box is unticked", async () => {
    const wrapper = await render();
    await fillRequired(wrapper);
    wrapper.getComponent(TeaForm).vm.$emit("update:scan", { file: photo(), usePhoto: false });
    postMock.mockResolvedValue(tea());

    await wrapper.get('[data-testid="new-save"]').trigger("click");
    await flushPromises();

    expect(uploadMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "created-1" } });
  });

  it("still lands on the saved tea when the photo upload fails", async () => {
    const wrapper = await render();
    await fillRequired(wrapper);
    wrapper.getComponent(TeaForm).vm.$emit("update:scan", { file: photo(), usePhoto: true });
    postMock.mockResolvedValue(tea());
    uploadMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Images must be 5MB or smaller" }));

    await wrapper.get('[data-testid="new-save"]').trigger("click");
    await flushPromises();

    expect(push).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "created-1" } });
  });

  it("asks before leaving once a label photo has been picked", async () => {
    const wrapper = await render();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    wrapper.getComponent(TeaForm).vm.$emit("update:scan", { file: photo(), usePhoto: false });
    await flushPromises();

    expect(leaveGuard?.()).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });
```

Before writing `fillRequired`, read the existing "disables Save…" test (line ~110) and reuse however it sets the classification if it differs; the goal is only "name + catalogue_node_id set so Save is enabled". Check how the existing "asks before leaving" test restores `window.confirm` and follow that.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/NewTeaPage.spec.ts`
Expected: the upload test FAILS (`uploadMock` not called) and the leave-guard test FAILS (returns `true`); the unticked and upload-fails tests may pass already, which is fine.

- [ ] **Step 3: Implement** — in `NewTeaPage.vue`:

Template: `<TeaForm v-model="draft" :nodes="catalogue.nodes" @add-node="openAddNode" @update:scan="scan = $event" />`

Script: add `ScanChoice` to the `../types` type import, then:

```ts
const scan = ref<ScanChoice | null>(null);
```

Replace `dirty`:

```ts
const dirty = computed(
  () =>
    !saved.value &&
    (JSON.stringify(draft.value) !== JSON.stringify(blank()) || scan.value !== null),
);
```

Replace `save`:

```ts
async function save(): Promise<void> {
  const created = await cabinet.createTea(draft.value);
  if (!created) return; // The error is on screen; the typing is not thrown away.
  // A failed upload leaves cabinet.error set for the detail page; the tea itself is saved.
  if (scan.value?.usePhoto) await cabinet.uploadImage(created.id, scan.value.file);
  saved.value = true;
  void router.push({ name: "tea-detail", params: { teaId: created.id } });
}
```

- [ ] **Step 4: Run the frontend suite**

Run: `cd frontend && npm test`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npm run lint
git add src/apps/tea/pages/NewTeaPage.vue src/apps/tea/pages/NewTeaPage.spec.ts
git commit -m "feat(tea): attach the scanned label photo on save when asked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end check in the running app

**Files:** none (verification only).

- [ ] **Step 1: Full suites**

Run: `cd backend && .venv/bin/pytest -q && .venv/bin/black --check . && .venv/bin/ruff check .`
Run: `cd frontend && npm test && npm run lint`
Expected: all green.

- [ ] **Step 2: Real scan, if a key is available**

With `ANTHROPIC_API_KEY` (and `TYPESAFE_API_KEY`) exported, start the backend (`DATA_DIR=./local-data uvicorn app.main:app --reload --port 9000`) and frontend (`npm run dev`). On New tea, press "Scan label" and pick a real tea-packet photo. Confirm: the thumbnail appears, fields fill, typed fields survive a second scan, ticking "Use as tea photo" and saving shows the photo on the detail page. Without a key, confirm the message reads "Label scan is not configured on this server (ANTHROPIC_API_KEY)". Report which of these were actually exercised.
