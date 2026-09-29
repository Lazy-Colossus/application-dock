"""Cabinet-keyed persistence for the Tea Cabinet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


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


_SESSION = {
    "id": "s-1",
    "tea_id": "t-abc12345",
    "status": "finalised",
    "started_at": "2026-09-20T18:00:00+00:00",
    "updated_at": "2026-09-20T18:30:00+00:00",
    "finished_at": "2026-09-20T18:30:00+00:00",
    "rating": 4,
    "curve_source": "generic",
    "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 12}],
}


def _write_legacy(tmp_path: Path, username: str = "alice", version: int = 2) -> None:
    raw: dict[str, object] = {
        "schema_version": version,
        "teas": [_tea().model_dump(mode="json")],
        "catalogue_nodes": [],
    }
    if version == 2:
        raw["sessions"] = [_SESSION]
    path = tmp_path / "tea" / "users" / f"{username}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw), encoding="utf-8")


def test_new_cabinet_writes_an_empty_current_doc_owned_by_the_user(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    assert cabinet_id.startswith("c_")
    doc = repo.read_doc(cabinet_id)
    assert (doc.schema_version, doc.id, doc.owner) == (6, cabinet_id, "alice")
    assert doc.teas == [] and doc.sessions == [] and doc.catalogue_nodes == []
    assert doc.teaware == []
    assert (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").is_file()


def test_read_doc_of_a_missing_cabinet_is_gone() -> None:
    with pytest.raises(repo.CabinetGoneError):
        repo.read_doc("c_" + "0" * 32)


def test_write_then_read_round_trips_teas_and_nodes() -> None:
    cabinet_id = repo.new_cabinet("alice")
    doc = TeaDoc(
        id=cabinet_id,
        owner="alice",
        teas=[_tea()],
        catalogue_nodes=[
            CatalogueNode(id="u-11112222", parent_id="oolong", name="Mystery", source="user")
        ],
    )
    repo.write_doc(cabinet_id, doc)
    again = repo.read_doc(cabinet_id)
    assert [t.id for t in again.teas] == ["t-abc12345"]
    assert [n.id for n in again.catalogue_nodes] == ["u-11112222"]


def test_doc_transaction_persists_on_clean_exit() -> None:
    cabinet_id = repo.new_cabinet("alice")
    with repo.doc_transaction(cabinet_id) as doc:
        doc.teas.append(_tea())
    assert len(repo.read_doc(cabinet_id).teas) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    cabinet_id = repo.new_cabinet("alice")
    with pytest.raises(RuntimeError):
        with repo.doc_transaction(cabinet_id) as doc:
            doc.teas.append(_tea())
            raise RuntimeError("boom")
    assert repo.read_doc(cabinet_id).teas == []


def test_doc_transaction_never_recreates_a_deleted_cabinet(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.delete_cabinet(cabinet_id)
    with pytest.raises(repo.CabinetGoneError):
        with repo.doc_transaction(cabinet_id) as doc:
            doc.teas.append(_tea())
    assert not (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").exists()


@pytest.mark.parametrize("bad", ["", "alice", "c_../x", "c_" + "g" * 32, "c_" + "0" * 31])
def test_unsafe_cabinet_ids_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(bad)


@pytest.mark.parametrize("bad", ["", "  ", "../etc", "a/b", "a\\b", " alice"])
def test_unsafe_usernames_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.legacy_exists(bad)


def test_memberships_round_trip_and_start_empty() -> None:
    assert repo.read_memberships() == {}
    repo.write_memberships({"alice": "c_" + "1" * 32})
    assert repo.read_memberships() == {"alice": "c_" + "1" * 32}


def test_images_are_scoped_per_cabinet(tmp_path: Path) -> None:
    alice = repo.new_cabinet("alice")
    bob = repo.new_cabinet("bob")
    repo.save_image(alice, "t-abc12345", b"alice-photo", "jpg")
    found = repo.find_image(alice, "t-abc12345")
    assert found is not None and found.parent == tmp_path / "tea" / "images" / alice
    assert repo.find_image(bob, "t-abc12345") is None


def test_save_image_replaces_a_previous_upload_of_a_different_extension() -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.save_image(cabinet_id, "t-abc12345", b"first", "jpg")
    repo.save_image(cabinet_id, "t-abc12345", b"second", "png")
    found = repo.find_image(cabinet_id, "t-abc12345")
    assert found is not None and found.suffix == ".png"
    assert found.read_bytes() == b"second"


def test_delete_image_is_harmless_when_none_exists() -> None:
    repo.delete_image(repo.new_cabinet("alice"), "t-nosuchimage")


def test_delete_cabinet_removes_the_doc_and_its_photos(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.save_image(cabinet_id, "t-abc12345", b"photo", "jpg")
    repo.delete_cabinet(cabinet_id)
    assert not (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").exists()
    assert not (tmp_path / "tea" / "images" / cabinet_id).exists()


def test_migrate_v1_goes_all_the_way_to_v4() -> None:
    raw: dict[str, object] = {"schema_version": 1, "teas": [], "catalogue_nodes": []}
    upgraded = repo.migrate(raw, cabinet_id="c_" + "1" * 32, owner="alice")
    assert upgraded["schema_version"] == 6
    assert upgraded["sessions"] == []
    assert upgraded["teaware"] == []
    assert (upgraded["id"], upgraded["owner"]) == ("c_" + "1" * 32, "alice")


def test_migrate_v2_marks_every_session_as_brewed_by_the_owner() -> None:
    raw: dict[str, object] = {"schema_version": 2, "teas": [], "sessions": [dict(_SESSION)]}
    upgraded = repo.migrate(raw, cabinet_id="c_" + "1" * 32, owner="alice")
    assert [s["brewed_by"] for s in upgraded["sessions"]] == ["alice"]  # type: ignore[union-attr]


def test_migrate_v2_without_an_owner_is_refused() -> None:
    with pytest.raises(ValueError):
        repo.migrate({"schema_version": 2, "sessions": []})


def test_adopt_legacy_copies_the_doc_and_moves_its_photos(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    legacy_images = tmp_path / "tea" / "images" / "alice"
    legacy_images.mkdir(parents=True)
    (legacy_images / "t-abc12345.jpg").write_bytes(b"photo")

    cabinet_id = repo.adopt_legacy("alice", referenced=set())

    doc = repo.read_doc(cabinet_id)
    assert (doc.id, doc.owner) == (cabinet_id, "alice")
    assert [t.id for t in doc.teas] == ["t-abc12345"]
    assert [s.brewed_by for s in doc.sessions] == ["alice"]
    assert repo.find_image(cabinet_id, "t-abc12345") is not None
    assert not legacy_images.exists()
    # The caller deletes the legacy file only after mapping the id.
    assert repo.legacy_exists("alice")


def test_adopt_legacy_reuses_the_cabinet_an_interrupted_attempt_wrote(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    first = repo.adopt_legacy("alice", referenced=set())
    again = repo.adopt_legacy("alice", referenced=set())
    assert again == first
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1


def test_adopt_legacy_never_reuses_a_mapped_cabinet(tmp_path: Path) -> None:
    mapped = repo.new_cabinet("alice")
    _write_legacy(tmp_path)
    assert repo.adopt_legacy("alice", referenced={mapped}) != mapped


def test_adopt_legacy_recovers_from_a_crash_between_cabinet_write_and_image_move(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A crash after the cabinet doc lands but before the photo folder moves must
    not orphan the image or double-write the cabinet on retry."""
    _write_legacy(tmp_path)
    legacy_images = tmp_path / "tea" / "images" / "alice"
    legacy_images.mkdir(parents=True)
    (legacy_images / "t-abc12345.jpg").write_bytes(b"photo")

    real_rename = Path.rename

    def boom(self: Path, target: object) -> Path:
        raise OSError("simulated crash before the image move")

    monkeypatch.setattr(Path, "rename", boom)
    with pytest.raises(OSError):
        repo.adopt_legacy("alice", referenced=set())

    # The interrupted attempt did write the orphan cabinet doc; the image move
    # never happened.
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1
    assert legacy_images.is_dir()

    monkeypatch.setattr(Path, "rename", real_rename)
    cabinet_id = repo.adopt_legacy("alice", referenced=set())

    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1
    assert repo.find_image(cabinet_id, "t-abc12345") is not None
    assert not legacy_images.exists()


def test_migrate_v3_adds_an_empty_teaware_list() -> None:
    raw: dict[str, object] = {"schema_version": 3, "id": "c_" + "1" * 32, "owner": "alice"}
    upgraded = repo.migrate(raw)
    assert upgraded["schema_version"] == 6
    assert upgraded["teaware"] == []


def test_seed_catalogue_loads_and_is_cached() -> None:
    first = repo.read_seed_catalogue()
    assert first is repo.read_seed_catalogue()
    assert len(first) > 0
