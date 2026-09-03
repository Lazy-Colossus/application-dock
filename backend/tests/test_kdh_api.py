"""Story 1.3 — the first KDH endpoints.

`conftest` bypasses auth for every file but `test_auth.py`, overriding the
current user with `test_user`; tests that need a specific caller re-override it.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "players")
    return tmp_path


@pytest.fixture()
def as_guest():
    app.dependency_overrides[get_current_user] = lambda: "players"
    yield
    app.dependency_overrides[get_current_user] = lambda: "test_user"


def create(name: str = "DnD", invitees: list[str] | None = None):
    return client.post(
        "/api/kdh/calendars",
        json={
            "name": name,
            "invitee_names": invitees if invitees is not None else ["Dani", "Jake"],
        },
    )


# ── authentication ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/kdh/me"),
        ("get", "/api/kdh/calendars"),
        ("post", "/api/kdh/calendars"),
        ("get", "/api/kdh/calendars/cal-ab12cd34"),
    ],
)
def test_every_route_rejects_an_unauthenticated_caller(
    method: str, path: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Deferred here from Story 1.1, which had no endpoint to assert it against.

    Two things have to be undone for this to test anything. `conftest` overrides
    the auth dependency for every file but `test_auth.py`, so the override is
    lifted and restored around the call. And `get_current_user` deliberately
    returns a dev user when no `JWT_SECRET_KEY` is configured — the local-dev
    escape hatch — which is the default in this environment, so a secret is set
    or the route would answer `200` and the assertion would prove nothing.
    """
    monkeypatch.setattr("app.core.config.settings.jwt_secret_key", "test-secret-key-for-tests-only")
    app.dependency_overrides.pop(get_current_user, None)
    try:
        response = client.request(method, path, json={} if method == "post" else None)
        assert response.status_code == 401, f"{method.upper()} {path}"
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── identity ─────────────────────────────────────────────────────────────────


def test_me_reports_an_admin() -> None:
    body = client.get("/api/kdh/me").json()
    assert body["username"] == "test_user"
    assert body["is_admin"] is True


def test_me_reports_a_guest(as_guest: None) -> None:
    body = client.get("/api/kdh/me").json()
    assert body["username"] == "players"
    assert body["is_admin"] is False


def test_me_carries_the_server_date(monkeypatch: pytest.MonkeyPatch) -> None:
    """The client must not decide "past" from its own clock (NFR-5)."""
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    assert client.get("/api/kdh/me").json()["today"] == "2026-09-03"


# ── create ───────────────────────────────────────────────────────────────────


def test_create_returns_201_and_a_seeded_calendar() -> None:
    response = create("DnD — Curse of Strahd", ["Dani", "Jake", "Tom"])
    assert response.status_code == 201

    body = response.json()
    assert body["id"].startswith("cal-") and len(body["id"]) == len("cal-") + 8
    assert body["name"] == "DnD — Curse of Strahd"
    assert body["created_by"] == "test_user"
    assert body["votes"] == {} and body["chosen_dates"] == []
    assert [i["name"] for i in body["invitees"]] == ["Dani", "Jake", "Tom"]
    assert [i["order"] for i in body["invitees"]] == [0, 1, 2]
    assert all(i["removed_at"] is None for i in body["invitees"])
    assert all(i["id"].startswith("inv-") for i in body["invitees"])


def test_invitee_names_are_stored_as_typed() -> None:
    """Trimmed, but not case-folded — the name renders in every day cell."""
    body = create(invitees=["  Dani  "]).json()
    assert body["invitees"][0]["name"] == "Dani"


def test_a_guest_cannot_create_and_nothing_is_written(as_guest: None) -> None:
    response = create()
    assert response.status_code == 403
    assert "detail" in response.json()
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    assert client.get("/api/kdh/calendars").json() == []


@pytest.mark.parametrize(
    "name,invitees,because",
    [
        ("", ["Dani"], "blank calendar name"),
        ("   ", ["Dani"], "whitespace calendar name"),
        ("DnD", [], "no invitees"),
        ("DnD", ["Dani", ""], "blank invitee name"),
        ("DnD", ["Dani", "   "], "whitespace invitee name"),
        ("DnD", ["Dani", "Dani"], "duplicate invitee"),
        ("DnD", ["Dani", " dani "], "duplicate invitee ignoring case and padding"),
    ],
)
def test_create_rejects_bad_input(name: str, invitees: list[str], because: str) -> None:
    response = create(name, invitees)
    assert response.status_code == 422, because
    assert "detail" in response.json()
    assert client.get("/api/kdh/calendars").json() == []


# ── list ─────────────────────────────────────────────────────────────────────


def test_list_is_empty_before_anything_is_created() -> None:
    assert client.get("/api/kdh/calendars").json() == []


def test_list_returns_summaries_newest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    """Timestamps are driven so the ordering is tested, not the clock's resolution —
    `created_at` has second precision, so a real loop creates them all at once."""
    stamps = iter(["2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z", "2026-09-01T00:00:00Z"])
    monkeypatch.setattr("app.services.kdh_service.now_iso", lambda: next(stamps))

    for name in ("First", "Second", "Third"):
        create(name, ["Dani"])

    body = client.get("/api/kdh/calendars").json()
    assert [c["name"] for c in body] == ["Third", "Second", "First"]
    assert body[0].keys() == {
        "id",
        "name",
        "invitee_count",
        "invitee_names",
        "created_at",
        "next_session",
        "last_session",
    }


def test_list_carries_the_invitee_count() -> None:
    create("DnD", ["Dani", "Jake", "Tom"])
    assert client.get("/api/kdh/calendars").json()[0]["invitee_count"] == 3


def test_a_guest_sees_the_same_list_as_an_admin(as_guest: None) -> None:
    """Shared, not per-user — the whole storage model in one assertion."""
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    create("Shared", ["Dani"])
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert [c["name"] for c in client.get("/api/kdh/calendars").json()] == ["Shared"]


# ── read one ─────────────────────────────────────────────────────────────────


def test_get_returns_the_full_calendar() -> None:
    created = create().json()
    fetched = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert fetched == created


def test_get_of_an_unknown_calendar_is_404() -> None:
    response = client.get("/api/kdh/calendars/cal-nope1234")
    assert response.status_code == 404
    assert response.json()["detail"] == "Calendar not found"


@pytest.mark.parametrize("bad", ["..", "%2e%2e", " "])
def test_get_of_a_malformed_id_is_never_a_server_error(bad: str) -> None:
    response = client.get(f"/api/kdh/calendars/{bad}")
    assert response.status_code in (404, 422), response.status_code


def test_list_ordering_is_deterministic_within_one_second() -> None:
    """Same-second creations cannot be ordered by time, but they must not depend
    on filesystem glob order either — repeated listings agree."""
    for name in ("A", "B", "C", "D"):
        create(name, ["Dani"])

    first = [c["id"] for c in client.get("/api/kdh/calendars").json()]
    second = [c["id"] for c in client.get("/api/kdh/calendars").json()]
    assert first == second
    assert len(first) == 4


# ── rename ───────────────────────────────────────────────────────────────────


def test_rename_changes_only_the_name(monkeypatch: pytest.MonkeyPatch) -> None:
    """The clock is driven so `updated_at` is genuinely asserted — at second
    precision a create and a rename in the same test would stamp the same value,
    and `>=` would pass without proving anything."""
    created = create("DnD", ["Dani", "Jake"]).json()
    monkeypatch.setattr("app.services.kdh_service.now_iso", lambda: "2026-12-25T12:00:00Z")

    renamed = client.put(
        f"/api/kdh/calendars/{created['id']}", json={"name": "DnD — Strahd"}
    ).json()

    assert renamed["name"] == "DnD — Strahd"
    assert renamed["updated_at"] == "2026-12-25T12:00:00Z"
    assert renamed["updated_at"] != created["updated_at"]
    for field in ("id", "created_at", "created_by", "invitees", "votes", "chosen_dates"):
        assert renamed[field] == created[field], field


def test_rename_trims_surrounding_whitespace() -> None:
    created = create().json()
    renamed = client.put(
        f"/api/kdh/calendars/{created['id']}", json={"name": "  Movie night  "}
    ).json()
    assert renamed["name"] == "Movie night"


def test_rename_persists() -> None:
    created = create().json()
    client.put(f"/api/kdh/calendars/{created['id']}", json={"name": "Renamed"})
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["name"] == "Renamed"
    assert [c["name"] for c in client.get("/api/kdh/calendars").json()] == ["Renamed"]


@pytest.mark.parametrize("bad", ["", "   ", "\t"])
def test_rename_rejects_a_blank_name(bad: str) -> None:
    created = create("Keep me").json()
    response = client.put(f"/api/kdh/calendars/{created['id']}", json={"name": bad})

    assert response.status_code == 422
    assert "detail" in response.json()
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["name"] == "Keep me"


def test_rename_of_an_unknown_calendar_is_404() -> None:
    response = client.put("/api/kdh/calendars/cal-nope1234", json={"name": "X"})
    assert response.status_code == 404


def test_a_guest_cannot_rename(as_guest: None) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("Untouched").json()
    app.dependency_overrides[get_current_user] = lambda: "players"

    response = client.put(f"/api/kdh/calendars/{created['id']}", json={"name": "Hijacked"})

    assert response.status_code == 403
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["name"] == "Untouched"


# ── delete ───────────────────────────────────────────────────────────────────


def test_delete_removes_the_calendar() -> None:
    created = create().json()

    assert client.delete(f"/api/kdh/calendars/{created['id']}").status_code == 204
    assert client.get(f"/api/kdh/calendars/{created['id']}").status_code == 404
    assert client.get("/api/kdh/calendars").json() == []


def test_delete_leaves_other_calendars_alone() -> None:
    keep = create("Keep").json()
    drop = create("Drop").json()

    client.delete(f"/api/kdh/calendars/{drop['id']}")

    assert [c["id"] for c in client.get("/api/kdh/calendars").json()] == [keep["id"]]


def test_delete_of_an_unknown_calendar_is_404() -> None:
    assert client.delete("/api/kdh/calendars/cal-nope1234").status_code == 404


def test_a_guest_cannot_delete(as_guest: None) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("Untouched").json()
    app.dependency_overrides[get_current_user] = lambda: "players"

    response = client.delete(f"/api/kdh/calendars/{created['id']}")

    assert response.status_code == 403
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    assert client.get(f"/api/kdh/calendars/{created['id']}").status_code == 200


@pytest.mark.parametrize("bad", ["..", " "])
def test_mutating_a_malformed_id_is_never_a_server_error(bad: str) -> None:
    assert client.put(f"/api/kdh/calendars/{bad}", json={"name": "X"}).status_code in (404, 422)
    assert client.delete(f"/api/kdh/calendars/{bad}").status_code in (404, 422)


# ── add an invitee ───────────────────────────────────────────────────────────


def add_invitee(calendar_id: str, name: str):
    return client.post(f"/api/kdh/calendars/{calendar_id}/invitees", json={"name": name})


def test_add_invitee_appends_with_the_next_order() -> None:
    created = create("DnD", ["Dani", "Jake"]).json()

    body = add_invitee(created["id"], "Tom")
    assert body.status_code == 201
    invitees = body.json()["invitees"]

    assert [i["name"] for i in invitees] == ["Dani", "Jake", "Tom"]
    tom = invitees[-1]
    assert tom["id"].startswith("inv-") and len(tom["id"]) == len("inv-") + 8
    assert tom["order"] == 2
    assert tom["removed_at"] is None


def test_a_roster_is_not_capped() -> None:
    """The eight-colour palette used to cap a calendar at eight people; with the
    colours gone there is no reason to."""
    body = create("Big", [f"P{i}" for i in range(14)])
    assert body.status_code == 201
    assert len(body.json()["invitees"]) == 14


def test_add_invitee_trims_and_persists() -> None:
    created = create("DnD", ["Dani"]).json()
    add_invitee(created["id"], "  Jake  ")

    stored = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert [i["name"] for i in stored["invitees"]] == ["Dani", "Jake"]


@pytest.mark.parametrize("bad", ["", "   ", "Dani", " dani "])
def test_add_invitee_rejects_bad_names(bad: str) -> None:
    created = create("DnD", ["Dani"]).json()

    assert add_invitee(created["id"], bad).status_code == 422
    stored = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert len(stored["invitees"]) == 1


def test_a_guest_cannot_add_an_invitee(as_guest: None) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani"]).json()
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert add_invitee(created["id"], "Sneaky").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: "test_user"
    stored = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert [i["name"] for i in stored["invitees"]] == ["Dani"]


def test_add_invitee_to_an_unknown_calendar_is_404() -> None:
    assert add_invitee("cal-nope1234", "Tom").status_code == 404


# ── remove an invitee: clear the future, keep the past ───────────────────────


def seed_votes(calendar_id: str, votes: dict) -> None:
    """Write votes straight through the repo — the vote endpoint is Epic 3."""
    from app.repositories import kdh_repo

    calendar = kdh_repo.read_calendar(calendar_id)
    calendar.votes = votes
    kdh_repo.write_calendar(calendar)


def test_removal_clears_the_future_and_keeps_the_past(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani", "Jake"]).json()
    dani, jake = (i["id"] for i in created["invitees"])
    seed_votes(
        created["id"],
        {
            "2026-08-10": {dani: "yes", jake: "yes"},  # past, both
            "2026-09-02": {dani: "yes"},  # past, only Dani
            "2026-09-03": {dani: "yes", jake: "yes"},  # today counts as future
            "2026-09-20": {dani: "if_needed"},  # future, only Dani
        },
    )

    body = client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani}").json()

    assert body["votes"]["2026-08-10"] == {dani: "yes", jake: "yes"}, "past untouched"
    assert body["votes"]["2026-09-02"] == {dani: "yes"}, "past untouched"
    assert body["votes"]["2026-09-03"] == {jake: "yes"}, "today is future — Dani cleared"
    assert "2026-09-20" not in body["votes"], "emptied date pruned"


def test_a_removed_invitee_is_tombstoned_with_their_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani", "Jake"]).json()
    dani = created["invitees"][0]
    seed_votes(created["id"], {"2026-08-10": {dani["id"]: "yes"}})

    body = client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani['id']}").json()

    tombstone = next(i for i in body["invitees"] if i["id"] == dani["id"])
    assert tombstone["removed_at"] is not None
    assert tombstone["name"] == "Dani"


def test_an_invitee_with_no_past_votes_is_dropped_outright() -> None:
    """The 'added by mistake' case must leave no residue."""
    created = create("DnD", ["Dani", "Oops"]).json()
    oops = created["invitees"][1]["id"]

    body = client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{oops}").json()

    assert [i["name"] for i in body["invitees"]] == ["Dani"]


def test_removal_never_touches_chosen_dates(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    from app.repositories import kdh_repo

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    calendar = kdh_repo.read_calendar(created["id"])
    calendar.votes = {"2026-08-10": {dani: "yes"}}
    calendar.chosen_dates = ["2026-08-10", "2026-09-14"]
    kdh_repo.write_calendar(calendar)

    body = client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani}").json()

    assert body["chosen_dates"] == ["2026-08-10", "2026-09-14"]


def test_a_tombstone_leaves_the_roster(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]
    seed_votes(created["id"], {"2026-08-10": {dani["id"]: "yes"}})
    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani['id']}")

    assert client.get("/api/kdh/calendars").json()[0]["invitee_count"] == 0


def test_a_removed_name_can_be_reused(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]
    seed_votes(created["id"], {"2026-08-10": {dani["id"]: "yes"}})
    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani['id']}")

    response = add_invitee(created["id"], "Dani")
    assert response.status_code == 201, "a returning person may reuse their name"


def test_removing_an_already_removed_or_unknown_invitee_is_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    seed_votes(created["id"], {"2026-08-10": {dani: "yes"}})

    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani}")
    assert client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani}").status_code == 404
    assert client.delete(f"/api/kdh/calendars/{created['id']}/invitees/inv-nope").status_code == 404


def test_a_guest_cannot_remove_an_invitee(as_guest: None) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani", "Jake"]).json()
    dani = created["invitees"][0]["id"]
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{dani}").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: "test_user"
    stored = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert len(stored["invitees"]) == 2


# ── the list carries the roster, not just its size ───────────────────────────


def test_summary_lists_invitee_names_in_roster_order() -> None:
    create("DnD", ["Dani", "Jake", "Tom"])
    summary = client.get("/api/kdh/calendars").json()[0]

    assert summary["invitee_names"] == ["Dani", "Jake", "Tom"]
    assert summary["invitee_count"] == 3


def test_summary_excludes_tombstoned_invitees(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    created = create("DnD", ["Dani", "Departing"]).json()
    departing = created["invitees"][1]["id"]
    seed_votes(created["id"], {"2026-08-10": {departing: "yes"}})
    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{departing}")

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["invitee_names"] == ["Dani"]
    assert summary["invitee_count"] == 1


def test_summary_names_survive_a_rename_of_the_calendar() -> None:
    created = create("DnD", ["Dani"]).json()
    client.put(f"/api/kdh/calendars/{created['id']}", json={"name": "Strahd"})

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["name"] == "Strahd"
    assert summary["invitee_names"] == ["Dani"]


# ── voting ───────────────────────────────────────────────────────────────────


@pytest.fixture()
def fixed_today(monkeypatch: pytest.MonkeyPatch):
    from datetime import date

    monkeypatch.setattr("app.services.kdh_service.today", lambda: date(2026, 9, 3))
    return date(2026, 9, 3)


def vote(calendar_id: str, invitee_id: str, day: str, status: str):
    return client.put(
        f"/api/kdh/calendars/{calendar_id}/votes",
        json={"invitee_id": invitee_id, "date": day, "status": status},
    )


def test_vote_records_free_and_if_needed(fixed_today) -> None:
    created = create("DnD", ["Dani", "Jake"]).json()
    dani, jake = (i["id"] for i in created["invitees"])

    vote(created["id"], dani, "2026-09-14", "yes")
    body = vote(created["id"], jake, "2026-09-14", "if_needed").json()

    assert body["votes"]["2026-09-14"] == {dani: "yes", jake: "if_needed"}


def test_vote_none_clears_and_prunes_the_date(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    vote(created["id"], dani, "2026-09-14", "yes")
    body = vote(created["id"], dani, "2026-09-14", "none").json()

    assert "2026-09-14" not in body["votes"]


def test_vote_none_leaves_other_people_on_the_day(fixed_today) -> None:
    created = create("DnD", ["Dani", "Jake"]).json()
    dani, jake = (i["id"] for i in created["invitees"])
    vote(created["id"], dani, "2026-09-14", "yes")
    vote(created["id"], jake, "2026-09-14", "yes")

    body = vote(created["id"], dani, "2026-09-14", "none").json()
    assert body["votes"]["2026-09-14"] == {jake: "yes"}


def test_repeating_the_same_vote_changes_nothing(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    first = vote(created["id"], dani, "2026-09-14", "yes").json()
    second = vote(created["id"], dani, "2026-09-14", "yes").json()
    assert first["votes"] == second["votes"]


def test_clearing_a_vote_that_was_never_set_is_harmless(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    assert vote(created["id"], dani, "2026-09-14", "none").status_code == 200


def test_today_is_still_votable(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    body = vote(created["id"], dani, "2026-09-03", "yes")
    assert body.status_code == 200, "today is not past — it is still votable"


def test_a_past_day_is_refused(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    response = vote(created["id"], dani, "2026-09-02", "yes")
    assert response.status_code == 422
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["votes"] == {}


@pytest.mark.parametrize("bad", ["03-09-2026", "2026-13-01", "not-a-date", ""])
def test_a_malformed_date_is_refused(fixed_today, bad: str) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    assert vote(created["id"], dani, bad, "yes").status_code == 422


def test_an_unknown_status_is_refused(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    assert vote(created["id"], dani, "2026-09-14", "maybe").status_code == 422


def test_an_unknown_invitee_is_404(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    assert vote(created["id"], "inv-nope", "2026-09-14", "yes").status_code == 404


def test_a_removed_invitee_cannot_vote(fixed_today) -> None:
    created = create("DnD", ["Dani", "Departing"]).json()
    departing = created["invitees"][1]["id"]
    seed_votes(created["id"], {"2026-08-10": {departing: "yes"}})
    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{departing}")

    response = vote(created["id"], departing, "2026-09-14", "yes")
    assert response.status_code == 422
    assert "no longer" in response.json()["detail"]


def test_a_guest_may_vote(as_guest: None, fixed_today) -> None:
    """Voting is the thing guests are here to do."""
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert vote(created["id"], dani, "2026-09-14", "yes").status_code == 200


def test_concurrent_votes_on_one_day_all_survive(fixed_today) -> None:
    """The case the whole app was serialized for (NFR-1)."""
    import threading

    created = create("DnD", [f"P{i}" for i in range(6)]).json()
    ids = [i["id"] for i in created["invitees"]]
    barrier = threading.Barrier(len(ids))

    def cast(invitee_id: str) -> None:
        barrier.wait()
        vote(created["id"], invitee_id, "2026-09-14", "yes")

    threads = [threading.Thread(target=cast, args=(i,)) for i in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    stored = client.get(f"/api/kdh/calendars/{created['id']}").json()
    assert set(stored["votes"]["2026-09-14"]) == set(ids)


# ── chosen days ──────────────────────────────────────────────────────────────


def set_chosen(calendar_id: str, day: str, chosen: bool):
    return client.put(
        f"/api/kdh/calendars/{calendar_id}/chosen",
        json={"date": day, "chosen": chosen},
    )


def test_mark_and_unmark_a_chosen_day(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()

    marked = set_chosen(created["id"], "2026-09-14", True).json()
    assert marked["chosen_dates"] == ["2026-09-14"]

    unmarked = set_chosen(created["id"], "2026-09-14", False).json()
    assert unmarked["chosen_dates"] == []


def test_chosen_days_accumulate_sorted_and_deduped(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()

    set_chosen(created["id"], "2026-10-05", True)
    set_chosen(created["id"], "2026-09-14", True)
    body = set_chosen(created["id"], "2026-09-14", True).json()

    assert body["chosen_dates"] == ["2026-09-14", "2026-10-05"]


def test_unmarking_a_day_that_was_never_chosen_is_harmless(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    assert set_chosen(created["id"], "2026-09-14", False).status_code == 200


def test_a_past_day_may_be_marked(fixed_today) -> None:
    """Unlike voting: this is a record, and a record may be corrected."""
    created = create("DnD", ["Dani"]).json()

    body = set_chosen(created["id"], "2026-08-10", True)
    assert body.status_code == 200
    assert body.json()["chosen_dates"] == ["2026-08-10"]


def test_marking_never_touches_votes(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    vote(created["id"], dani, "2026-09-14", "yes")

    body = set_chosen(created["id"], "2026-09-14", True).json()
    assert body["votes"]["2026-09-14"] == {dani: "yes"}


@pytest.mark.parametrize("bad", ["14-09-2026", "2026-13-01", "nope", ""])
def test_marking_a_malformed_date_is_refused(fixed_today, bad: str) -> None:
    created = create("DnD", ["Dani"]).json()
    assert set_chosen(created["id"], bad, True).status_code == 422


def test_a_guest_cannot_mark_a_day(as_guest: None, fixed_today) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani"]).json()
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert set_chosen(created["id"], "2026-09-14", True).status_code == 403

    app.dependency_overrides[get_current_user] = lambda: "test_user"
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["chosen_dates"] == []


def test_marking_an_unknown_calendar_is_404(fixed_today) -> None:
    assert set_chosen("cal-nope1234", "2026-09-14", True).status_code == 404


# ── sessions on the calendar list ────────────────────────────────────────────


def test_summary_carries_the_next_session(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    set_chosen(created["id"], "2026-10-05", True)
    set_chosen(created["id"], "2026-09-14", True)

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["next_session"] == "2026-09-14", "the nearest one still to come"
    assert summary["last_session"] is None


def test_summary_falls_back_to_the_most_recent_past_session(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    set_chosen(created["id"], "2026-07-01", True)
    set_chosen(created["id"], "2026-08-10", True)

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["next_session"] is None
    assert summary["last_session"] == "2026-08-10", "the most recent one"


def test_summary_carries_both_when_a_calendar_has_history_and_a_plan(
    fixed_today,
) -> None:
    created = create("DnD", ["Dani"]).json()
    set_chosen(created["id"], "2026-08-10", True)
    set_chosen(created["id"], "2026-09-14", True)

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["next_session"] == "2026-09-14"
    assert summary["last_session"] == "2026-08-10"


def test_today_counts_as_a_session_still_to_come(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    set_chosen(created["id"], "2026-09-03", True)

    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["next_session"] == "2026-09-03"
    assert summary["last_session"] is None


def test_summary_has_no_session_when_nothing_is_chosen(fixed_today) -> None:
    create("DnD", ["Dani"])
    summary = client.get("/api/kdh/calendars").json()[0]
    assert summary["next_session"] is None and summary["last_session"] is None


# ── bulk voting ──────────────────────────────────────────────────────────────


def vote_bulk(calendar_id: str, invitee_id: str, dates: list[str], status: str):
    return client.put(
        f"/api/kdh/calendars/{calendar_id}/votes/bulk",
        json={"invitee_id": invitee_id, "dates": dates, "status": status},
    )


def test_bulk_marks_every_day(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    body = vote_bulk(created["id"], dani, ["2026-09-14", "2026-09-15", "2026-09-21"], "yes")

    assert body.status_code == 200
    votes = body.json()["votes"]
    assert set(votes) == {"2026-09-14", "2026-09-15", "2026-09-21"}
    assert all(v == {dani: "yes"} for v in votes.values())


def test_bulk_leaves_other_people_alone(fixed_today) -> None:
    created = create("DnD", ["Dani", "Jake"]).json()
    dani, jake = (i["id"] for i in created["invitees"])
    vote(created["id"], jake, "2026-09-14", "if_needed")

    body = vote_bulk(created["id"], dani, ["2026-09-14"], "yes").json()
    assert body["votes"]["2026-09-14"] == {jake: "if_needed", dani: "yes"}


def test_bulk_overwrites_whatever_was_there(fixed_today) -> None:
    """Answering many days at once settles them; it does not fill in the blanks."""
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    vote(created["id"], dani, "2026-09-14", "yes")

    body = vote_bulk(created["id"], dani, ["2026-09-14", "2026-09-15"], "if_needed").json()

    assert body["votes"]["2026-09-14"] == {dani: "if_needed"}
    assert body["votes"]["2026-09-15"] == {dani: "if_needed"}


def test_bulk_can_clear_a_run_of_days(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    vote_bulk(created["id"], dani, ["2026-09-14", "2026-09-15"], "yes")

    body = vote_bulk(created["id"], dani, ["2026-09-14", "2026-09-15"], "none").json()
    assert body["votes"] == {}, "emptied days are pruned, as for a single vote"


def test_bulk_is_all_or_nothing(fixed_today) -> None:
    """One bad day must not leave the rest half-applied."""
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    response = vote_bulk(created["id"], dani, ["2026-09-14", "2026-09-02", "2026-09-15"], "yes")

    assert response.status_code == 422, "the 2nd is past"
    assert client.get(f"/api/kdh/calendars/{created['id']}").json()["votes"] == {}


def test_bulk_rejects_an_empty_selection(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    assert vote_bulk(created["id"], dani, [], "yes").status_code == 422


def test_bulk_rejects_a_removed_invitee(fixed_today) -> None:
    created = create("DnD", ["Dani", "Departing"]).json()
    departing = created["invitees"][1]["id"]
    seed_votes(created["id"], {"2026-08-10": {departing: "yes"}})
    client.delete(f"/api/kdh/calendars/{created['id']}/invitees/{departing}")

    assert vote_bulk(created["id"], departing, ["2026-09-14"], "yes").status_code == 422


def test_a_guest_may_bulk_vote(as_guest: None, fixed_today) -> None:
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    app.dependency_overrides[get_current_user] = lambda: "players"

    assert vote_bulk(created["id"], dani, ["2026-09-14"], "yes").status_code == 200


# ── notes ────────────────────────────────────────────────────────────────────


def set_note(calendar_id: str, invitee_id: str, day: str, text: str):
    return client.put(
        f"/api/kdh/calendars/{calendar_id}/notes",
        json={"invitee_id": invitee_id, "date": day, "text": text},
    )


def test_a_note_is_stored_against_the_person_and_the_day(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    body = set_note(created["id"], dani, "2026-09-14", "  Only after 8pm  ").json()

    assert body["notes"] == {"2026-09-14": {dani: "Only after 8pm"}}, "trimmed"


def test_a_note_is_independent_of_a_vote(fixed_today) -> None:
    """The point of the feature: someone who cannot come can still say why."""
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    body = set_note(created["id"], dani, "2026-09-14", "Away that week").json()

    assert body["notes"]["2026-09-14"][dani] == "Away that week"
    assert body["votes"] == {}, "no vote was implied"


def test_a_blank_note_clears_it_and_prunes_the_day(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    set_note(created["id"], dani, "2026-09-14", "Something")

    body = set_note(created["id"], dani, "2026-09-14", "   ").json()
    assert body["notes"] == {}


def test_a_note_can_be_edited(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    set_note(created["id"], dani, "2026-09-14", "First")

    body = set_note(created["id"], dani, "2026-09-14", "Second").json()
    assert body["notes"]["2026-09-14"][dani] == "Second"


def test_notes_and_votes_do_not_disturb_each_other(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    set_note(created["id"], dani, "2026-09-14", "Bring dice")
    body = vote(created["id"], dani, "2026-09-14", "yes").json()
    assert body["notes"]["2026-09-14"][dani] == "Bring dice"

    body = vote(created["id"], dani, "2026-09-14", "none").json()
    assert body["notes"]["2026-09-14"][dani] == "Bring dice", "clearing a vote keeps the note"


def test_a_note_that_is_too_long_is_refused(fixed_today) -> None:
    from app.schemas.kdh import NOTE_MAX_LENGTH

    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]

    response = set_note(created["id"], dani, "2026-09-14", "x" * (NOTE_MAX_LENGTH + 1))
    assert response.status_code == 422
    assert set_note(created["id"], dani, "2026-09-14", "x" * NOTE_MAX_LENGTH).status_code == 200


def test_a_note_on_a_past_day_is_refused(fixed_today) -> None:
    created = create("DnD", ["Dani"]).json()
    dani = created["invitees"][0]["id"]
    assert set_note(created["id"], dani, "2026-09-02", "Too late").status_code == 422


def test_anyone_may_edit_or_clear_a_note(as_guest: None, fixed_today) -> None:
    """No ownership: everyone shares a login, so the claim was never a boundary."""
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    created = create("DnD", ["Dani", "Jake"]).json()
    dani, jake = (i["id"] for i in created["invitees"])
    set_note(created["id"], dani, "2026-09-14", "Dani's note")
    app.dependency_overrides[get_current_user] = lambda: "players"

    body = set_note(created["id"], dani, "2026-09-14", "edited by someone else")
    assert body.status_code == 200
    assert body.json()["notes"]["2026-09-14"][dani] == "edited by someone else"
    assert jake  # roster untouched
