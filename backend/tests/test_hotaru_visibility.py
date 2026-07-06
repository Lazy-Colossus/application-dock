"""FR-7 privacy boundary: shared words are communal, private words are per-user.

These assert on the API response payload (what each user actually receives),
not on internal filtering — the boundary is a repo path, so another user's
private words are never read into the response in the first place.
"""

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def _post(body: dict, user: str = "dani"):
    return client.post("/api/hotaru/words", params={"user": user}, json=body)


def _ids(user: str | None = None, **params) -> list[str]:
    if user is not None:
        params["user"] = user
    return [w["id"] for w in client.get("/api/hotaru/words", params=params).json()]


def _make(body: dict, user: str = "dani") -> str:
    r = _post(body, user=user)
    assert r.status_code == 201
    return r.json()["id"]


def test_shared_word_is_visible_to_both_users() -> None:
    wid = _make({"reading": "ねこ", "meaning": "cat", "visibility": "shared"}, user="dani")
    assert wid in _ids("dani")
    assert wid in _ids("jake")
    # Lives in the shared file.
    shared_path = settings.data_dir / "hotaru" / "vocab_shared.json"
    assert wid in shared_path.read_text(encoding="utf-8")


def test_private_word_is_visible_only_to_owner() -> None:
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani")
    assert wid in _ids("dani")
    # Absent from the other user's payload — the real contract.
    assert wid not in _ids("jake")


def test_private_word_lives_at_the_owner_path_only() -> None:
    wid = _make({"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani")
    hotaru = settings.data_dir / "hotaru"
    assert wid in (hotaru / "users" / "dani" / "words_private.json").read_text(encoding="utf-8")
    # Not in the shared file, and jake has no private file at all.
    shared_path = hotaru / "vocab_shared.json"
    if shared_path.exists():
        assert wid not in shared_path.read_text(encoding="utf-8")
    assert not (hotaru / "users" / "jake" / "words_private.json").exists()


def test_privacy_holds_through_a_lesson_filter() -> None:
    wid = _make(
        {
            "reading": "テスト",
            "meaning": "test",
            "source": "genki_3",
            "lesson": "L2",
            "visibility": "private",
        },
        user="dani",
    )
    assert wid in _ids("dani", lesson="L2")
    assert wid not in _ids("jake", lesson="L2")


def test_no_user_payload_excludes_all_private_words() -> None:
    dani_private = _make({"reading": "あ", "meaning": "a", "visibility": "private"}, user="dani")
    jake_private = _make({"reading": "い", "meaning": "i", "visibility": "private"}, user="jake")
    shared = _make({"reading": "う", "meaning": "u", "visibility": "shared"}, user="dani")
    anon = _ids()
    assert shared in anon
    assert dani_private not in anon
    assert jake_private not in anon
