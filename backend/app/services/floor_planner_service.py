"""Business logic for Floor Planner.

A user belongs to one or more apartments (Story 1.5). Every call names the
apartment it works on and is refused with `FileNotFoundError` unless the caller
is a member, so an id never reveals that someone else's apartment exists. A
user with no apartment gets an empty "My apartment" when they list theirs.

There is no live push, so writes come in two kinds. Coarse plan writes (the
whole drawn plan) carry the `plan_rev` they were based on and are
refused if another plan write landed first. Per-piece writes (furniture,
placements, names) are last-write-wins and bump only `rev`, so adding a sofa
never makes someone's unsaved plan drawing go stale.

Never take the membership lock inside a `repo.apartment_transaction` block —
it is always taken before an apartment's.

Raises `FileNotFoundError` (no such apartment, member, piece or layout),
`PermissionError` (not the owner), `ValueError` (refused), `StaleRevError` and
`ApartmentGoneError` (the apartment vanished under a concurrent membership
change); the router translates them.
"""

from __future__ import annotations

import uuid
from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import (
    APARTMENT_NAME_MAX,
    APARTMENTS_MAX,
    CELL_CM,
    COLOUR_CHARS,
    CUSTOM_MAX,
    DEFAULT_APARTMENT_NAME,
    DOOR_CODES,
    EMPTY_SQUARE,
    FEATURE_CODES,
    LABEL_MAX,
    LAYOUT_NAME_MAX,
    LAYOUTS_MAX,
    NAME_MAX,
    NOTE_MAX,
    PIECE_CELL_CM,
    PIECES_MAX,
    SIDE_CM_MAX,
    SURFACE_CODES,
    ApartmentDoc,
    ApartmentSummary,
    ApartmentView,
    Colour,
    DoorSetting,
    Furniture,
    Label,
    Layout,
    PieceDraft,
    Placement,
    PlacementRequest,
    PlanWriteRequest,
    upgrade_legacy_cells,
)
from app.services import auth_service

ApartmentGoneError = repo.ApartmentGoneError

_NEVER = datetime.min.replace(tzinfo=UTC)


class StaleRevError(Exception):
    """The write was based on an older `rev` than the one stored."""


def _members_of(members: dict[str, list[str]], apartment_id: str) -> list[str]:
    return sorted(user for user, apts in members.items() if apartment_id in apts)


def _require_member(username: str, apartment_id: str) -> None:
    if apartment_id not in repo.read_memberships().get(username, []):
        raise FileNotFoundError("No such apartment")


def _clean_apartment_name(name: str) -> str:
    name = name.strip()
    if not name or len(name) > APARTMENT_NAME_MAX:
        raise ValueError(f"An apartment name needs 1–{APARTMENT_NAME_MAX} characters")
    return name


def _check_room_for(members: dict[str, list[str]], username: str) -> None:
    if len(members.get(username, [])) >= APARTMENTS_MAX:
        raise ValueError(f"{username} already has {APARTMENTS_MAX} apartments")


def _store_new(members: dict[str, list[str]], doc: ApartmentDoc) -> None:
    """Call under the membership lock. The file goes first, so no member ever points at nothing."""
    _check_room_for(members, doc.owner)
    doc.updated_at = datetime.now(UTC)
    repo.write_apartment(doc)
    members.setdefault(doc.owner, []).append(doc.id)
    repo.write_memberships(members)


def _summary(doc: ApartmentDoc, members: list[str], username: str) -> ApartmentSummary:
    return ApartmentSummary(
        id=doc.id,
        name=doc.name,
        owner=doc.owner,
        members=members,
        is_owner=doc.owner == username,
        updated_at=doc.updated_at,
    )


def _view(doc: ApartmentDoc, username: str) -> ApartmentView:
    summary = _summary(doc, _members_of(repo.read_memberships(), doc.id), username)
    return ApartmentView(
        **summary.model_dump(),
        **doc.model_dump(exclude={*ApartmentSummary.model_fields, "plan_updated_by"}),
    )


def list_apartments(username: str) -> list[ApartmentSummary]:
    """The caller's apartments, most recently changed first; never empty (AP-1)."""
    members = repo.read_memberships()
    if not members.get(username):
        with repo.membership_lock():
            members = repo.read_memberships()
            if not members.get(username):
                doc = ApartmentDoc(
                    id=repo.new_apartment_id(), owner=username, name=DEFAULT_APARTMENT_NAME
                )
                _store_new(members, doc)
    docs = []
    for apartment_id in members[username]:
        try:
            docs.append(repo.read_apartment(apartment_id))
        except ApartmentGoneError:
            continue
    docs.sort(key=lambda d: d.updated_at or _NEVER, reverse=True)
    return [_summary(d, _members_of(members, d.id), username) for d in docs]


def get_apartment(username: str, apartment_id: str) -> ApartmentView:
    _require_member(username, apartment_id)
    return _view(repo.read_apartment(apartment_id), username)


def create_apartment(username: str, name: str) -> ApartmentView:
    """An empty apartment with "Layout A", owned by the caller (AP-2)."""
    doc = ApartmentDoc(id=repo.new_apartment_id(), owner=username, name=_clean_apartment_name(name))
    with repo.membership_lock():
        _store_new(repo.read_memberships(), doc)
    return _view(doc, username)


def duplicate_apartment(username: str, apartment_id: str, name: str) -> ApartmentView:
    """A copy of everything — plan, labels, furniture, layouts — owned by the caller alone."""
    clean = _clean_apartment_name(name)
    _require_member(username, apartment_id)
    with repo.membership_lock():
        source = repo.read_apartment(apartment_id)
        doc = source.model_copy(
            deep=True,
            update={
                "id": repo.new_apartment_id(),
                "owner": username,
                "name": clean,
                "rev": 0,
                "plan_rev": 0,
                "plan_updated_by": None,
            },
        )
        _store_new(repo.read_memberships(), doc)
    return _view(doc, username)


def delete_apartment(username: str, apartment_id: str) -> list[ApartmentSummary]:
    """Owner only: gone for every member (AP-5). Returns the caller's remaining apartments."""
    with repo.membership_lock():
        members = repo.read_memberships()
        if apartment_id not in members.get(username, []):
            raise FileNotFoundError("No such apartment")
        if repo.read_apartment(apartment_id).owner != username:
            raise PermissionError("Only the apartment's owner can delete it")
        with repo.apartment_lock(apartment_id):
            for apts in members.values():
                if apartment_id in apts:
                    apts.remove(apartment_id)
            repo.write_memberships({u: apts for u, apts in members.items() if apts})
            # Only after the map write: a crash here leaves an unreferenced file,
            # never a member pointing at an apartment that is gone.
            repo.delete_apartment(apartment_id)
    return list_apartments(username)


def _mutate_plan(
    username: str, apartment_id: str, base_rev: int, change: Callable[[ApartmentDoc], None]
) -> ApartmentView:
    """Apply a plan write under the apartment's lock if no plan write landed since `base_rev`."""
    _require_member(username, apartment_id)
    with repo.apartment_transaction(apartment_id) as doc:
        if doc.plan_rev != base_rev:
            raise StaleRevError(f"{doc.plan_updated_by or 'Someone'} changed this")
        change(doc)
        doc.plan_rev += 1
        doc.rev += 1
        doc.plan_updated_by = username
        doc.updated_at = datetime.now(UTC)
        updated = doc.model_copy(deep=True)
    return _view(updated, username)


def _mutate_free(
    username: str, apartment_id: str, change: Callable[[ApartmentDoc], None]
) -> ApartmentView:
    """Apply a per-piece write under the apartment's lock; last write wins."""
    _require_member(username, apartment_id)
    with repo.apartment_transaction(apartment_id) as doc:
        change(doc)
        doc.rev += 1
        doc.updated_at = datetime.now(UTC)
        updated = doc.model_copy(deep=True)
    return _view(updated, username)


def rename_apartment(username: str, apartment_id: str, name: str) -> ApartmentView:
    """Any member may rename (AP-4)."""
    clean = _clean_apartment_name(name)

    def change(doc: ApartmentDoc) -> None:
        doc.name = clean

    return _mutate_free(username, apartment_id, change)


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


def _clean_doors(
    doors: list[DoorSetting], feature: list[str], cols: int, rows: int
) -> list[DoorSetting]:
    """A door painted over, moved or cut off by a shrink just loses its settings."""
    if len({(d.col, d.row) for d in doors}) != len(doors):
        raise ValueError("Two door settings share a square")
    return [
        d
        for d in doors
        if 0 <= d.col < cols
        and 0 <= d.row < rows
        and feature[d.row][2 * d.col : 2 * d.col + 2] in DOOR_CODES
    ]


def replace_plan(username: str, apartment_id: str, req: PlanWriteRequest) -> ApartmentView:
    """Swap in the whole drawn plan — size, both layers, labels and doors — in one write."""
    _check_layer("surface", req.surface, SURFACE_CODES, req.cols, req.rows)
    _check_layer("feature", req.feature, FEATURE_CODES, req.cols, req.rows)
    labels = _clean_labels(req.labels, req.cols, req.rows)
    doors = _clean_doors(req.doors, req.feature, req.cols, req.rows)

    def change(doc: ApartmentDoc) -> None:
        doc.cols, doc.rows = req.cols, req.rows
        doc.surface, doc.feature, doc.labels = req.surface, req.feature, labels
        doc.doors = doors
        # A shrink must not strand a piece off the plan, in any layout.
        for layout in doc.layouts:
            layout.placements = [
                p
                for p in layout.placements
                if _centre_inside(doc, _piece(doc, p.furniture_id), p.x_cm, p.y_cm)
            ]

    return _mutate_plan(username, apartment_id, req.base_rev, change)


_PAINT = set(COLOUR_CHARS.values())
_COLOUR_OF = {char: colour for colour, char in COLOUR_CHARS.items()}


def _trim_mask(cells: list[str]) -> list[str]:
    rows = [r for r in range(len(cells)) if cells[r].strip(EMPTY_SQUARE)]
    cols = [c for c in range(len(cells[0])) if any(row[c] != EMPTY_SQUARE for row in cells)]
    return [row[cols[0] : cols[-1] + 1] for row in cells[rows[0] : rows[-1] + 1]]


def _main_colour(cells: list[str]) -> Colour:
    """The most painted colour; a tie goes to the one painted first, reading row by row."""
    painted = [ch for row in cells for ch in row if ch != EMPTY_SQUARE]
    return _COLOUR_OF[Counter(painted).most_common(1)[0][0]]


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
        # A client loaded before squares had colours still sends `#` masks.
        cells = upgrade_legacy_cells(draft.cells or [], draft.colour)
        if not cells or len(cells) > CUSTOM_MAX or len({len(r) for r in cells}) != 1:
            raise ValueError(f"{label}: a custom shape is up to {CUSTOM_MAX} equal rows")
        if len(cells[0]) > CUSTOM_MAX or set("".join(cells)) - _PAINT - {EMPTY_SQUARE}:
            raise ValueError(f"{label}: a custom shape is up to {CUSTOM_MAX} squares of colour")
        if not set("".join(cells)) & _PAINT:
            raise ValueError(f"{label}: paint at least one square")
        mask = _trim_mask(cells)
        return Furniture(
            id=piece_id,
            name=name,
            colour=_main_colour(mask),
            note=note,
            shape="custom",
            width_cm=len(mask[0]) * PIECE_CELL_CM,
            depth_cm=len(mask) * PIECE_CELL_CM,
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


def add_pieces(username: str, apartment_id: str, drafts: list[PieceDraft]) -> ApartmentView:
    """All or nothing: one bad piece refuses the whole batch."""
    pieces = [_clean_piece(d, _new_piece_id()) for d in drafts]

    def change(doc: ApartmentDoc) -> None:
        if len(doc.furniture) + len(pieces) > PIECES_MAX:
            raise ValueError(f"An apartment holds at most {PIECES_MAX} pieces")
        doc.furniture.extend(pieces)

    return _mutate_free(username, apartment_id, change)


def _index_of(doc: ApartmentDoc, piece_id: str) -> int:
    for i, piece in enumerate(doc.furniture):
        if piece.id == piece_id:
            return i
    raise FileNotFoundError("That piece is gone — someone deleted it")


def update_piece(
    username: str, apartment_id: str, piece_id: str, draft: PieceDraft
) -> ApartmentView:
    piece = _clean_piece(draft, piece_id)

    def change(doc: ApartmentDoc) -> None:
        doc.furniture[_index_of(doc, piece_id)] = piece

    return _mutate_free(username, apartment_id, change)


def delete_piece(username: str, apartment_id: str, piece_id: str) -> ApartmentView:
    """Removes the piece and its placement from every layout (FU-5)."""

    def change(doc: ApartmentDoc) -> None:
        del doc.furniture[_index_of(doc, piece_id)]
        for layout in doc.layouts:
            layout.placements = [p for p in layout.placements if p.furniture_id != piece_id]

    return _mutate_free(username, apartment_id, change)


def _clean_layout_name(name: str) -> str:
    name = name.strip()
    if not name or len(name) > LAYOUT_NAME_MAX:
        raise ValueError(f"A layout name needs 1–{LAYOUT_NAME_MAX} characters")
    return name


def _layout(doc: ApartmentDoc, layout_id: str) -> Layout:
    for layout in doc.layouts:
        if layout.id == layout_id:
            return layout
    raise FileNotFoundError("That layout is gone — someone deleted it")


def _piece(doc: ApartmentDoc, piece_id: str) -> Furniture:
    return doc.furniture[_index_of(doc, piece_id)]


def _check_room_for_layout(doc: ApartmentDoc) -> None:
    if len(doc.layouts) >= LAYOUTS_MAX:
        raise ValueError(f"An apartment holds at most {LAYOUTS_MAX} layouts")


def create_layout(username: str, apartment_id: str, name: str) -> ApartmentView:
    clean = _clean_layout_name(name)

    def change(doc: ApartmentDoc) -> None:
        _check_room_for_layout(doc)
        doc.layouts.append(Layout(id=f"l_{uuid.uuid4().hex}", name=clean))

    return _mutate_free(username, apartment_id, change)


def rename_layout(username: str, apartment_id: str, layout_id: str, name: str) -> ApartmentView:
    clean = _clean_layout_name(name)

    def change(doc: ApartmentDoc) -> None:
        _layout(doc, layout_id).name = clean

    return _mutate_free(username, apartment_id, change)


def duplicate_layout(username: str, apartment_id: str, layout_id: str) -> ApartmentView:
    def change(doc: ApartmentDoc) -> None:
        source = _layout(doc, layout_id)
        _check_room_for_layout(doc)
        doc.layouts.append(
            Layout(
                id=f"l_{uuid.uuid4().hex}",
                name=f"{source.name} copy"[:LAYOUT_NAME_MAX],
                placements=[p.model_copy() for p in source.placements],
            )
        )

    return _mutate_free(username, apartment_id, change)


def delete_layout(username: str, apartment_id: str, layout_id: str) -> ApartmentView:
    def change(doc: ApartmentDoc) -> None:
        layout = _layout(doc, layout_id)
        if len(doc.layouts) == 1:
            raise ValueError("Keep at least one layout")
        doc.layouts.remove(layout)

    return _mutate_free(username, apartment_id, change)


def _centre_inside(doc: ApartmentDoc, piece: Furniture, x_cm: int, y_cm: int) -> bool:
    """Rotation turns a piece about its centre, so the unrotated size finds it."""
    cx = x_cm + piece.width_cm / 2
    cy = y_cm + piece.depth_cm / 2
    return 0 <= cx <= doc.cols * CELL_CM and 0 <= cy <= doc.rows * CELL_CM


def place_piece(
    username: str, apartment_id: str, layout_id: str, piece_id: str, req: PlacementRequest
) -> ApartmentView:
    """Places or moves a piece: a piece appears at most once per layout (LA-2)."""

    def change(doc: ApartmentDoc) -> None:
        layout = _layout(doc, layout_id)
        piece = _piece(doc, piece_id)
        if not _centre_inside(doc, piece, req.x_cm, req.y_cm):
            raise ValueError("Keep the piece on the plan")
        placement = Placement(
            furniture_id=piece_id, x_cm=req.x_cm, y_cm=req.y_cm, rotation=req.rotation
        )
        others = [p for p in layout.placements if p.furniture_id != piece_id]
        layout.placements = [*others, placement]

    return _mutate_free(username, apartment_id, change)


def remove_placement(
    username: str, apartment_id: str, layout_id: str, piece_id: str
) -> ApartmentView:
    """Back to the tray; a piece that's already there is not an error."""

    def change(doc: ApartmentDoc) -> None:
        layout = _layout(doc, layout_id)
        layout.placements = [p for p in layout.placements if p.furniture_id != piece_id]

    return _mutate_free(username, apartment_id, change)


def add_member(caller: str, apartment_id: str, username: str) -> ApartmentView:
    """Give `username` this apartment too; their other apartments are untouched (SH-1)."""
    username = username.strip()
    if username == caller:
        raise ValueError("You already share this apartment")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")
    with repo.membership_lock():
        members = repo.read_memberships()
        if apartment_id not in members.get(caller, []):
            raise FileNotFoundError("No such apartment")
        if repo.read_apartment(apartment_id).owner != caller:
            raise PermissionError("Only the apartment's owner can add people")
        if apartment_id in members.get(username, []):
            raise ValueError(f"{username} already shares this apartment")
        _check_room_for(members, username)
        members.setdefault(username, []).append(apartment_id)
        repo.write_memberships(members)
    return get_apartment(caller, apartment_id)


def _drop_member(members: dict[str, list[str]], username: str, apartment_id: str) -> None:
    """Call under the membership lock."""
    members[username].remove(apartment_id)
    repo.write_memberships({u: apts for u, apts in members.items() if apts})


def remove_member(caller: str, apartment_id: str, username: str) -> ApartmentView:
    """The owner removes someone else."""
    with repo.membership_lock():
        members = repo.read_memberships()
        if apartment_id not in members.get(caller, []):
            raise FileNotFoundError("No such apartment")
        if apartment_id not in members.get(username, []):
            raise FileNotFoundError(f"{username} doesn't share this apartment")
        owner = repo.read_apartment(apartment_id).owner
        if caller != owner:
            raise PermissionError("Only the apartment's owner can remove other people")
        if username == owner:
            raise ValueError("The owner can't leave — delete the apartment instead")
        _drop_member(members, username, apartment_id)
    return get_apartment(caller, apartment_id)


def leave_apartment(username: str, apartment_id: str) -> list[ApartmentSummary]:
    """A member leaves; returns where they can go next (never empty)."""
    with repo.membership_lock():
        members = repo.read_memberships()
        if apartment_id not in members.get(username, []):
            raise FileNotFoundError("No such apartment")
        if repo.read_apartment(apartment_id).owner == username:
            raise ValueError("The owner can't leave — delete the apartment instead")
        _drop_member(members, username, apartment_id)
    return list_apartments(username)
