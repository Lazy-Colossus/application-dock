from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_topic(name: str = "Food"):
    return client.post("/api/hotaru/topics", json={"name": name})


def _make_word(body: dict, user: str = "dani") -> str:
    r = client.post("/api/hotaru/words", params={"user": user}, json=body)
    assert r.status_code == 201
    return r.json()["id"]


def _assign(topic_id: str, word_id: str, user: str = "dani"):
    return client.post(f"/api/hotaru/topics/{topic_id}/words/{word_id}", params={"user": user})


def _unassign(topic_id: str, word_id: str, user: str = "dani"):
    return client.delete(f"/api/hotaru/topics/{topic_id}/words/{word_id}", params={"user": user})


def _topic_ids(user: str, topic: str) -> list[str]:
    return [
        w["id"]
        for w in client.get("/api/hotaru/words", params={"user": user, "topic": topic}).json()
    ]


# --- create ---------------------------------------------------------------


def test_create_topic_returns_empty_topic() -> None:
    r = _create_topic("Food")
    assert r.status_code == 201
    t = r.json()
    assert t["id"].startswith("t-")
    assert t["name"] == "Food"
    assert t["word_ids"] == []


def test_create_topic_blank_name_is_422() -> None:
    assert _create_topic("   ").status_code == 422


def test_topics_are_shared_and_listed_for_both_users() -> None:
    tid = _create_topic("Verbs").json()["id"]
    for user in ("dani", "jake"):
        ids = [t["id"] for t in client.get("/api/hotaru/topics").json()]
        assert tid in ids, user


# --- assign / unassign ----------------------------------------------------


def test_assign_word_adds_membership_and_is_idempotent() -> None:
    tid = _create_topic().json()["id"]
    wid = _make_word({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    t = _assign(tid, wid).json()
    assert t["word_ids"] == [wid]
    # Assigning again is a no-op, not a duplicate.
    t2 = _assign(tid, wid).json()
    assert t2["word_ids"] == [wid]


def test_unassign_word_removes_membership_and_is_idempotent() -> None:
    tid = _create_topic().json()["id"]
    wid = _make_word({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    _assign(tid, wid)
    assert _unassign(tid, wid).status_code == 204
    # Gone from the topic view.
    assert _topic_ids("dani", tid) == []
    # Unassigning again is still a no-op (204), not a 404.
    assert _unassign(tid, wid).status_code == 204


def test_a_word_can_belong_to_many_topics() -> None:
    t1 = _create_topic("A").json()["id"]
    t2 = _create_topic("B").json()["id"]
    wid = _make_word({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    _assign(t1, wid)
    _assign(t2, wid)
    assert wid in _topic_ids("dani", t1)
    assert wid in _topic_ids("dani", t2)


def test_assign_unknown_topic_is_404() -> None:
    wid = _make_word({"reading": "ねこ", "meaning": "cat"})
    assert _assign("t-missing", wid).status_code == 404


def test_assign_unknown_word_is_404() -> None:
    tid = _create_topic().json()["id"]
    assert _assign(tid, "dani-deadbeef").status_code == 404


def test_assign_unknown_user_is_404() -> None:
    tid = _create_topic().json()["id"]
    wid = _make_word({"reading": "ねこ", "meaning": "cat"})
    assert _assign(tid, wid, user="ghost").status_code == 404


# --- filter + privacy -----------------------------------------------------


def test_topic_filter_returns_only_that_topics_words() -> None:
    tid = _create_topic().json()["id"]
    inside = _make_word({"reading": "ねこ", "meaning": "cat", "visibility": "shared"})
    _make_word({"reading": "いぬ", "meaning": "dog", "visibility": "shared"})  # not assigned
    _assign(tid, inside)
    ids = _topic_ids("dani", tid)
    assert ids == [inside]


def test_private_word_in_a_topic_stays_private() -> None:
    tid = _create_topic().json()["id"]
    priv = _make_word(
        {"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani"
    )
    _assign(tid, priv, user="dani")
    # Owner sees it under the topic; the other user does not.
    assert priv in _topic_ids("dani", tid)
    assert priv not in _topic_ids("jake", tid)


def test_unknown_topic_filter_returns_empty() -> None:
    assert _topic_ids("dani", "t-nope") == []
