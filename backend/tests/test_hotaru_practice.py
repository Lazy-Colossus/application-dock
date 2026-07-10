from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.repositories import progress_repo
from app.schemas.hotaru import ProgressEntry

client = TestClient(app)

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_word(body: dict, user: str = "dani") -> str:
    r = client.post("/api/hotaru/words", params={"user": user}, json=body)
    assert r.status_code == 201
    return r.json()["id"]


def _create_topic(name: str = "Food") -> str:
    return client.post("/api/hotaru/topics", json={"name": name}).json()["id"]


def _assign(topic_id: str, word_id: str, user: str = "dani") -> None:
    client.post(f"/api/hotaru/topics/{topic_id}/words/{word_id}", params={"user": user})


def _overview(scope: str, user: str = "dani"):
    return client.get("/api/hotaru/practice/overview", params={"scope": scope, "user": user})


def test_overview_counts_words_in_a_lesson_scope() -> None:
    _make_word({"reading": "ねこ", "meaning": "cat", "source": "genki_3", "lesson": "L2"})
    _make_word({"reading": "いぬ", "meaning": "dog", "source": "genki_3", "lesson": "L2"})
    r = _overview("lesson:L2")
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "lesson:L2"
    assert body["word_count"] >= 2
    assert sum(body["familiarity"]) == body["word_count"]


def test_familiarity_distribution_reflects_progress() -> None:
    tid = _create_topic()
    w1 = _make_word({"reading": "あ", "meaning": "a"})
    w2 = _make_word({"reading": "い", "meaning": "i"})
    _assign(tid, w1)
    _assign(tid, w2)
    # w1 reviewed to Learning (tier 1); w2 left unreviewed (tier 0/New).
    progress_repo.set_entry("dani", w1, ProgressEntry(tier=1, points=0, last_reviewed_at=NOW))
    fam = _overview(f"topic:{tid}").json()["familiarity"]
    assert fam[0] == 1  # w2, New
    assert fam[1] == 1  # w1, Learning
    assert len(fam) == 5


def test_overview_response_carries_no_due_debt() -> None:
    _make_word({"reading": "ねこ", "meaning": "cat", "source": "genki_3", "lesson": "L2"})
    body = _overview("lesson:L2").json()
    assert set(body.keys()) == {"scope", "word_count", "familiarity"}


def test_private_word_counts_only_for_owner() -> None:
    tid = _create_topic()
    priv = _make_word(
        {"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani"
    )
    _assign(tid, priv, user="dani")
    assert _overview(f"topic:{tid}", user="dani").json()["word_count"] == 1
    assert _overview(f"topic:{tid}", user="jake").json()["word_count"] == 0


def test_empty_scope_is_zeroed_not_an_error() -> None:
    body = _overview("lesson:L99").json()
    assert body["word_count"] == 0
    assert body["familiarity"] == [0, 0, 0, 0, 0]


def test_malformed_scope_is_422() -> None:
    assert _overview("bogus").status_code == 422
    assert _overview("chapter:1").status_code == 422


def test_unknown_user_is_404() -> None:
    assert _overview("lesson:L2", user="ghost").status_code == 404


# --- queue -----------------------------------------------------------------


def _queue(scope: str, user: str = "dani", direction: str | None = None):
    params = {"scope": scope, "user": user}
    if direction is not None:
        params["direction"] = direction
    return client.get("/api/hotaru/practice/queue", params=params)


def _queue_ids(scope: str, user: str = "dani", direction: str | None = None) -> list[str]:
    return [it["word"]["id"] for it in _queue(scope, user, direction).json()]


def test_queue_orders_weakest_tier_first() -> None:
    tid = _create_topic("Q-order")
    strong = _make_word({"reading": "つよい", "meaning": "strong"})
    fresh = _make_word({"reading": "あたらしい", "meaning": "new"})
    _assign(tid, strong)
    _assign(tid, fresh)
    # strong is Mastered; fresh is never-reviewed (tier 0) → fresh must come first.
    progress_repo.set_entry("dani", strong, ProgressEntry(tier=4, points=0, last_reviewed_at=NOW))
    ids = _queue_ids(f"topic:{tid}")
    assert ids.index(fresh) < ids.index(strong)


def test_queue_soft_caps_at_20() -> None:
    tid = _create_topic("Q-cap")
    for i in range(21):
        _assign(tid, _make_word({"reading": f"かな{i}", "meaning": f"m{i}"}))
    assert len(_queue(f"topic:{tid}").json()) == 20


def test_queue_direction_k2r_excludes_kana_only_words() -> None:
    tid = _create_topic("Q-dir")
    kanji_w = _make_word({"reading": "ねこ", "kanji": "猫", "meaning": "cat"})
    kana_w = _make_word({"reading": "あ", "meaning": "a"})
    _assign(tid, kanji_w)
    _assign(tid, kana_w)
    k2r = _queue_ids(f"topic:{tid}", direction="k2r")
    assert kanji_w in k2r and kana_w not in k2r
    # r2m (default) is the floor — both words appear.
    r2m = _queue_ids(f"topic:{tid}")
    assert kanji_w in r2m and kana_w in r2m


def test_queue_carries_no_due_debt() -> None:
    tid = _create_topic("Q-debt")
    _assign(tid, _make_word({"reading": "ねこ", "meaning": "cat"}))
    item = _queue(f"topic:{tid}").json()[0]
    assert set(item.keys()) == {"word"}
    assert "due" not in item["word"]
    assert "next_review_at" not in item["word"]


def test_queue_private_word_only_for_owner() -> None:
    tid = _create_topic("Q-priv")
    priv = _make_word(
        {"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani"
    )
    _assign(tid, priv, user="dani")
    assert priv in _queue_ids(f"topic:{tid}", user="dani")
    assert priv not in _queue_ids(f"topic:{tid}", user="jake")


def test_queue_empty_scope_returns_empty_list() -> None:
    assert _queue("lesson:L99").json() == []


def test_queue_malformed_scope_is_422() -> None:
    assert _queue("bogus").status_code == 422


def test_queue_unknown_user_is_404() -> None:
    assert _queue("lesson:L2", user="ghost").status_code == 404


def test_queue_invalid_direction_is_422() -> None:
    assert _queue("lesson:L2", direction="bogus").status_code == 422
