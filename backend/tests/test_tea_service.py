"""Tea rules: validation, class resolution, CRUD."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc, TeaWriteRequest
from app.services import tea_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _req(**overrides: object) -> TeaWriteRequest:
    payload: dict[str, object] = {
        "name": "Da Hong Pao",
        "catalogue_node_id": "oolong.wuyi-yancha.da-hong-pao",
        "grams_purchased": 100,
        "grams_remaining": 38,
    }
    payload.update(overrides)
    return TeaWriteRequest.model_validate(payload)


def test_create_returns_a_tea_with_a_minted_id_and_timestamps() -> None:
    tea = service.create_tea("alice", _req())
    assert tea.id.startswith("t-")
    assert tea.created_at == tea.updated_at
    assert tea.class_id == "oolong"


def test_create_trims_the_name() -> None:
    assert service.create_tea("alice", _req(name="  Rou Gui  ")).name == "Rou Gui"


def test_create_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(name="   "))


def test_create_refuses_an_unknown_catalogue_node() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(catalogue_node_id="not-a-node"))


def test_create_accepts_a_bare_class_as_the_classification() -> None:
    assert service.create_tea("alice", _req(catalogue_node_id="oolong")).class_id == "oolong"


def test_remaining_may_not_exceed_purchased() -> None:
    with pytest.raises(ValueError) as excinfo:
        service.create_tea("alice", _req(grams_purchased=100, grams_remaining=130))
    assert "100" in str(excinfo.value)


def test_remaining_may_equal_purchased() -> None:
    assert (
        service.create_tea("alice", _req(grams_purchased=50, grams_remaining=50)).grams_remaining
        == 50
    )


def test_remaining_is_unconstrained_when_purchased_is_unknown() -> None:
    tea = service.create_tea("alice", _req(grams_purchased=None, grams_remaining=900))
    assert tea.grams_remaining == 900


def test_remaining_defaults_to_purchased_when_not_given() -> None:
    req = TeaWriteRequest(name="New cake", catalogue_node_id="dark", grams_purchased=357)
    assert service.create_tea("alice", req).grams_remaining == 357


def test_year_may_not_be_in_the_far_future() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(year=datetime.now(UTC).year + 5))


def test_purchase_date_must_be_a_date() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(purchase_date="last tuesday"))


def test_purchase_date_accepts_iso() -> None:
    assert (
        service.create_tea("alice", _req(purchase_date="2024-03-12")).purchase_date == "2024-03-12"
    )


def test_list_returns_every_tea_with_its_class() -> None:
    service.create_tea("alice", _req())
    service.create_tea("alice", _req(name="Shou Mei", catalogue_node_id="white.fuding.shou-mei"))
    classes = sorted(t.class_id for t in service.list_teas("alice"))
    assert classes == ["oolong", "white"]


def test_list_survives_a_tea_whose_node_has_gone() -> None:
    """Review Focus 2: one unresolvable tea may not fail the whole shelf."""
    repo.write_doc(
        "alice",
        TeaDoc(
            teas=[
                Tea(
                    id="t-orphan01",
                    name="Mystery",
                    catalogue_node_id="retired.in.v2",
                    created_at="2026-09-25T10:00:00+00:00",
                    updated_at="2026-09-25T10:00:00+00:00",
                )
            ]
        ),
    )
    teas = service.list_teas("alice")
    assert [t.class_id for t in teas] == ["other"]


def test_get_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_tea("alice", "t-nosuchid")


def test_replace_overwrites_every_field_and_bumps_updated_at() -> None:
    tea = service.create_tea("alice", _req())
    replaced = service.replace_tea(
        "alice",
        tea.id,
        _req(name="Rou Gui", catalogue_node_id="oolong.wuyi-yancha.rou-gui", grams_remaining=12),
    )
    assert replaced.id == tea.id
    assert replaced.name == "Rou Gui"
    assert replaced.grams_remaining == 12
    assert replaced.created_at == tea.created_at
    assert replaced.updated_at >= tea.updated_at


def test_replace_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.replace_tea("alice", "t-nosuchid", _req())


def test_delete_removes_only_that_tea() -> None:
    first = service.create_tea("alice", _req())
    second = service.create_tea("alice", _req(name="Other"))
    service.delete_tea("alice", first.id)
    assert [t.id for t in service.list_teas("alice")] == [second.id]


def test_delete_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_tea("alice", "t-nosuchid")


def test_a_tea_may_be_classified_against_a_node_the_user_added() -> None:
    from app.schemas.tea import CreateNodeRequest
    from app.services import tea_catalogue_service as catalogue

    node = catalogue.create_node(
        "alice", CreateNodeRequest(parent_id="oolong.wuyi-yancha", name="Bai Ji Guan")
    )
    assert service.create_tea("alice", _req(catalogue_node_id=node.id)).class_id == "oolong"


def test_grams_purchased_of_zero_is_refused_at_the_boundary() -> None:
    """Review Focus 1: zero is 'not recorded', never a denominator."""
    with pytest.raises(ValueError):
        TeaWriteRequest(name="X", catalogue_node_id="oolong", grams_purchased=0)


def test_a_users_teas_are_invisible_to_another_user() -> None:
    service.create_tea("alice", _req())
    assert service.list_teas("bob") == []


def test_seed_nodes_are_never_written_into_a_users_document() -> None:
    service.create_tea("alice", _req())
    assert repo.read_doc("alice").catalogue_nodes == []
    assert isinstance(repo.read_seed_catalogue()[0], CatalogueNode)


def test_save_image_sets_the_served_url_and_bumps_updated_at() -> None:
    tea = service.create_tea("alice", _req())
    updated = service.save_image("alice", tea.id, b"fake-jpeg-bytes", "image/jpeg")
    assert updated.image_url == f"/api/tea/teas/{tea.id}/image"
    assert updated.updated_at >= tea.updated_at


def test_save_image_persists_the_file_via_the_repo() -> None:
    tea = service.create_tea("alice", _req())
    service.save_image("alice", tea.id, b"fake-jpeg-bytes", "image/jpeg")
    found = repo.find_image("alice", tea.id)
    assert found is not None
    assert found.read_bytes() == b"fake-jpeg-bytes"


def test_save_image_rejects_an_unsupported_content_type() -> None:
    tea = service.create_tea("alice", _req())
    with pytest.raises(ValueError):
        service.save_image("alice", tea.id, b"whatever", "application/pdf")


def test_save_image_rejects_content_over_five_megabytes() -> None:
    tea = service.create_tea("alice", _req())
    oversized = b"x" * (5 * 1024 * 1024 + 1)
    with pytest.raises(ValueError):
        service.save_image("alice", tea.id, oversized, "image/jpeg")


def test_save_image_raises_not_found_for_an_unknown_tea() -> None:
    with pytest.raises(FileNotFoundError):
        service.save_image("alice", "t-nosuchid", b"bytes", "image/jpeg")


def test_delete_image_clears_the_url_and_removes_the_file() -> None:
    tea = service.create_tea("alice", _req())
    service.save_image("alice", tea.id, b"bytes", "image/jpeg")

    updated = service.delete_image("alice", tea.id)
    assert updated.image_url is None
    assert repo.find_image("alice", tea.id) is None


def test_delete_image_raises_not_found_for_an_unknown_tea() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_image("alice", "t-nosuchid")


def test_image_path_returns_the_stored_file() -> None:
    tea = service.create_tea("alice", _req())
    service.save_image("alice", tea.id, b"bytes", "image/jpeg")
    assert service.image_path("alice", tea.id).read_bytes() == b"bytes"


def test_image_path_raises_not_found_when_the_tea_has_no_image() -> None:
    tea = service.create_tea("alice", _req())
    with pytest.raises(FileNotFoundError):
        service.image_path("alice", tea.id)


def test_image_path_raises_not_found_for_an_unknown_tea() -> None:
    with pytest.raises(FileNotFoundError):
        service.image_path("alice", "t-nosuchid")
