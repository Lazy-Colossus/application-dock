"""Service tests for Shared Notes (Stories 1.2, 1.3).

The service raises stdlib exceptions only; the router translates them. Access
is membership, and a non-member must be indistinguishable from a missing note.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core.config import settings
from app.services import shared_notes_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


# ── minting (Story 1.2, AC-6) ─────────────────────────────────────────────────


def test_create_note_mints_a_prefixed_id() -> None:
    note = service.create_note("ana", "Groceries")
    assert re.fullmatch(r"n-[0-9a-f]{8}", note.id)


def test_create_note_seeds_owner_as_the_first_member() -> None:
    note = service.create_note("ana", "Groceries")
    assert note.owner == "ana"
    assert note.members == ["ana"]


def test_create_note_starts_empty_at_rev_zero() -> None:
    note = service.create_note("ana", "Groceries")
    assert note.body == ""
    assert note.rev == 0


def test_create_note_stamps_iso_utc_timestamps() -> None:
    note = service.create_note("ana", "Groceries")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", note.created_at)
    assert note.updated_at == note.created_at


def test_create_note_trims_the_title() -> None:
    assert service.create_note("ana", "  Groceries  ").title == "Groceries"


@pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
def test_create_note_rejects_a_blank_title(blank: str) -> None:
    with pytest.raises(ValueError):
        service.create_note("ana", blank)


def test_created_ids_are_distinct() -> None:
    ids = {service.create_note("ana", f"Note {i}").id for i in range(25)}
    assert len(ids) == 25


# ── the access resolver (Story 1.3, AC-2) ─────────────────────────────────────


def test_resolve_note_returns_the_note_for_a_member() -> None:
    created = service.create_note("ana", "Groceries")
    assert service.resolve_note("ana", created.id).id == created.id


def test_resolve_note_raises_for_a_non_member() -> None:
    created = service.create_note("ana", "Groceries")
    with pytest.raises(FileNotFoundError):
        service.resolve_note("bo", created.id)


def test_resolve_note_raises_the_same_error_for_a_missing_note() -> None:
    with pytest.raises(FileNotFoundError):
        service.resolve_note("ana", "n-00000000")


def test_resolve_note_raises_value_error_for_an_unsafe_id() -> None:
    with pytest.raises(ValueError):
        service.resolve_note("ana", "../escaped")


def test_service_never_raises_http_exception() -> None:
    from fastapi import HTTPException

    try:
        service.resolve_note("ana", "n-00000000")
    except HTTPException:  # pragma: no cover - the failure we are guarding
        pytest.fail("service raised HTTPException; that belongs in the router")
    except FileNotFoundError:
        pass
