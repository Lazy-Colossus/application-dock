"""Business logic for Floor Planner.

Every function works on the caller's apartment, resolved from their username: no
request names an apartment id. A user with no apartment reads an empty one they
own; the first write creates it. Every document write carries the `rev` it was
based on and is refused if another write landed first — there is no live push,
so this is how two editors find out about each other.

Never call `ensure_apartment` inside a `repo.apartment_transaction` block — it
may take the membership lock, which is always taken before an apartment's.

Raises `FileNotFoundError` (no such member), `PermissionError` (not the owner),
`ValueError` (refused), `StaleRevError` and `ApartmentGoneError` (the apartment
vanished under a concurrent membership change); the router translates them.
"""

from __future__ import annotations

from collections.abc import Callable

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import ApartmentDoc, ApartmentView
from app.services import auth_service

ApartmentGoneError = repo.ApartmentGoneError


class StaleRevError(Exception):
    """The write was based on an older `rev` than the one stored."""


def _resolve(username: str) -> str | None:
    return repo.read_memberships().get(username)


def ensure_apartment(username: str) -> str:
    """The caller's apartment id, creating an empty one they own if they have none."""
    apartment_id = _resolve(username)
    if apartment_id is not None:
        return apartment_id
    with repo.membership_lock():
        members = repo.read_memberships()
        apartment_id = members.get(username)
        if apartment_id is None:
            apartment_id = repo.new_apartment(username)
            members[username] = apartment_id
            repo.write_memberships(members)
        return apartment_id


def _members_of(apartment_id: str) -> list[str]:
    return sorted(user for user, apt in repo.read_memberships().items() if apt == apartment_id)


def _view(doc: ApartmentDoc, username: str, *, saved: bool = True) -> ApartmentView:
    return ApartmentView(
        **doc.model_dump(exclude={"id", "owner", "updated_by"}),
        id=doc.id if saved else None,
        owner=doc.owner,
        members=_members_of(doc.id) if saved else [username],
        is_owner=doc.owner == username,
    )


def get_apartment(username: str) -> ApartmentView:
    apartment_id = _resolve(username)
    if apartment_id is None:
        return _view(ApartmentDoc(id="", owner=username), username, saved=False)
    return _view(repo.read_apartment(apartment_id), username)


def _mutate(username: str, base_rev: int, change: Callable[[ApartmentDoc], None]) -> ApartmentView:
    """Apply `change` under the apartment's lock if nobody has written since `base_rev`."""
    apartment_id = ensure_apartment(username)
    with repo.apartment_transaction(apartment_id) as doc:
        if doc.rev != base_rev:
            raise StaleRevError(f"{doc.updated_by or 'Someone'} changed this")
        change(doc)
        doc.rev += 1
        doc.updated_by = username
        updated = doc.model_copy(deep=True)
    return _view(updated, username)


def set_locked(username: str, base_rev: int, locked: bool) -> ApartmentView:
    def change(doc: ApartmentDoc) -> None:
        doc.locked = locked

    return _mutate(username, base_rev, change)


def _is_empty(doc: ApartmentDoc) -> bool:
    painted = any(row.strip(".") for row in (*doc.surface, *doc.feature))
    return not (doc.furniture or doc.labels or painted)


def add_member(caller: str, username: str) -> ApartmentView:
    """Move `username` into the caller's apartment. Only an empty one can be left behind."""
    username = username.strip()
    if username == caller:
        raise ValueError("You already share this apartment")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")

    apartment_id = ensure_apartment(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if repo.read_apartment(apartment_id).owner != caller:
            raise PermissionError("Only the apartment's owner can add people")
        theirs = members.get(username)
        if theirs == apartment_id:
            raise ValueError(f"{username} already shares this apartment")
        if theirs is None:
            members[username] = apartment_id
            repo.write_memberships(members)
        else:
            if any(apt == theirs for user, apt in members.items() if user != username):
                raise ValueError(f"{username} already shares an apartment with someone else")
            with repo.apartment_lock(theirs):
                if not _is_empty(repo.read_apartment(theirs)):
                    raise ValueError(f"{username} has already drawn or added things of their own")
                members[username] = apartment_id
                repo.write_memberships(members)
                # Only after the map write: a crash here leaves an unreferenced empty
                # file, never a member pointing at an apartment that is gone.
                repo.delete_apartment(theirs)
    return get_apartment(caller)


def remove_member(caller: str, username: str) -> ApartmentView:
    """The owner removes anyone else; a member removes themself (leaving)."""
    apartment_id = _resolve(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if apartment_id is None or members.get(username) != apartment_id:
            raise FileNotFoundError(f"{username} doesn't share this apartment")
        owner = repo.read_apartment(apartment_id).owner
        if caller not in (owner, username):
            raise PermissionError("Only the apartment's owner can remove other people")
        if username == owner:
            raise ValueError("The owner can't leave — remove the others first")
        del members[username]
        repo.write_memberships(members)
    return get_apartment(caller)
