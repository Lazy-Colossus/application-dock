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


def _edit(note_id: str, text: str, user: str = "dani"):
    return client.patch(
        f"/api/hotaru/notes/{note_id}",
        params={"user": user},
        json={"text": text},
    )


def _delete(note_id: str, user: str = "dani"):
    return client.delete(f"/api/hotaru/notes/{note_id}", params={"user": user})


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


# --- Story 3.6: edit text + delete --------------------------------------------


def test_edit_note_text_in_place_preserves_identity() -> None:
    note = _add("we1", "gate hook", visibility="shared", user="dani").json()
    r = _edit(note["id"], "looks like a gate 門", user="dani")
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "looks like a gate 門"
    # Identity + visibility + created_at preserved; still shared, still one note.
    assert body["id"] == note["id"] and body["created_at"] == note["created_at"]
    assert body["visibility"] == "shared"
    listed = _list("we1", user="jake").json()  # visible to both, edited
    assert [n["text"] for n in listed] == ["looks like a gate 門"]


def test_edit_trims_and_rejects_empty_or_oversize() -> None:
    note = _add("we2", "ok", user="dani").json()
    assert _edit(note["id"], "   ", user="dani").status_code == 422
    assert _edit(note["id"], "x" * 301, user="dani").status_code == 422
    # A valid edit with surrounding whitespace is trimmed.
    assert _edit(note["id"], "  trimmed  ", user="dani").json()["text"] == "trimmed"


def test_edit_and_flip_compose_in_one_patch() -> None:
    note = _add("we3", "shared tip", visibility="shared", user="dani").json()
    r = client.patch(
        f"/api/hotaru/notes/{note['id']}",
        params={"user": "dani"},
        json={"text": "now private", "visibility": "private"},
    )
    assert r.status_code == 200
    assert r.json()["text"] == "now private" and r.json()["visibility"] == "private"
    # Moved to Dani's private file → gone for Jake.
    assert _list("we3", user="jake").json() == []
    dani = _list("we3", user="dani").json()
    assert [(n["text"], n["visibility"]) for n in dani] == [("now private", "private")]


def test_edit_with_same_visibility_edits_in_place_without_duplicating() -> None:
    note = _add("we3b", "orig", visibility="shared", user="dani").json()
    r = client.patch(
        f"/api/hotaru/notes/{note['id']}",
        params={"user": "dani"},
        json={"text": "edited", "visibility": "shared"},  # visibility unchanged
    )
    assert r.status_code == 200
    assert r.json()["text"] == "edited" and r.json()["visibility"] == "shared"
    # Still exactly one note — the same-visibility "move" is an idempotent no-op.
    assert [n["text"] for n in _list("we3b", user="dani").json()] == ["edited"]


def test_edit_non_author_is_403_and_unknown_is_404() -> None:
    note = _add("we4", "dani's shared", visibility="shared", user="dani").json()
    assert _edit(note["id"], "hijack", user="jake").status_code == 403
    assert _edit("n-nope", "x", user="dani").status_code == 404


def test_delete_own_note_removes_it() -> None:
    a = _add("wd1", "first", user="dani").json()
    _add("wd1", "second", user="dani")
    assert _delete(a["id"], user="dani").status_code == 204
    assert [n["text"] for n in _list("wd1", user="dani").json()] == ["second"]


def test_delete_non_author_shared_note_is_403() -> None:
    note = _add("wd2", "dani's shared", visibility="shared", user="dani").json()
    assert _delete(note["id"], user="jake").status_code == 403
    assert len(_list("wd2", user="jake").json()) == 1  # untouched


def test_delete_partners_private_note_is_404() -> None:
    note = _add("wd3", "dani secret", visibility="private", user="dani").json()
    # Jake never reads Dani's private file → not found, not 403 (NFR-2).
    assert _delete(note["id"], user="jake").status_code == 404
    assert len(_list("wd3", user="dani").json()) == 1  # still there for Dani


def test_delete_unknown_or_unknown_user_is_404() -> None:
    note = _add("wd4", "x", user="dani").json()
    assert _delete("n-nope", user="dani").status_code == 404
    assert _delete(note["id"], user="ghost").status_code == 404


def test_deleting_a_word_cascades_its_notes() -> None:
    # A real custom (deletable) shared word with notes from both users.
    wid = client.post(
        "/api/hotaru/words",
        params={"user": "dani"},
        json={"reading": "いぬ", "meaning": "dog", "visibility": "shared"},
    ).json()["id"]
    _add(wid, "dani shared", visibility="shared", user="dani")
    _add(wid, "dani private", visibility="private", user="dani")
    _add(wid, "jake private", visibility="private", user="jake")
    assert len(_list(wid, user="dani").json()) == 2  # shared + own private

    r = client.delete(f"/api/hotaru/words/{wid}", params={"user": "dani"})
    assert r.status_code == 204

    # Every note for the word is gone — shared and BOTH users' private (no orphans).
    assert _list(wid, user="dani").json() == []
    assert _list(wid, user="jake").json() == []
