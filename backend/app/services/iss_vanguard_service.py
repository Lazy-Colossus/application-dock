"""Business logic for the ISS Vanguard resource tracker.

Every function works on the caller's ship, resolved from their username: no
request names a ship id, so no path reaches a ship the caller is not on. A user
with no ship reads an empty one they own; the first write creates it.

Never call `ensure_ship` inside a `repo.ship_transaction` block — it may take
the membership lock, which is always taken before a ship's.

Raises `FileNotFoundError` (no such project or member), `PermissionError` (not
the owner), `ValueError` (refused) and `ShipGoneError` (the ship vanished under
a concurrent membership change); the router translates them.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from app.repositories import iss_vanguard_repo as repo
from app.schemas.iss_vanguard import (
    RESOURCES,
    TIERS,
    Project,
    ProjectWriteRequest,
    Resource,
    ShipDoc,
    ShipView,
    Tier,
    empty_grid,
    is_empty_grid,
)
from app.services import auth_service
from app.services import iss_vanguard_events as events

ShipGoneError = repo.ShipGoneError


def _resolve(username: str) -> str | None:
    return repo.read_memberships().get(username)


def ensure_ship(username: str) -> str:
    """The caller's ship id, creating an empty ship they own if they have none."""
    ship_id = _resolve(username)
    if ship_id is not None:
        return ship_id
    with repo.membership_lock():
        members = repo.read_memberships()
        ship_id = members.get(username)
        if ship_id is None:
            ship_id = repo.new_ship(username)
            members[username] = ship_id
            repo.write_memberships(members)
        return ship_id


def _members_of(ship_id: str) -> list[str]:
    return sorted(user for user, ship in repo.read_memberships().items() if ship == ship_id)


def _view(doc: ShipDoc, username: str) -> ShipView:
    return ShipView(
        id=doc.id,
        owner=doc.owner,
        members=_members_of(doc.id),
        is_owner=doc.owner == username,
        rev=doc.rev,
        stock=doc.stock,
        projects=doc.projects,
    )


def get_ship(username: str) -> ShipView:
    ship_id = _resolve(username)
    if ship_id is None:
        return ShipView(
            id=None,
            owner=username,
            members=[username],
            is_owner=True,
            rev=0,
            stock=empty_grid(),
            projects=[],
        )
    return _view(repo.read_ship(ship_id), username)


def _mutate(username: str, change: Callable[[ShipDoc], None]) -> ShipView:
    """Apply `change` to the caller's ship under its lock, bump `rev`, and tell the others."""
    ship_id = ensure_ship(username)
    with repo.ship_transaction(ship_id) as doc:
        change(doc)
        doc.rev += 1
        updated = doc.model_copy(deep=True)
    events.publish(
        ship_id,
        {"type": "ship.changed", "ship_id": ship_id, "rev": updated.rev, "actor": username},
    )
    return _view(updated, username)


def adjust_stock(username: str, resource: Resource, tier: Tier, delta: int) -> ShipView:
    """Apply one tap. A delta, not a total, so taps from two phones never overwrite each other."""

    def change(doc: ShipDoc) -> None:
        count = doc.stock[resource][tier] + delta
        if count < 0:
            raise ValueError(f"{resource} ({tier}) is already at 0")
        doc.stock[resource][tier] = count

    return _mutate(username, change)


def _find(doc: ShipDoc, project_id: str) -> Project:
    for project in doc.projects:
        if project.id == project_id:
            return project
    raise FileNotFoundError(f"No project {project_id!r}")


def _clean(doc: ShipDoc, req: ProjectWriteRequest, project_id: str | None) -> ProjectWriteRequest:
    code = req.code.strip()
    if not code:
        raise ValueError("A project needs a code, e.g. VB07")
    if req.prerequisite_id is not None:
        if req.prerequisite_id == project_id:
            raise ValueError("A project can't require itself")
        if not any(p.id == req.prerequisite_id for p in doc.projects):
            raise ValueError("The prerequisite project no longer exists")
    return req.model_copy(update={"code": code, "name": req.name.strip()})


def create_project(username: str, req: ProjectWriteRequest) -> ShipView:
    def change(doc: ShipDoc) -> None:
        clean = _clean(doc, req, None)
        doc.projects.append(Project(id=f"p-{uuid.uuid4().hex[:8]}", **clean.model_dump()))

    return _mutate(username, change)


def update_project(username: str, project_id: str, req: ProjectWriteRequest) -> ShipView:
    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        clean = _clean(doc, req, project_id)
        project.code = clean.code
        project.name = clean.name
        project.prerequisite_id = clean.prerequisite_id
        project.cost = clean.cost

    return _mutate(username, change)


def delete_project(username: str, project_id: str) -> ShipView:
    def change(doc: ShipDoc) -> None:
        doc.projects.remove(_find(doc, project_id))
        for project in doc.projects:
            if project.prerequisite_id == project_id:
                project.prerequisite_id = None

    return _mutate(username, change)


def complete_project(username: str, project_id: str) -> ShipView:
    """Deduct the cost, clamping at 0: the game may already have played out with short stock."""

    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        if project.done:
            raise ValueError(f"{project.code} is already done")
        for resource in RESOURCES:
            for tier in TIERS:
                have = doc.stock[resource][tier]
                doc.stock[resource][tier] = max(0, have - project.cost[resource][tier])
        project.done = True

    return _mutate(username, change)


def reopen_project(username: str, project_id: str) -> ShipView:
    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        if not project.done:
            raise ValueError(f"{project.code} isn't done")
        for resource in RESOURCES:
            for tier in TIERS:
                doc.stock[resource][tier] += project.cost[resource][tier]
        project.done = False

    return _mutate(username, change)


def _is_empty(doc: ShipDoc) -> bool:
    return not doc.projects and is_empty_grid(doc.stock)


def _publish_members(ship_id: str) -> None:
    events.publish(
        ship_id,
        {"type": "members.changed", "ship_id": ship_id, "members": _members_of(ship_id)},
    )


def _publish_closed(ship_id: str, reason: str, member: str) -> None:
    # Everyone on the stream receives it; `member` says whose client should move.
    events.publish(
        ship_id,
        {"type": "ship.closed", "ship_id": ship_id, "reason": reason, "member": member},
    )


def add_member(caller: str, username: str) -> ShipView:
    """Move `username` aboard the caller's ship. Only an empty ship can be left behind."""
    username = username.strip()
    if username == caller:
        raise ValueError("You're already aboard this ship")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")

    ship_id = ensure_ship(caller)
    abandoned: str | None = None
    with repo.membership_lock():
        members = repo.read_memberships()
        if repo.read_ship(ship_id).owner != caller:
            raise PermissionError("Only the ship's owner can add crew")
        theirs = members.get(username)
        if theirs == ship_id:
            raise ValueError(f"{username} is already aboard")
        if theirs is None:
            members[username] = ship_id
            repo.write_memberships(members)
        else:
            if any(ship == theirs for user, ship in members.items() if user != username):
                raise ValueError(f"{username} already shares a ship with someone else")
            with repo.ship_lock(theirs):
                if not _is_empty(repo.read_ship(theirs)):
                    raise ValueError(f"{username} already has resources or projects on their ship")
                members[username] = ship_id
                repo.write_memberships(members)
                # Only after the map write: a crash here leaves an unreferenced empty
                # file, never a member pointing at a ship that is gone.
                repo.delete_ship(theirs)
            abandoned = theirs
    if abandoned is not None:
        _publish_closed(abandoned, "joined", username)
    _publish_members(ship_id)
    return get_ship(caller)


def remove_member(caller: str, username: str) -> ShipView:
    """The owner removes anyone else; a member removes themself (leaving)."""
    ship_id = _resolve(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if ship_id is None or members.get(username) != ship_id:
            raise FileNotFoundError(f"{username} isn't aboard this ship")
        owner = repo.read_ship(ship_id).owner
        if caller not in (owner, username):
            raise PermissionError("Only the ship's owner can remove other crew")
        if username == owner:
            raise ValueError("The owner can't leave the ship — remove the other crew instead")
        del members[username]
        repo.write_memberships(members)
    _publish_members(ship_id)
    _publish_closed(ship_id, "removed", username)
    return get_ship(caller)
