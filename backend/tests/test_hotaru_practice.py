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
