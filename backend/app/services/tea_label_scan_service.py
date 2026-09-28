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
import logging
from datetime import UTC, datetime

import anthropic
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.schemas.tea import MIN_YEAR, AutofillSuggestion, LabelScanSuggestion
from app.services import tea_autofill_service as autofill
from app.services.tea_service import image_extension

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 20.0
# label_text is "all legible text", which on a dense CJK back label runs long.
_MAX_TOKENS = 2048
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
    # parse() validates the reply itself: a reply cut off at max_tokens raises
    # ValidationError, a ValueError the router would otherwise turn into a 422.
    except (anthropic.APIError, ValidationError) as exc:
        logger.warning("label scan: Claude call failed", exc_info=exc)
        raise LabelScanUpstreamError(_UPSTREAM_MESSAGE) from exc
    if response.stop_reason in ("refusal", "max_tokens") or response.parsed_output is None:
        logger.warning("label scan: no usable reply (stop_reason=%s)", response.stop_reason)
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
    year = (
        reading.year
        if reading.year and MIN_YEAR <= reading.year <= datetime.now(UTC).year
        else None
    )
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
