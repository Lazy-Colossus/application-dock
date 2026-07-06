from fastapi.testclient import TestClient

from app.main import app
from app.repositories import vocab_repo

client = TestClient(app)


def _post(body: dict, user: str = "dani"):
    return client.post("/api/hotaru/words", params={"user": user}, json=body)


def _put(word_id: str, body: dict, user: str = "dani"):
    return client.put(f"/api/hotaru/words/{word_id}", params={"user": user}, json=body)


def _delete(word_id: str, user: str = "dani"):
    return client.delete(f"/api/hotaru/words/{word_id}", params={"user": user})


def _make(body: dict, user: str = "dani") -> str:
    r = _post(body, user=user)
    assert r.status_code == 201
    return r.json()["id"]


# --- delete ---------------------------------------------------------------


def test_delete_shared_word_removes_it() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    assert _delete(wid).status_code == 204
    assert all(x.id != wid for x in vocab_repo.read_shared())


def test_delete_private_word_removes_it() -> None:
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani")
    assert _delete(wid, user="dani").status_code == 204
    assert all(x.id != wid for x in vocab_repo.read_private("dani"))


def test_delete_seed_word_is_forbidden() -> None:
    seed_id = vocab_repo.read_seed()[0].id
    assert _delete(seed_id).status_code == 403


def test_delete_unknown_word_is_404() -> None:
    assert _delete("dani-deadbeef").status_code == 404


def test_delete_other_users_private_word_is_404() -> None:
    # jake can't see (or delete) dani's private word.
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani")
    assert _delete(wid, user="jake").status_code == 404
    assert any(x.id == wid for x in vocab_repo.read_private("dani"))


def test_delete_unknown_user_is_404() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat"})
    assert _delete(wid, user="ghost").status_code == 404


# --- update ---------------------------------------------------------------


def test_update_edits_fields_and_preserves_id_and_source() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    r = _put(wid, {"reading": "いぬ", "meaning": "dog", "kanji": "犬", "visibility": "shared"})
    assert r.status_code == 200
    w = r.json()
    assert w["id"] == wid
    assert w["source"] == "dani"
    assert w["reading"] == "いぬ"
    assert w["meaning"] == "dog"
    assert w["kanji"] == "犬"
    # k2r added now that kanji is present.
    assert w["drill_caps"] == ["r2m", "m2r", "k2r"]


def test_update_dropping_kanji_removes_k2r() -> None:
    wid = _make({"reading": "ねこ", "kanji": "猫", "meaning": "cat"})
    w = _put(wid, {"reading": "ねこ", "meaning": "cat", "kanji": ""}).json()
    assert w["kanji"] is None
    assert w["drill_caps"] == ["r2m", "m2r"]


def test_update_shared_to_private_moves_between_files() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    w = _put(wid, {"reading": "ねこ", "meaning": "cat", "visibility": "private"}).json()
    assert w["visibility"] == "private"
    assert all(x.id != wid for x in vocab_repo.read_shared())
    assert any(x.id == wid for x in vocab_repo.read_private("dani"))


def test_update_private_to_shared_moves_between_files() -> None:
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"})
    w = _put(wid, {"reading": "ひみつ", "meaning": "secret", "visibility": "shared"}).json()
    assert w["visibility"] == "shared"
    assert all(x.id != wid for x in vocab_repo.read_private("dani"))
    assert any(x.id == wid for x in vocab_repo.read_shared())


def test_update_seed_word_is_forbidden() -> None:
    seed_id = vocab_repo.read_seed()[0].id
    assert _put(seed_id, {"reading": "x", "meaning": "y"}).status_code == 403


def test_update_unknown_word_is_404() -> None:
    assert _put("dani-deadbeef", {"reading": "x", "meaning": "y"}).status_code == 404


def test_update_blank_fields_return_422() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat"})
    assert _put(wid, {"reading": "  ", "meaning": "cat"}).status_code == 422
    assert _put(wid, {"reading": "ねこ", "meaning": ""}).status_code == 422


def test_update_other_users_private_word_is_404() -> None:
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani")
    assert _put(wid, {"reading": "x", "meaning": "y"}, user="jake").status_code == 404


def test_either_user_can_edit_a_shared_custom_word() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat", "visibility": "shared"}, user="dani")
    r = _put(wid, {"reading": "ねこ", "meaning": "kitty", "visibility": "shared"}, user="jake")
    assert r.status_code == 200
    assert r.json()["meaning"] == "kitty"
