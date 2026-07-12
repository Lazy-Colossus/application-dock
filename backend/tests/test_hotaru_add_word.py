import re

from fastapi.testclient import TestClient

from app.main import app
from app.repositories import vocab_repo

client = TestClient(app)

ID_RE = re.compile(r"^[a-z0-9_]+-[0-9a-f]{8}$")


def _post(body: dict, user: str = "dani"):
    return client.post("/api/hotaru/words", params={"user": user}, json=body)


def test_create_shared_word_defaults_to_custom() -> None:
    r = _post({"reading": "ねこ", "kanji": "猫", "meaning": "cat", "visibility": "shared"})
    assert r.status_code == 201
    w = r.json()
    assert ID_RE.match(w["id"])
    assert w["source"] == "dani"  # default source = active user
    assert w["lesson"] == ""
    assert w["visibility"] == "shared"
    assert w["drill_caps"] == ["r2m", "m2r", "k2r"]
    # Persisted to the shared file and visible via GET /words.
    assert any(x.id == w["id"] for x in vocab_repo.read_shared())
    assert any(x["id"] == w["id"] for x in client.get("/api/hotaru/words").json())


def test_kana_only_word_has_no_k2r_and_null_kanji() -> None:
    w = _post({"reading": "ありがとう", "kanji": "", "meaning": "thanks"}).json()
    assert w["kanji"] is None
    assert w["drill_caps"] == ["r2m", "m2r"]


def test_private_word_is_isolated_to_creator() -> None:
    w = _post(
        {"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani"
    ).json()
    assert any(x.id == w["id"] for x in vocab_repo.read_private("dani"))
    assert vocab_repo.read_private("jake") == []
    # Included for the creator, absent for the other user.
    dani_ids = [x["id"] for x in client.get("/api/hotaru/words", params={"user": "dani"}).json()]
    jake_ids = [x["id"] for x in client.get("/api/hotaru/words", params={"user": "jake"}).json()]
    assert w["id"] in dani_ids
    assert w["id"] not in jake_ids


def test_filed_word_uses_textbook_source_but_storage_follows_visibility() -> None:
    # Filed into Genki L2, but private → lives in the creator's private file, not shared.
    w = _post(
        {
            "reading": "テスト",
            "meaning": "test",
            "source": "genki_3",
            "lesson": "L2",
            "visibility": "private",
        },
        user="dani",
    ).json()
    assert w["source"] == "genki_3"
    assert w["lesson"] == "L2"
    assert any(x.id == w["id"] for x in vocab_repo.read_private("dani"))
    assert all(x.id != w["id"] for x in vocab_repo.read_shared())
    # Shows under L2 for the creator.
    l2 = client.get("/api/hotaru/words", params={"lesson": "L2", "user": "dani"}).json()
    assert any(x["id"] == w["id"] for x in l2)


def test_missing_required_fields_return_422() -> None:
    assert _post({"reading": "  ", "meaning": "x"}).status_code == 422
    assert _post({"reading": "x", "meaning": ""}).status_code == 422


def test_unknown_user_rejected() -> None:
    r = client.post(
        "/api/hotaru/words", params={"user": "ghost"}, json={"reading": "a", "meaning": "b"}
    )
    assert r.status_code == 404


def test_explicit_unknown_source_rejected() -> None:
    # A crafted source that isn't a known textbook source (e.g. the frontend's Custom
    # sentinel or another user's id) is rejected.
    for bad in ("__custom__", "jake"):
        r = _post({"reading": "x", "meaning": "y", "source": bad})
        assert r.status_code == 422, bad


def test_known_textbook_source_accepted() -> None:
    r = _post({"reading": "x", "meaning": "y", "source": "genki_3", "lesson": "L2"})
    assert r.status_code == 201
    assert r.json()["source"] == "genki_3"
