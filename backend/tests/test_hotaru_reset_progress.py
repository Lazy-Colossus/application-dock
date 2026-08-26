"""Story 2.14 — resetting one learner's familiarity.

The whole point of the feature is what it does NOT touch: private words and
authored notes are content the learner wrote, not earned state.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import progress_repo
from app.schemas.hotaru import ProgressEntry

client = TestClient(app)

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_word(body: dict, user: str = "dani") -> str:
    r = client.post("/api/hotaru/words", params={"user": user}, json=body)
    assert r.status_code == 201
    return r.json()["id"]


def _reset(user: str):
    return client.delete("/api/hotaru/practice/progress", params={"user": user})


def _familiarity(user: str) -> dict[str, int]:
    r = client.get("/api/hotaru/practice/familiarity", params={"user": user})
    assert r.status_code == 200
    return r.json()


def test_reset_returns_every_word_to_new() -> None:
    w1 = _make_word({"reading": "ねこ", "meaning": "cat"})
    w2 = _make_word({"reading": "いぬ", "meaning": "dog"})
    progress_repo.set_entry("dani", w1, ProgressEntry(tier=3, points=2, last_reviewed_at=NOW))
    progress_repo.set_entry("dani", w2, ProgressEntry(tier=4, points=1, last_reviewed_at=NOW))
    assert _familiarity("dani") != {}

    assert _reset("dani").status_code == 204

    # An empty map is how "everything is New" is represented — an absent word
    # resolves to tier 0 for both the API and the client.
    assert _familiarity("dani") == {}
    assert progress_repo.read_progress("dani") == {}


def test_reset_leaves_private_words_alone() -> None:
    wid = _make_word({"reading": "まんが", "meaning": "manga", "visibility": "private"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=2, points=1, last_reviewed_at=NOW))
    private_path = settings.data_dir / "hotaru" / "users" / "dani" / "words_private.json"
    before = private_path.read_bytes()

    assert _reset("dani").status_code == 204

    assert private_path.read_bytes() == before
    words = client.get("/api/hotaru/words", params={"user": "dani"}).json()
    assert any(w["id"] == wid for w in words)


def test_reset_leaves_notes_alone() -> None:
    wid = _make_word({"reading": "やくそく", "meaning": "promise"})
    r = client.post(
        f"/api/hotaru/words/{wid}/notes",
        params={"user": "dani"},
        json={"text": "kanji = bind + bundle", "visibility": "shared"},
    )
    assert r.status_code == 201
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=3, last_reviewed_at=NOW))

    assert _reset("dani").status_code == 204

    notes = client.get(f"/api/hotaru/words/{wid}/notes", params={"user": "dani"}).json()
    assert [n["text"] for n in notes] == ["kanji = bind + bundle"]


def test_reset_is_scoped_to_one_user() -> None:
    wid = _make_word({"reading": "ほん", "meaning": "book"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=2, last_reviewed_at=NOW))
    progress_repo.set_entry("jake", wid, ProgressEntry(tier=4, points=2, last_reviewed_at=NOW))
    jake_before = progress_repo.read_progress("jake")

    assert _reset("dani").status_code == 204

    assert progress_repo.read_progress("dani") == {}
    assert progress_repo.read_progress("jake") == jake_before
    assert _familiarity("jake") == {wid: 4}


def test_reset_on_a_never_graded_user_succeeds() -> None:
    # `jim` has no progress.json at all — the lazily-created-file case.
    assert _reset("jim").status_code == 204
    assert progress_repo.read_progress("jim") == {}


def test_reset_is_idempotent() -> None:
    wid = _make_word({"reading": "みず", "meaning": "water"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=1, last_reviewed_at=NOW))
    assert _reset("dani").status_code == 204
    assert _reset("dani").status_code == 204
    assert progress_repo.read_progress("dani") == {}


def test_reset_rejects_an_unknown_user() -> None:
    r = _reset("mallory")
    assert r.status_code == 404
    assert r.json()["detail"] == "Unknown user mallory."


def test_progress_can_be_rebuilt_after_a_reset() -> None:
    wid = _make_word({"reading": "そら", "meaning": "sky"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=4, last_reviewed_at=NOW))
    assert _reset("dani").status_code == 204

    # A reset is a fresh start, not a broken file: grading still works after it.
    r = client.post(
        "/api/hotaru/practice/grades",
        params={"user": "dani"},
        json=[{"word_id": wid, "grade": "correct"}],
    )
    assert r.status_code == 200
    assert _familiarity("dani")[wid] >= 1
