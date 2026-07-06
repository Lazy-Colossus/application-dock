import json

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import vocab_repo
from app.services import hotaru_vocab_service

client = TestClient(app)


def test_read_seed_loads_full_word_records() -> None:
    words = vocab_repo.read_seed()
    assert len(words) > 0
    w = words[0]
    # Full record present and typed.
    assert w.id and w.source and w.reading and w.meaning
    assert w.visibility == "shared"
    assert len(w.drill_caps) >= 2


def test_migrate_rejects_unknown_version() -> None:
    import pytest

    with pytest.raises(ValueError):
        vocab_repo.migrate({"schema_version": 999, "words": []})


def test_assembly_tolerates_missing_writable_files() -> None:
    # No vocab_shared.json / words_private.json exist in the temp DATA_DIR.
    seed_only = hotaru_vocab_service.list_words()
    assert len(seed_only) == len(vocab_repo.read_seed())
    # Passing a user with no private file must not error.
    assert hotaru_vocab_service.list_words(user="dani") == seed_only


def test_shared_words_are_merged_when_present() -> None:
    shared = [
        {
            "id": "dani-abc12345",
            "source": "dani",
            "reading": "ねこ",
            "kanji": "猫",
            "romaji": "neko",
            "meaning": "cat",
            "pos": "noun",
            "lesson": "L1",
            "visibility": "shared",
            "drill_caps": ["r2m", "m2r", "k2r"],
        }
    ]
    path = settings.data_dir / "hotaru" / "vocab_shared.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(shared), encoding="utf-8")
    try:
        l1 = hotaru_vocab_service.list_words(lesson="L1")
        assert any(w.id == "dani-abc12345" for w in l1)
    finally:
        path.unlink()


def test_get_words_returns_direct_array() -> None:
    response = client.get("/api/hotaru/words")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert not isinstance(body, dict)
    assert len(body) > 0
    assert set(body[0]) == {
        "id",
        "source",
        "reading",
        "kanji",
        "romaji",
        "meaning",
        "pos",
        "lesson",
        "visibility",
        "drill_caps",
    }


def test_get_words_filters_by_lesson() -> None:
    response = client.get("/api/hotaru/words", params={"lesson": "L2"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) > 0
    assert all(w["lesson"] == "L2" for w in body)


def test_get_words_rejects_unknown_user() -> None:
    response = client.get("/api/hotaru/words", params={"user": "ghost"})
    assert response.status_code == 404


def test_get_words_accepts_known_user() -> None:
    response = client.get("/api/hotaru/words", params={"user": "dani"})
    assert response.status_code == 200
