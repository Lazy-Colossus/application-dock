"""The Teaware Cabinet: validation, retiring, deleting, photos, usage and the vessel prefill."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.schemas.tea_session import TeaSessionWrite
from app.schemas.teaware import TeawareWriteRequest
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service
from app.services import tea_session_service as sessions
from app.services import tea_teaware_service as service
from tests.tea_support import cabinet_of, doc_of, share

TIEGUANYIN = "oolong.anxi.tieguanyin"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _req(**overrides: object) -> TeawareWriteRequest:
    payload: dict[str, object] = {
        "name": "Zhuni shuiping",
        "type": "pot",
        "material": "clay",
        "volume_ml": 110,
    }
    payload.update(overrides)
    return TeawareWriteRequest.model_validate(payload)


def _tea(username: str = "alice", node: str = TIEGUANYIN) -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Tea", "catalogue_node_id": node, "grams_remaining": 50}
    )
    return tea_service.create_tea(username, req).id


def _brew(
    tea_id: str,
    session_id: str,
    teaware_id: str | None,
    *,
    username: str = "alice",
    status: str = "finalised",
) -> None:
    sessions.upsert(
        username,
        session_id,
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": status,
                "started_at": "2026-09-27T18:00:00+00:00",
                "curve_source": "generic",
                "teaware_id": teaware_id,
                "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 12}],
            }
        ),
    )


def test_create_mints_an_id_and_trims_the_name() -> None:
    item = service.create_teaware("alice", _req(name="  Zhuni shuiping  "))
    assert item.id.startswith("w-")
    assert item.name == "Zhuni shuiping"
    assert item.created_at == item.updated_at
    assert item.retired_at is None
    assert [w.id for w in service.list_teaware("alice")] == [item.id]


def test_create_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError, match="needs a name"):
        service.create_teaware("alice", _req(name="   "))


def test_create_refuses_a_bad_acquired_date() -> None:
    with pytest.raises(ValueError, match="date like"):
        service.create_teaware("alice", _req(acquired_date="last spring"))


def test_dedication_needs_a_pot_that_seasons() -> None:
    with pytest.raises(ValueError, match="seasons"):
        service.create_teaware("alice", _req(porous=False, dedicated_node_id="oolong"))


def test_dedication_needs_a_known_catalogue_node() -> None:
    with pytest.raises(ValueError, match="No catalogue entry"):
        service.create_teaware("alice", _req(porous=True, dedicated_node_id="not-a-node"))


def test_retiring_stamps_once_and_bringing_back_clears() -> None:
    item = service.create_teaware("alice", _req())
    retired = service.replace_teaware("alice", item.id, _req(retired=True))
    assert retired.retired_at is not None
    again = service.replace_teaware("alice", item.id, _req(retired=True, notes="chipped lid"))
    assert again.retired_at == retired.retired_at
    back = service.replace_teaware("alice", item.id, _req(retired=False))
    assert back.retired_at is None


def test_replace_keeps_the_id_created_at_and_photo() -> None:
    item = service.create_teaware("alice", _req())
    with_photo = service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    replaced = service.replace_teaware("alice", item.id, _req(name="Renamed"))
    assert (replaced.id, replaced.created_at) == (item.id, item.created_at)
    assert replaced.image_url == with_photo.image_url == f"/api/tea/teaware/{item.id}/image"
    assert replaced.name == "Renamed"


@pytest.mark.parametrize("action", ["get", "replace", "delete", "image"])
def test_an_unknown_item_is_not_found(action: str) -> None:
    with pytest.raises(FileNotFoundError):
        if action == "get":
            service.get_teaware("alice", "w-nosuchid")
        elif action == "replace":
            service.replace_teaware("alice", "w-nosuchid", _req())
        elif action == "delete":
            service.delete_teaware("alice", "w-nosuchid")
        else:
            service.image_path("alice", "w-nosuchid")


def test_photos_round_trip_and_refuse_bad_uploads() -> None:
    item = service.create_teaware("alice", _req())
    service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    assert service.image_path("alice", item.id).read_bytes() == b"jpeg-bytes"
    with pytest.raises(ValueError):
        service.save_image("alice", item.id, b"%PDF", "application/pdf")
    cleared = service.delete_image("alice", item.id)
    assert cleared.image_url is None
    with pytest.raises(FileNotFoundError):
        service.image_path("alice", item.id)


def test_delete_clears_the_vessel_from_sessions_and_keeps_them() -> None:
    tea_id = _tea()
    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-live", pot.id, status="in_progress")
    _brew(tea_id, "s-done", pot.id)

    service.delete_teaware("alice", pot.id)

    stored = {s.id: s for s in doc_of("alice").sessions}
    assert set(stored) == {"s-live", "s-done"}
    assert all(s.teaware_id is None for s in stored.values())
    assert all(s.vessel_volume_ml == 110 for s in stored.values())
    assert service.list_teaware("alice") == []


def test_delete_removes_the_photo() -> None:
    item = service.create_teaware("alice", _req())
    service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    service.delete_teaware("alice", item.id)
    assert repo.find_image(cabinet_of("alice"), item.id) is None


def test_a_node_with_dedicated_teaware_cannot_be_deleted() -> None:
    node = catalogue.create_node("alice", CreateNodeRequest(parent_id="oolong", name="House"))
    service.create_teaware("alice", _req(porous=True, dedicated_node_id=node.id))
    with pytest.raises(catalogue.NodeInUseError, match="dedicated here"):
        catalogue.delete_node("alice", node.id)


def test_a_session_copies_the_vessels_volume_until_it_finishes() -> None:
    tea_id = _tea()
    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-1", pot.id, status="in_progress")
    assert doc_of("alice").sessions[0].vessel_volume_ml == 110

    service.replace_teaware("alice", pot.id, _req(volume_ml=120))
    _brew(tea_id, "s-1", pot.id)
    service.replace_teaware("alice", pot.id, _req(volume_ml=150))

    assert doc_of("alice").sessions[0].vessel_volume_ml == 120


def test_a_glazed_clay_shiboridashi_is_a_vessel_you_brew_in() -> None:
    tea_id = _tea()
    shibo = service.create_teaware(
        "alice", _req(name="Shibo", type="shiboridashi", material="clay_glazed", volume_ml=90)
    )
    _brew(tea_id, "s-1", shibo.id)
    assert doc_of("alice").sessions[0].vessel_volume_ml == 90
    assert service.last_used("alice", tea_id) == shibo


def test_a_session_without_a_vessel_has_no_volume() -> None:
    _brew(_tea(), "s-1", None)
    assert doc_of("alice").sessions[0].vessel_volume_ml is None


@pytest.mark.parametrize("problem", ["cup", "retired", "unknown"])
def test_a_session_refuses_a_vessel_it_cannot_be_brewed_in(problem: str) -> None:
    tea_id = _tea()
    if problem == "cup":
        teaware_id = service.create_teaware("alice", _req(type="cup")).id
    elif problem == "retired":
        teaware_id = service.create_teaware("alice", _req(retired=True)).id
    else:
        teaware_id = "w-nosuchid"
    with pytest.raises(ValueError):
        _brew(tea_id, "s-1", teaware_id, status="in_progress")
    assert doc_of("alice").sessions == []


def test_usage_counts_finished_sessions_and_strays_from_the_dedication() -> None:
    oolong = _tea(node=TIEGUANYIN)
    green = _tea(node="green")
    pot = service.create_teaware("alice", _req(porous=True, dedicated_node_id="oolong"))
    _brew(oolong, "s-1", pot.id)
    _brew(green, "s-2", pot.id)
    _brew(oolong, "s-3", pot.id, status="in_progress")

    usage = service.usage("alice", pot.id)

    assert [s.id for s in usage.sessions] == ["s-2", "s-1"]
    assert (usage.total, usage.off_dedication) == (2, 1)


def test_usage_without_a_dedication_counts_nothing_off() -> None:
    pot = service.create_teaware("alice", _req())
    _brew(_tea(node="green"), "s-1", pot.id)
    assert service.usage("alice", pot.id).off_dedication == 0


def test_last_used_prefers_this_teas_last_vessel_then_any() -> None:
    tea_a, tea_b, tea_c = _tea(), _tea(), _tea()
    pot = service.create_teaware("alice", _req())
    gaiwan = service.create_teaware("alice", _req(name="Gaiwan", type="gaiwan"))
    _brew(tea_a, "s-1", pot.id)
    _brew(tea_b, "s-2", gaiwan.id)

    assert service.last_used("alice", tea_a) == service.get_teaware("alice", pot.id)
    assert service.last_used("alice", tea_b).id == gaiwan.id  # type: ignore[union-attr]
    assert service.last_used("alice", tea_c).id == gaiwan.id  # type: ignore[union-attr]
    assert service.last_used("alice", None).id == gaiwan.id  # type: ignore[union-attr]


def test_last_used_is_personal_and_skips_retired() -> None:
    tea_id = _tea()
    share("alice", "bob")
    gaiwan = service.create_teaware("alice", _req(name="Gaiwan", type="gaiwan"))
    _brew(tea_id, "s-bob", gaiwan.id, username="bob")
    assert service.last_used("alice", tea_id) is None

    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-alice", pot.id)
    service.replace_teaware("alice", pot.id, _req(retired=True))
    assert service.last_used("alice", tea_id) is None
