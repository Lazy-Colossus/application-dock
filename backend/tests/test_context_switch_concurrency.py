"""Story 1.8 — concurrent mutations of one document must not lose updates.

Context-Switch is the worst case named in the story: drag-reorder plus the
updates log make simultaneous writes ordinary, not exotic.
"""

import threading
from pathlib import Path

import pytest

from app.repositories import context_switch_repo as repo
from app.services import context_switch_service as service


@pytest.fixture()
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _run(fns: list) -> list[BaseException]:
    errors: list[BaseException] = []
    barrier = threading.Barrier(len(fns))

    def wrapped(fn):
        def inner() -> None:
            barrier.wait()
            try:
                fn()
            except BaseException as exc:  # pragma: no cover - surfaced by assert
                errors.append(exc)

        return inner

    threads = [threading.Thread(target=wrapped(fn)) for fn in fns]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def test_concurrent_create_list_keeps_every_list(isolate: Path) -> None:
    """Eight simultaneous creates → eight lists. Unguarded, most would vanish."""
    n = 8
    errors = _run([lambda i=i: service.create_list("ann", f"list-{i}") for i in range(n)])

    assert not errors
    names = {lst.name for lst in service.list_lists("ann")}
    assert names == {f"list-{i}" for i in range(n)}


def test_concurrent_add_todo_keeps_every_todo(isolate: Path) -> None:
    lst = service.create_list("ann", "Board")
    n = 8
    errors = _run(
        [
            lambda i=i: service.add_todo("ann", lst.id, header=f"t{i}", color="#fff")
            for i in range(n)
        ]
    )

    assert not errors
    headers = {todo.header for todo in service.get_list("ann", lst.id).todos}
    assert headers == {f"t{i}" for i in range(n)}


def test_add_racing_a_reorder_loses_neither_todo(isolate: Path) -> None:
    """Serialization does not make the reorder *succeed* — it makes the outcome
    honest. `reorder_todos` requires an exact permutation of the active ids, so
    if the add lands first the reorder is rejected outright rather than writing
    a stale order over the new todo. Either way, all three todos survive."""
    lst = service.create_list("ann", "Board")
    first = service.add_todo("ann", lst.id, header="first", color="#fff")
    second = service.add_todo("ann", lst.id, header="second", color="#fff")

    def reorder() -> None:
        try:
            service.reorder_todos("ann", lst.id, [second.id, first.id])
        except ValueError:
            # The add went first; the client's id list is stale. Correct rejection.
            pass

    errors = _run(
        [
            reorder,
            lambda: service.add_todo("ann", lst.id, header="third", color="#fff"),
        ]
    )

    assert not errors
    todos = service.get_list("ann", lst.id).todos
    assert {t.header for t in todos} == {"first", "second", "third"}
    # Whatever happened, the board order is still a clean 0..n-1 sequence.
    assert sorted(t.order for t in todos) == list(range(len(todos)))


def test_two_users_are_not_serialized_against_each_other(isolate: Path) -> None:
    """Different files must stay concurrent — one user must not block another."""
    started = threading.Event()
    release = threading.Event()

    def hold_ann() -> None:
        with repo.doc_transaction("ann"):
            started.set()
            release.wait(timeout=1)

    holder = threading.Thread(target=hold_ann)
    holder.start()
    assert started.wait(timeout=1)

    # Would block until `release` if the lock key were not per-file.
    service.create_list("bob", "Bob's list")
    assert [lst.name for lst in service.list_lists("bob")] == ["Bob's list"]

    release.set()
    holder.join()


def test_a_failed_mutation_writes_nothing(isolate: Path) -> None:
    service.create_list("ann", "Keep me")

    with pytest.raises(ValueError):
        service.create_list("ann", "   ")

    assert [lst.name for lst in service.list_lists("ann")] == ["Keep me"]


def test_concurrent_posts_through_the_real_api_all_persist(isolate: Path) -> None:
    """The end-to-end shape of the bug: many simultaneous `POST /lists` from one
    user, driven through the router and its threadpool rather than the service."""
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    n = 8
    statuses: list[int] = []
    lock = threading.Lock()

    def post(i: int) -> None:
        response = client.post("/api/context-switch/lists", json={"name": f"api-{i}"})
        with lock:
            statuses.append(response.status_code)

    errors = _run([lambda i=i: post(i) for i in range(n)])

    assert not errors
    assert statuses == [200] * n
    listed = client.get("/api/context-switch/lists").json()
    assert {lst["name"] for lst in listed} == {f"api-{i}" for i in range(n)}
