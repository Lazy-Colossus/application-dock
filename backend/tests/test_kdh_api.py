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
    assert body == {"username": "test_user", "is_admin": True}


def test_me_reports_a_guest(as_guest: None) -> None:
    body = client.get("/api/kdh/me").json()
    assert body == {"username": "players", "is_admin": False}


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


def test_every_invitee_gets_a_distinct_colour() -> None:
    body = create(invitees=[f"P{i}" for i in range(8)]).json()
    colours = [i["color"] for i in body["invitees"]]
    assert len(set(colours)) == len(colours)


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


def test_create_rejects_more_invitees_than_the_palette_holds() -> None:
    from app.services.kdh_service import PALETTE

    response = create(invitees=[f"P{i}" for i in range(len(PALETTE) + 1)])
    assert response.status_code == 422
    assert "colours" in response.json()["detail"].lower()


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
    assert body[0].keys() == {"id", "name", "invitee_count", "created_at"}


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


def test_add_invitee_appends_with_a_free_colour_and_next_order() -> None:
    created = create("DnD", ["Dani", "Jake"]).json()

    body = add_invitee(created["id"], "Tom")
    assert body.status_code == 201
    invitees = body.json()["invitees"]

    assert [i["name"] for i in invitees] == ["Dani", "Jake", "Tom"]
    tom = invitees[-1]
    assert tom["id"].startswith("inv-") and len(tom["id"]) == len("inv-") + 8
    assert tom["order"] == 2
    assert tom["removed_at"] is None
    assert tom["color"] not in {i["color"] for i in invitees[:-1]}


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


def test_add_invitee_rejects_when_the_palette_is_exhausted() -> None:
    from app.services.kdh_service import PALETTE

    created = create("DnD", [f"P{i}" for i in range(len(PALETTE))]).json()

    response = add_invitee(created["id"], "OneTooMany")
    assert response.status_code == 422
    assert "colours" in response.json()["detail"].lower()


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
