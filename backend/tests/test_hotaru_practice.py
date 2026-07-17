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


def test_overview_all_scope_counts_every_visible_word() -> None:
    _make_word({"reading": "ねこ", "meaning": "cat", "source": "genki_3", "lesson": "L2"})
    _make_word({"reading": "いぬ", "meaning": "dog", "source": "genki_3", "lesson": "L3"})
    body = _overview("all").json()
    # Spans lessons — the aggregate is at least the two we just added.
    assert body["scope"] == "all"
    assert body["word_count"] >= 2
    assert sum(body["familiarity"]) == body["word_count"]


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


# --- familiarity map -------------------------------------------------------


def _familiarity(user: str = "dani"):
    return client.get("/api/hotaru/practice/familiarity", params={"user": user})


def test_familiarity_map_reflects_progress() -> None:
    reviewed = _make_word({"reading": "あ", "meaning": "a"})
    _make_word({"reading": "い", "meaning": "i"})  # unreviewed → absent from the map
    progress_repo.set_entry("dani", reviewed, ProgressEntry(tier=2, points=1, last_reviewed_at=NOW))
    body = _familiarity().json()
    assert body[reviewed] == 2


def test_familiarity_map_omits_unreviewed_words() -> None:
    unseen = _make_word({"reading": "う", "meaning": "u"})
    assert unseen not in _familiarity().json()


def test_familiarity_map_is_a_flat_tier_map_no_debt() -> None:
    wid = _make_word({"reading": "え", "meaning": "e"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=1, points=0, last_reviewed_at=NOW))
    body = _familiarity().json()
    assert body == {wid: 1}  # {word_id: int}, nothing due/overdue/next_review_at


def test_familiarity_map_is_per_user() -> None:
    wid = _make_word({"reading": "お", "meaning": "o"}, user="dani")
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=3, points=0, last_reviewed_at=NOW))
    assert _familiarity(user="dani").json() == {wid: 3}
    assert _familiarity(user="jake").json() == {}


def test_familiarity_map_unknown_user_is_404() -> None:
    assert _familiarity(user="ghost").status_code == 404


# --- study (browse, no grading) --------------------------------------------


def _study(scope: str, user: str = "dani"):
    return client.get("/api/hotaru/practice/study", params={"scope": scope, "user": user})


def test_study_returns_all_words_uncapped() -> None:
    tid = _create_topic("S-all")
    for i in range(25):
        _assign(tid, _make_word({"reading": f"かな{i}", "meaning": f"m{i}"}))
    r = _study(f"topic:{tid}")
    assert r.status_code == 200
    # The key difference from the queue: NOT soft-capped at 20.
    assert len(r.json()) == 25


def test_study_preserves_natural_order() -> None:
    tid = _create_topic("S-order")
    ids = [_make_word({"reading": f"よ{i}", "meaning": f"m{i}"}) for i in range(3)]
    for wid in ids:
        _assign(tid, wid)
    got = [it["word"]["id"] for it in _study(f"topic:{tid}").json()]
    # Natural (assembly) order — no SRS reordering.
    assert got == ids


def test_study_private_word_only_for_owner() -> None:
    tid = _create_topic("S-priv")
    priv = _make_word(
        {"reading": "ひみつ", "meaning": "secret", "visibility": "private"}, user="dani"
    )
    _assign(tid, priv, user="dani")
    assert priv in [it["word"]["id"] for it in _study(f"topic:{tid}", user="dani").json()]
    assert priv not in [it["word"]["id"] for it in _study(f"topic:{tid}", user="jake").json()]


def test_study_cards_carry_notes() -> None:
    tid = _create_topic("S-notes")
    w = _make_word({"reading": "ねこ", "meaning": "cat"})
    _assign(tid, w)
    client.post(
        f"/api/hotaru/words/{w}/notes",
        params={"user": "dani"},
        json={"text": "looks like a cat", "visibility": "shared"},
    )
    item = next(it for it in _study(f"topic:{tid}").json() if it["word"]["id"] == w)
    assert [n["text"] for n in item["notes"]] == ["looks like a cat"]


def test_study_empty_scope_is_empty_list() -> None:
    assert _study("lesson:L99").json() == []


def test_study_malformed_scope_is_422() -> None:
    assert _study("bogus").status_code == 422


def test_study_unknown_user_is_404() -> None:
    assert _study("lesson:L2", user="ghost").status_code == 404


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


def test_queue_direction_m2r_includes_every_word() -> None:
    # EN→JP (production) — every word carries m2r (reading + meaning always),
    # so the direction toggle drops nothing, and the response stays debt-free.
    tid = _create_topic("Q-m2r")
    kanji_w = _make_word({"reading": "ねこ", "kanji": "猫", "meaning": "cat"})
    kana_w = _make_word({"reading": "あ", "meaning": "a"})
    _assign(tid, kanji_w)
    _assign(tid, kana_w)
    r = _queue(f"topic:{tid}", direction="m2r")
    assert r.status_code == 200
    ids = [it["word"]["id"] for it in r.json()]
    assert kanji_w in ids and kana_w in ids
    assert all(set(it.keys()) == {"word", "notes"} for it in r.json())


def test_queue_tiers_filter_keeps_only_matching_familiarity() -> None:
    # Quick Practice: filter the whole list by familiarity tier.
    learning = _make_word({"reading": "まなぶ", "meaning": "learn", "lesson": "L2"})
    strong = _make_word({"reading": "つよい", "meaning": "strong", "lesson": "L2"})
    _make_word({"reading": "あたらしい", "meaning": "new", "lesson": "L2"})  # tier 0 (New)
    progress_repo.set_entry("dani", learning, ProgressEntry(tier=1, points=0, last_reviewed_at=NOW))
    progress_repo.set_entry("dani", strong, ProgressEntry(tier=3, points=0, last_reviewed_at=NOW))
    r = client.get(
        "/api/hotaru/practice/queue",
        params={"scope": "all", "user": "dani", "tiers": "1,3"},
    )
    assert r.status_code == 200
    ids = [it["word"]["id"] for it in r.json()]
    assert learning in ids and strong in ids
    # The unreviewed (tier 0) word is excluded by tiers=1,3.
    assert all(it["word"]["meaning"] != "new" for it in r.json())


def test_queue_lessons_filter_unions_selected_lessons() -> None:
    a = _make_word({"reading": "あ", "meaning": "a", "lesson": "L2"})
    b = _make_word({"reading": "い", "meaning": "i", "lesson": "L4"})
    _make_word({"reading": "う", "meaning": "u", "lesson": "L9"})  # excluded
    items = client.get(
        "/api/hotaru/practice/queue",
        params={"scope": "all", "user": "dani", "lessons": "L2,L4"},
    ).json()
    ids = [it["word"]["id"] for it in items]
    assert a in ids and b in ids
    # Only L2/L4 words are present — the L9 word is excluded.
    assert {it["word"]["lesson"] for it in items} <= {"L2", "L4"}


def test_queue_tiers_and_lessons_combine() -> None:
    hit = _make_word({"reading": "かち", "meaning": "hit", "lesson": "L2"})
    _make_word({"reading": "みす", "meaning": "miss-lesson", "lesson": "L5"})  # wrong lesson
    other = _make_word({"reading": "みす2", "meaning": "miss-tier", "lesson": "L2"})  # wrong tier
    progress_repo.set_entry("dani", hit, ProgressEntry(tier=2, points=0, last_reviewed_at=NOW))
    progress_repo.set_entry("dani", other, ProgressEntry(tier=4, points=0, last_reviewed_at=NOW))
    ids = [
        it["word"]["id"]
        for it in client.get(
            "/api/hotaru/practice/queue",
            params={"scope": "all", "user": "dani", "tiers": "2", "lessons": "L2"},
        ).json()
    ]
    assert hit in ids
    assert other not in ids


def test_queue_limit_overrides_soft_cap() -> None:
    tid = _create_topic("Q-limit")
    for i in range(10):
        _assign(tid, _make_word({"reading": f"か{i}", "meaning": f"m{i}"}))
    # An explicit limit caps below the natural count…
    r5 = client.get(
        "/api/hotaru/practice/queue",
        params={"scope": f"topic:{tid}", "user": "dani", "limit": 5},
    )
    assert len(r5.json()) == 5
    # …and limit=0 means "All" (no cap).
    r0 = client.get(
        "/api/hotaru/practice/queue",
        params={"scope": f"topic:{tid}", "user": "dani", "limit": 0},
    )
    assert len(r0.json()) == 10


def test_queue_bad_tier_value_is_422() -> None:
    assert (
        client.get(
            "/api/hotaru/practice/queue",
            params={"scope": "all", "user": "dani", "tiers": "9"},
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/hotaru/practice/queue",
            params={"scope": "all", "user": "dani", "tiers": "x"},
        ).status_code
        == 422
    )


def test_queue_carries_no_due_debt() -> None:
    tid = _create_topic("Q-debt")
    _assign(tid, _make_word({"reading": "ねこ", "meaning": "cat"}))
    item = _queue(f"topic:{tid}").json()[0]
    # `notes` is the only field beyond `word` (Story 3.3); still no due-debt.
    assert set(item.keys()) == {"word", "notes"}
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


# --- grades ----------------------------------------------------------------


def _grade(grades: list[dict], user: str = "dani"):
    return client.post("/api/hotaru/practice/grades", params={"user": user}, json=grades)


def test_grade_correct_advances_a_new_word() -> None:
    wid = _make_word({"reading": "ねこ", "meaning": "cat"})
    r = _grade([{"word_id": wid, "grade": "correct"}])
    assert r.status_code == 200
    # New word (tier 0, threshold 1) → Correct advances to Learning (tier 1).
    assert r.json()[wid]["tier"] == 1
    # Persisted, with a review timestamp.
    entry = progress_repo.get_entry("dani", wid)
    assert entry is not None and entry.tier == 1 and entry.last_reviewed_at is not None


def test_grade_incorrect_drops_a_tier() -> None:
    wid = _make_word({"reading": "いぬ", "meaning": "dog"})
    progress_repo.set_entry("dani", wid, ProgressEntry(tier=3, points=2, last_reviewed_at=NOW))
    r = _grade([{"word_id": wid, "grade": "incorrect"}])
    assert r.json()[wid]["tier"] == 2
    assert r.json()[wid]["points"] == 0


def test_grade_batch_applies_all() -> None:
    a = _make_word({"reading": "あ", "meaning": "a"})
    b = _make_word({"reading": "い", "meaning": "i"})
    r = _grade([{"word_id": a, "grade": "correct"}, {"word_id": b, "grade": "close"}])
    body = r.json()
    assert set(body.keys()) == {a, b}
    assert progress_repo.get_entry("dani", a).tier == 1  # correct → advance
    # A reviewed word is never New: even Close graduates a first exposure.
    assert progress_repo.get_entry("dani", b).tier == 1


def test_grades_are_scoped_to_the_user() -> None:
    wid = _make_word({"reading": "ねこ", "meaning": "cat"})
    _grade([{"word_id": wid, "grade": "correct"}], user="dani")
    assert progress_repo.get_entry("dani", wid) is not None
    assert progress_repo.read_progress("jake") == {}


def test_grade_response_has_no_due_debt() -> None:
    wid = _make_word({"reading": "ねこ", "meaning": "cat"})
    entry = _grade([{"word_id": wid, "grade": "correct"}]).json()[wid]
    assert set(entry.keys()) == {"tier", "points", "last_reviewed_at"}


def test_grade_unknown_user_is_404() -> None:
    assert _grade([{"word_id": "x", "grade": "correct"}], user="ghost").status_code == 404


def test_grade_invalid_value_is_422() -> None:
    assert _grade([{"word_id": "x", "grade": "bogus"}]).status_code == 422


# --- Story 3.3: notes ride the drill queue (privacy-filtered, server-side) ----


def _add_note(word_id: str, text: str, visibility: str = "shared", user: str = "dani"):
    return client.post(
        f"/api/hotaru/words/{word_id}/notes",
        params={"user": user},
        json={"text": text, "visibility": visibility},
    )


def _queue_item(scope: str, word_id: str, user: str = "dani"):
    for it in _queue(scope, user).json():
        if it["word"]["id"] == word_id:
            return it
    return None


def test_queue_carries_shared_and_own_private_notes_oldest_first() -> None:
    tid = _create_topic("Q-notes")
    w = _make_word({"reading": "ねこ", "meaning": "cat"})
    _assign(tid, w)
    _add_note(w, "shared tip", "shared", "dani")
    _add_note(w, "my private hook", "private", "dani")
    item = _queue_item(f"topic:{tid}", w)
    assert [n["text"] for n in item["notes"]] == ["shared tip", "my private hook"]


def test_queue_hides_the_partners_private_notes() -> None:
    tid = _create_topic("Q-priv")
    w = _make_word({"reading": "いぬ", "meaning": "dog"})
    _assign(tid, w)
    _add_note(w, "shared for both", "shared", "dani")
    _add_note(w, "jake secret", "private", "jake")
    texts = [n["text"] for n in _queue_item(f"topic:{tid}", w, user="dani")["notes"]]
    assert "shared for both" in texts
    assert "jake secret" not in texts  # NFR-2: partner's private never read


def test_queue_note_free_word_has_empty_notes_and_no_debt_fields() -> None:
    tid = _create_topic("Q-empty")
    w = _make_word({"reading": "みず", "meaning": "water"})
    _assign(tid, w)
    item = _queue_item(f"topic:{tid}", w)
    assert item["notes"] == []
    # Queue-not-debt: a card is only word + notes, nothing due/overdue.
    assert set(item.keys()) == {"word", "notes"}
