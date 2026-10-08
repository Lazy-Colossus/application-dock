"""Business logic for Floor Planner.

Every function works on the caller's apartment, resolved from their username: no
request names an apartment id. A user with no apartment reads an empty one they
own; the first write creates it.

There is no live push, so writes come in two kinds. Coarse plan writes (the
whole drawn plan, lock/unlock) carry the `plan_rev` they were based on and are
refused if another plan write landed first. Per-piece writes (furniture, and
placements later) are last-write-wins and bump only `rev`, so adding a sofa
never makes someone's unsaved plan drawing go stale.

Never call `ensure_apartment` inside a `repo.apartment_transaction` block — it
may take the membership lock, which is always taken before an apartment's.

Raises `FileNotFoundError` (no such member), `PermissionError` (not the owner),
`ValueError` (refused), `StaleRevError` and `ApartmentGoneError` (the apartment
vanished under a concurrent membership change); the router translates them.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import (
    CELL_CM,
    CUSTOM_MAX,
    FEATURE_CODES,
    LABEL_MAX,
    NAME_MAX,
    NOTE_MAX,
    PIECES_MAX,
    SIDE_CM_MAX,
    SURFACE_CODES,
    ApartmentDoc,
    ApartmentView,
    Furniture,
    Label,
    PieceDraft,
    PlanWriteRequest,
)
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
        **doc.model_dump(exclude={"id", "owner", "plan_updated_by"}),
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


def _mutate_plan(
    username: str, base_rev: int, change: Callable[[ApartmentDoc], None]
) -> ApartmentView:
    """Apply a plan write under the apartment's lock if no plan write landed since `base_rev`."""
    apartment_id = ensure_apartment(username)
    with repo.apartment_transaction(apartment_id) as doc:
        if doc.plan_rev != base_rev:
            raise StaleRevError(f"{doc.plan_updated_by or 'Someone'} changed this")
        change(doc)
        doc.plan_rev += 1
        doc.rev += 1
        doc.plan_updated_by = username
        updated = doc.model_copy(deep=True)
    return _view(updated, username)


def _mutate_free(username: str, change: Callable[[ApartmentDoc], None]) -> ApartmentView:
    """Apply a per-piece write under the apartment's lock; last write wins."""
    apartment_id = ensure_apartment(username)
    with repo.apartment_transaction(apartment_id) as doc:
        change(doc)
        doc.rev += 1
        updated = doc.model_copy(deep=True)
    return _view(updated, username)


def set_locked(username: str, base_rev: int, locked: bool) -> ApartmentView:
    def change(doc: ApartmentDoc) -> None:
        doc.locked = locked

    return _mutate_plan(username, base_rev, change)


def _check_layer(name: str, layer: list[str], codes: frozenset[str], cols: int, rows: int) -> None:
    if len(layer) != rows:
        raise ValueError(f"The {name} layer has {len(layer)} rows, expected {rows}")
    for r, line in enumerate(layer):
        if len(line) != 2 * cols:
            raise ValueError(f"The {name} layer's row {r} isn't {cols} squares wide")
        for c in range(cols):
            token = line[2 * c : 2 * c + 2]
            if token not in codes:
                raise ValueError(f"unknown {name} code {token!r} at column {c}, row {r}")


def _clean_labels(labels: list[Label], cols: int, rows: int) -> list[Label]:
    if len({label.id for label in labels}) != len(labels):
        raise ValueError("Two labels share an id")
    cleaned = []
    for label in labels:
        text = label.text.strip()
        if not text or len(text) > LABEL_MAX:
            raise ValueError(f"A label needs 1–{LABEL_MAX} characters")
        if not (0 <= label.col < cols and 0 <= label.row < rows):
            raise ValueError(f"The label {text!r} is outside the plan")
        cleaned.append(label.model_copy(update={"text": text}))
    return cleaned


def replace_plan(username: str, req: PlanWriteRequest) -> ApartmentView:
    """Swap in the whole drawn plan — size, both layers and labels — in one write."""
    _check_layer("surface", req.surface, SURFACE_CODES, req.cols, req.rows)
    _check_layer("feature", req.feature, FEATURE_CODES, req.cols, req.rows)
    labels = _clean_labels(req.labels, req.cols, req.rows)

    def change(doc: ApartmentDoc) -> None:
        if doc.locked:
            raise ValueError("Unlock the plan to change it")
        doc.cols, doc.rows = req.cols, req.rows
        doc.surface, doc.feature, doc.labels = req.surface, req.feature, labels

    return _mutate_plan(username, req.base_rev, change)


def _trim_mask(cells: list[str]) -> list[str]:
    rows = [r for r in range(len(cells)) if "#" in cells[r]]
    cols = [c for c in range(len(cells[0])) if any(row[c] == "#" for row in cells)]
    return [row[cols[0] : cols[-1] + 1] for row in cells[rows[0] : rows[-1] + 1]]


def _clean_piece(draft: PieceDraft, piece_id: str) -> Furniture:
    """Check a piece against FU-1 to FU-3; custom sizes always come from the trimmed mask."""
    name = draft.name.strip()
    label = name or "A piece"
    if not name or len(name) > NAME_MAX:
        raise ValueError(f"{label}: the name needs 1–{NAME_MAX} characters")
    note = draft.note.strip()
    if len(note) > NOTE_MAX:
        raise ValueError(f"{label}: the note is longer than {NOTE_MAX} characters")
    if draft.shape == "custom":
        cells = draft.cells or []
        if not cells or len(cells) > CUSTOM_MAX or len({len(r) for r in cells}) != 1:
            raise ValueError(f"{label}: a custom shape is up to {CUSTOM_MAX} equal rows")
        if len(cells[0]) > CUSTOM_MAX or set("".join(cells)) - {"#", "."}:
            raise ValueError(f"{label}: a custom shape is up to {CUSTOM_MAX} squares of # and .")
        if "#" not in "".join(cells):
            raise ValueError(f"{label}: paint at least one square")
        mask = _trim_mask(cells)
        return Furniture(
            id=piece_id,
            name=name,
            colour=draft.colour,
            note=note,
            shape="custom",
            width_cm=len(mask[0]) * CELL_CM,
            depth_cm=len(mask) * CELL_CM,
            cells=mask,
        )
    for side, value in (("width", draft.width_cm), ("depth", draft.depth_cm)):
        if not 1 <= value <= SIDE_CM_MAX:
            raise ValueError(f"{label}: {side} must be 1–{SIDE_CM_MAX} cm")
    if draft.shape == "round" and draft.width_cm != draft.depth_cm:
        raise ValueError(f"{label}: a round piece has one diameter")
    return Furniture(
        id=piece_id,
        name=name,
        colour=draft.colour,
        note=note,
        shape=draft.shape,
        width_cm=draft.width_cm,
        depth_cm=draft.depth_cm,
    )


def _new_piece_id() -> str:
    return f"f_{uuid.uuid4().hex}"


def add_pieces(username: str, drafts: list[PieceDraft]) -> ApartmentView:
    """All or nothing: one bad piece refuses the whole batch."""
    pieces = [_clean_piece(d, _new_piece_id()) for d in drafts]

    def change(doc: ApartmentDoc) -> None:
        if len(doc.furniture) + len(pieces) > PIECES_MAX:
            raise ValueError(f"An apartment holds at most {PIECES_MAX} pieces")
        doc.furniture.extend(pieces)

    return _mutate_free(username, change)


def _index_of(doc: ApartmentDoc, piece_id: str) -> int:
    for i, piece in enumerate(doc.furniture):
        if piece.id == piece_id:
            return i
    raise FileNotFoundError("That piece is gone — someone deleted it")


def update_piece(username: str, piece_id: str, draft: PieceDraft) -> ApartmentView:
    piece = _clean_piece(draft, piece_id)

    def change(doc: ApartmentDoc) -> None:
        doc.furniture[_index_of(doc, piece_id)] = piece

    return _mutate_free(username, change)


def delete_piece(username: str, piece_id: str) -> ApartmentView:
    """Removes the piece and its placement from every layout (FU-5)."""

    def change(doc: ApartmentDoc) -> None:
        del doc.furniture[_index_of(doc, piece_id)]
        for layout in doc.layouts:
            layout.placements = [p for p in layout.placements if p.furniture_id != piece_id]

    return _mutate_free(username, change)


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
