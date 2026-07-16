from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _add(word_id: str, text: str, visibility: str = "shared", user: str = "dani"):
    return client.post(
        f"/api/hotaru/words/{word_id}/notes",
        params={"user": user},
        json={"text": text, "visibility": visibility},
    )


def _list(word_id: str, user: str = "dani"):
    return client.get(f"/api/hotaru/words/{word_id}/notes", params={"user": user})


def _flip(note_id: str, visibility: str, user: str = "dani"):
    return client.patch(
        f"/api/hotaru/notes/{note_id}",
        params={"user": user},
        json={"visibility": visibility},
    )


def test_add_note_persists_with_author_and_appears_in_list() -> None:
    r = _add("w1", "mnemonic: looks like a gate", user="dani")
    assert r.status_code == 201
    body = r.json()
    assert body["author"] == "dani"
    assert body["text"] == "mnemonic: looks like a gate"
    assert body["word_id"] == "w1"
    assert set(body.keys()) == {"id", "word_id", "author", "text", "visibility", "created_at"}
    listed = _list("w1").json()
    assert [n["id"] for n in listed] == [body["id"]]


def test_a_word_can_carry_multiple_notes_oldest_first() -> None:
    a = _add("w2", "first").json()
    b = _add("w2", "second").json()
    ids = [n["id"] for n in _list("w2").json()]
    assert ids == [a["id"], b["id"]]


def test_shared_note_is_visible_to_both_users() -> None:
    _add("w3", "shared tip", visibility="shared", user="dani")
    assert len(_list("w3", user="dani").json()) == 1
    assert len(_list("w3", user="jake").json()) == 1


def test_private_note_is_visible_only_to_its_author() -> None:
    _add("w4", "my secret hook", visibility="private", user="dani")
    dani = _list("w4", user="dani").json()
    assert len(dani) == 1 and dani[0]["visibility"] == "private"
    # Jake never sees Dani's private note (path boundary, NFR-2).
    assert _list("w4", user="jake").json() == []


def test_list_mixes_shared_and_own_private() -> None:
    _add("w5", "shared", visibility="shared", user="dani")
    _add("w5", "mine", visibility="private", user="dani")
    _add("w5", "jake private", visibility="private", user="jake")
    dani = _list("w5", user="dani").json()
    assert {n["text"] for n in dani} == {"shared", "mine"}  # not jake's private
    jake = _list("w5", user="jake").json()
    assert {n["text"] for n in jake} == {"shared", "jake private"}


def test_empty_text_is_422() -> None:
    assert _add("w6", "   ").status_code == 422


def test_note_at_limit_is_accepted() -> None:
    assert _add("w6b", "x" * 300).status_code == 201


def test_note_over_limit_is_422() -> None:
    r = _add("w6c", "x" * 301)
    assert r.status_code == 422
    assert "300" in r.json()["detail"]


def test_unknown_user_is_404() -> None:
    assert _add("w7", "x", user="ghost").status_code == 404
    assert _list("w7", user="ghost").status_code == 404


def test_flip_shared_to_private_moves_it_and_hides_from_partner() -> None:
    note = _add("wf1", "gate hook", visibility="shared", user="dani").json()
    r = _flip(note["id"], "private", user="dani")
    assert r.status_code == 200
    body = r.json()
    assert body["visibility"] == "private"
    # id + created_at preserved across the move.
    assert body["id"] == note["id"] and body["created_at"] == note["created_at"]
    # Now only Dani sees it; Jake does not (moved under Dani's private file).
    assert {n["id"] for n in _list("wf1", user="dani").json()} == {note["id"]}
    assert _list("wf1", user="jake").json() == []


def test_flip_private_to_shared_reveals_it_to_partner() -> None:
    note = _add("wf2", "my hook", visibility="private", user="dani").json()
    assert _list("wf2", user="jake").json() == []
    r = _flip(note["id"], "shared", user="dani")
    assert r.status_code == 200 and r.json()["visibility"] == "shared"
    # Jake now sees it, attributed to Dani.
    jake = _list("wf2", user="jake").json()
    assert [(n["id"], n["author"]) for n in jake] == [(note["id"], "dani")]


def test_flip_to_same_visibility_is_idempotent_no_duplicate() -> None:
    note = _add("wf3", "tip", visibility="shared", user="dani").json()
    assert _flip(note["id"], "shared", user="dani").status_code == 200
    # Still exactly one note — no re-append.
    assert len(_list("wf3", user="dani").json()) == 1


def test_non_author_cannot_flip_a_shared_note() -> None:
    note = _add("wf4", "dani's shared tip", visibility="shared", user="dani").json()
    # Jake can see it but must not flip it.
    assert _flip(note["id"], "private", user="jake").status_code == 403
    # Unchanged: still shared, still visible to both.
    assert len(_list("wf4", user="jake").json()) == 1


def test_flip_partners_private_note_is_404() -> None:
    note = _add("wf5", "dani secret", visibility="private", user="dani").json()
    # Jake never even reads Dani's private file → not found, not 403 (NFR-2).
    assert _flip(note["id"], "shared", user="jake").status_code == 404


def test_flip_unknown_note_is_404() -> None:
    assert _flip("n-nope", "private", user="dani").status_code == 404


def test_flip_unknown_user_is_404() -> None:
    note = _add("wf6", "x", user="dani").json()
    assert _flip(note["id"], "private", user="ghost").status_code == 404
