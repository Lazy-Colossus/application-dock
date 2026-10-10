"""Business-logic tests for PageMage."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.services import pagemage_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_create_derives_name_from_filename() -> None:
    page = service.create_page("ana", "My Report.html", b"<p>hi</p>")
    assert page.name == "My Report"
    assert page.html == "<p>hi</p>"
    assert page.id.startswith("p-")


def test_create_rejects_non_html_extension() -> None:
    with pytest.raises(ValueError):
        service.create_page("ana", "notes.txt", b"hello")


def test_create_accepts_htm() -> None:
    page = service.create_page("ana", "old.htm", b"<p>ok</p>")
    assert page.name == "old"


def test_create_rejects_oversize() -> None:
    too_big = b"x" * (2 * 1024 * 1024 + 1)
    with pytest.raises(ValueError):
        service.create_page("ana", "big.html", too_big)


def test_create_rejects_non_utf8() -> None:
    with pytest.raises(ValueError):
        service.create_page("ana", "bad.html", b"\xff\xfe\x00bad")


def test_list_is_newest_first() -> None:
    first = service.create_page("ana", "first.html", b"<p>1</p>")
    second = service.create_page("ana", "second.html", b"<p>2</p>")
    # Stamp them deterministically so ordering is not clock-dependent.
    from app.repositories import pagemage_repo as repo

    first.created_at = "2026-10-01T00:00:00.000Z"
    second.created_at = "2026-10-02T00:00:00.000Z"
    repo.write_page("ana", first)
    repo.write_page("ana", second)
    summaries = service.list_pages("ana")
    assert [s.id for s in summaries] == [second.id, first.id]
    assert not hasattr(summaries[0], "html")


def test_get_missing_raises() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_page("ana", "p-missing1")


def test_update_html_replaces_and_bumps_timestamp() -> None:
    page = service.create_page("ana", "p.html", b"<p>old</p>")
    page.updated_at = "2026-01-01T00:00:00.000Z"
    from app.repositories import pagemage_repo as repo

    repo.write_page("ana", page)
    updated = service.update_html("ana", page.id, "<p>new</p>")
    assert updated.html == "<p>new</p>"
    assert updated.updated_at > "2026-01-01T00:00:00.000Z"
