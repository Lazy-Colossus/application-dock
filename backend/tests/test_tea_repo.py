"""Per-user persistence for the Tea Cabinet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _users_dir(tmp_path: Path) -> Path:
    return tmp_path / "tea" / "users"


def _tea(tea_id: str = "t-abc12345") -> Tea:
    return Tea(
        id=tea_id,
        name="Da Hong Pao",
        catalogue_node_id="oolong.wuyi-yancha.da-hong-pao",
        grams_purchased=100,
        grams_remaining=38,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )


def test_read_doc_returns_empty_doc_when_file_absent() -> None:
    doc = repo.read_doc("alice")
    assert isinstance(doc, TeaDoc)
    assert doc.schema_version == 1
    assert doc.teas == []
    assert doc.catalogue_nodes == []


def test_read_doc_does_not_create_a_file(tmp_path: Path) -> None:
    repo.read_doc("alice")
    assert not (_users_dir(tmp_path) / "alice.json").exists()


def test_write_then_read_round_trips_teas_and_nodes(tmp_path: Path) -> None:
    doc = TeaDoc(
        teas=[_tea()],
        catalogue_nodes=[
            CatalogueNode(id="u-11112222", parent_id="oolong", name="Mystery", source="user")
        ],
    )
    repo.write_doc("alice", doc)

    again = repo.read_doc("alice")
    assert [t.id for t in again.teas] == ["t-abc12345"]
    assert [n.id for n in again.catalogue_nodes] == ["u-11112222"]
    assert (_users_dir(tmp_path) / "alice.json").exists()


def test_write_is_valid_json_on_disk(tmp_path: Path) -> None:
    repo.write_doc("alice", TeaDoc(teas=[_tea()]))
    raw = json.loads((_users_dir(tmp_path) / "alice.json").read_text(encoding="utf-8"))
    assert raw["teas"][0]["name"] == "Da Hong Pao"


def test_doc_transaction_persists_on_clean_exit() -> None:
    with repo.doc_transaction("alice") as doc:
        doc.teas.append(_tea())
    assert len(repo.read_doc("alice").teas) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    repo.write_doc("alice", TeaDoc(teas=[_tea()]))
    with pytest.raises(ValueError):
        with repo.doc_transaction("alice") as doc:
            doc.teas.append(_tea("t-99999999"))
            raise ValueError("rejected")
    assert [t.id for t in repo.read_doc("alice").teas] == ["t-abc12345"]


@pytest.mark.parametrize("bad", ["../escape", "a/b", "a\\b", "", "  ", " alice"])
def test_unsafe_usernames_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(bad)


def test_seed_catalogue_loads_and_is_cached() -> None:
    first = repo.read_seed_catalogue()
    second = repo.read_seed_catalogue()
    assert first is second, "the seed is immutable and must be read once"
    assert any(n.id == "oolong.wuyi-yancha.da-hong-pao" for n in first)


def test_seed_catalogue_is_not_in_the_data_dir(tmp_path: Path) -> None:
    repo.read_seed_catalogue()
    assert not (tmp_path / "tea" / "catalogue.json").exists()


def test_find_image_returns_none_when_absent() -> None:
    assert repo.find_image("alice", "t-abc12345") is None


def test_save_image_then_find_image_returns_the_path(tmp_path: Path) -> None:
    repo.save_image("alice", "t-abc12345", b"fake-bytes", "jpg")
    found = repo.find_image("alice", "t-abc12345")
    assert found is not None
    assert found.name == "t-abc12345.jpg"
    assert found.read_bytes() == b"fake-bytes"
    assert found.parent == tmp_path / "tea" / "images" / "alice"


def test_save_image_replaces_a_previous_upload_of_a_different_extension() -> None:
    repo.save_image("alice", "t-abc12345", b"first", "jpg")
    repo.save_image("alice", "t-abc12345", b"second", "png")

    found = repo.find_image("alice", "t-abc12345")
    assert found is not None
    assert found.name == "t-abc12345.png"
    assert found.read_bytes() == b"second"


def test_delete_image_removes_the_file() -> None:
    repo.save_image("alice", "t-abc12345", b"first", "jpg")
    repo.delete_image("alice", "t-abc12345")
    assert repo.find_image("alice", "t-abc12345") is None


def test_delete_image_is_harmless_when_none_exists() -> None:
    repo.delete_image("alice", "t-nosuchimage")


def test_images_are_scoped_per_user() -> None:
    repo.save_image("alice", "t-abc12345", b"alice-photo", "jpg")
    assert repo.find_image("bob", "t-abc12345") is None
