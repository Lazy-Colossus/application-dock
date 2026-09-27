"""Which cabinet a user's tea lives in.

Every tea service resolves the caller's cabinet here before touching the
repository. A user with no cabinet yet has an implicit empty one: reads see an
empty document they would own, and the first write creates it. A user who still
has a pre-v3 per-user file is migrated into a cabinet on first resolve.

Never call `resolve` or `ensure` inside a `repo.doc_transaction` block — they may
take the membership lock, which must always be taken before a cabinet's.

Membership changes raise `ValueError` (refused), `PermissionError` (not the
owner) and `FileNotFoundError` (no such member); the router translates them.
"""

from __future__ import annotations

from app.repositories import tea_repo as repo
from app.schemas.tea import CabinetView, TeaDoc
from app.services import auth_service

CabinetGoneError = repo.CabinetGoneError


def _resolve_locked(members: dict[str, str], username: str) -> str | None:
    """Resolve under the membership lock, finishing or running a legacy migration."""
    known = members.get(username)
    if known is not None:
        # A crash after the map write left the legacy file behind; kept, it would
        # be adopted again the day this user leaves the cabinet.
        repo.delete_legacy(username)
        return known
    if not repo.legacy_exists(username):
        return None
    cabinet_id = repo.adopt_legacy(username, set(members.values()))
    members[username] = cabinet_id
    repo.write_memberships(members)
    repo.delete_legacy(username)
    return cabinet_id


def resolve(username: str) -> str | None:
    """The caller's cabinet id, or None while they have none."""
    if not repo.legacy_exists(username):
        return repo.read_memberships().get(username)
    with repo.membership_lock():
        return _resolve_locked(repo.read_memberships(), username)


def ensure(username: str) -> str:
    """The caller's cabinet id, creating an empty cabinet they own if they have none."""
    cabinet_id = resolve(username)
    if cabinet_id is not None:
        return cabinet_id
    with repo.membership_lock():
        members = repo.read_memberships()
        cabinet_id = _resolve_locked(members, username)
        if cabinet_id is None:
            cabinet_id = repo.new_cabinet(username)
            members[username] = cabinet_id
            repo.write_memberships(members)
        return cabinet_id


def read_doc_for(username: str) -> TeaDoc:
    """The caller's cabinet document, or an empty one they would own."""
    cabinet_id = resolve(username)
    if cabinet_id is None:
        return TeaDoc(owner=username)
    return repo.read_doc(cabinet_id)


def get_cabinet(username: str) -> CabinetView:
    cabinet_id = resolve(username)
    if cabinet_id is None:
        return CabinetView(id=None, owner=username, members=[username], is_owner=True)
    owner = repo.read_doc(cabinet_id).owner
    members = sorted(
        user for user, cabinet in repo.read_memberships().items() if cabinet == cabinet_id
    )
    return CabinetView(id=cabinet_id, owner=owner, members=members, is_owner=owner == username)


def _is_empty(doc: TeaDoc) -> bool:
    return not doc.teas and not doc.sessions and not doc.catalogue_nodes


def add_member(caller: str, username: str) -> CabinetView:
    """Move `username` into the caller's cabinet. Only an empty cabinet can be left behind."""
    username = username.strip()
    if username == caller:
        raise ValueError("You're already in this cabinet")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")

    cabinet_id = ensure(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if repo.read_doc(cabinet_id).owner != caller:
            raise PermissionError("Only the cabinet's owner can add people")
        theirs = _resolve_locked(members, username)
        if theirs == cabinet_id:
            raise ValueError(f"{username} is already in this cabinet")
        if theirs is None:
            members[username] = cabinet_id
            repo.write_memberships(members)
        else:
            if any(cabinet == theirs for user, cabinet in members.items() if user != username):
                raise ValueError(f"{username} already shares a cabinet with someone else")
            with repo.cabinet_lock(theirs):
                if not _is_empty(repo.read_doc(theirs)):
                    raise ValueError(f"{username} already has teas in their cabinet")
                members[username] = cabinet_id
                repo.write_memberships(members)
                # Only after the map write: a crash here leaves an unreferenced empty
                # file, never a member pointing at a cabinet that is gone.
                repo.delete_cabinet(theirs)
    return get_cabinet(caller)


def remove_member(caller: str, username: str) -> CabinetView:
    """The owner removes anyone else; a member removes themself (leaving)."""
    cabinet_id = resolve(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if cabinet_id is None or members.get(username) != cabinet_id:
            raise FileNotFoundError(f"{username} isn't in this cabinet")
        owner = repo.read_doc(cabinet_id).owner
        if caller not in (owner, username):
            raise PermissionError("Only the cabinet's owner can remove other people")
        if username == owner:
            raise ValueError("The owner can't leave the cabinet — remove the other members instead")
        del members[username]
        repo.write_memberships(members)
    return get_cabinet(caller)
