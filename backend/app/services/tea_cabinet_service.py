"""Which cabinet a user's tea lives in.

Every tea service resolves the caller's cabinet here before touching the
repository. A user with no cabinet yet has an implicit empty one: reads see an
empty document they would own, and the first write creates it. A user who still
has a pre-v3 per-user file is migrated into a cabinet on first resolve.

Never call `resolve` or `ensure` inside a `repo.doc_transaction` block — they may
take the membership lock, which must always be taken before a cabinet's.
"""

from __future__ import annotations

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc

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
