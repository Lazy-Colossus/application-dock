"""Filesystem persistence tests for PageMage."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import pagemage_repo as repo
from app.schemas.pagemage import Page


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def _page(page_id: str = "p-abc12345", name: str = "Demo") -> Page:
    return Page(
        id=page_id,
        name=name,
        html="<p>hi</p>",
        created_at="2026-10-09T10:00:00.000Z",
        updated_at="2026-10-09T10:00:00.000Z",
    )


def test_write_then_read_roundtrips() -> None:
    repo.write_page("ana", _page())
    got = repo.read_page("ana", "p-abc12345")
    assert got is not None
    assert got.name == "Demo"
    assert got.html == "<p>hi</p>"


def test_read_missing_returns_none() -> None:
    assert repo.read_page("ana", "p-doesnotexist") is None


def test_list_is_scoped_to_the_user() -> None:
    repo.write_page("ana", _page("p-aaaaaaaa", "Ana's"))
    repo.write_page("bob", _page("p-bbbbbbbb", "Bob's"))
    ana = repo.list_pages_for("ana")
    assert [p.id for p in ana] == ["p-aaaaaaaa"]


def test_list_missing_dir_is_empty() -> None:
    assert repo.list_pages_for("nobody") == []


@pytest.mark.parametrize("bad", ["../escape", "a/b", "a\\b", "with.dot", "", "  "])
def test_unsafe_ids_are_rejected(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_page("ana", bad)


def test_find_by_share_token_matches_across_users() -> None:
    p = _page("p-shared01", "Shared")
    p.share_token = "tok-abc"
    repo.write_page("bob", p)
    found = repo.find_by_share_token("tok-abc")
    assert found is not None
    assert found.id == "p-shared01"


def test_find_by_share_token_unknown_is_none() -> None:
    repo.write_page("ana", _page("p-aaaaaaaa"))
    assert repo.find_by_share_token("nope") is None


def test_find_by_share_token_ignores_empty_token() -> None:
    # A page with no token must never be matched by an empty query.
    repo.write_page("ana", _page("p-aaaaaaaa"))  # share_token defaults to ""
    assert repo.find_by_share_token("") is None
