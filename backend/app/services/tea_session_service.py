"""Business logic for Gongfu Session Timer sessions.

The phone owns a live session and sends it whole after every steep; this module
only ever replaces the stored copy. Finalising is the one transition with side
effects — it deducts the leaf used from the tea — so it happens inside the same
`doc_transaction` that marks the session finalised, and a finalised session is
frozen so a retried finish can never deduct twice.

Raises `FileNotFoundError`, `SessionFinalisedError`, `PermissionError` (another
member's session), `ValueError` (a vessel it can't be brewed in, a Journal edit it
can't take); the router translates.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, TeaDoc
from app.schemas.tea_session import JournalEdit, JournalEntry, TeaSession, TeaSessionWrite
from app.schemas.teaware import BREWING_TYPES
from app.services import tea_cabinet_service as cabinets
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service

# The phone mints ids; they also name photo files, so nothing that could glob or clash with a
# tea's `t-…` or a pot's `w-…` photo gets in.
_SESSION_ID = re.compile(r"s-[A-Za-z0-9-]+")


class SessionFinalisedError(Exception):
    """A finalised session can no longer be changed or discarded."""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _tea_position(doc: TeaDoc, tea_id: str) -> int:
    for position, tea in enumerate(doc.teas):
        if tea.id == tea_id:
            return position
    raise FileNotFoundError(f"No tea with id {tea_id!r}")


def _session_position(doc: TeaDoc, session_id: str) -> int | None:
    for position, session in enumerate(doc.sessions):
        if session.id == session_id:
            return position
    return None


def _check_brewer(session: TeaSession, username: str) -> None:
    if session.brewed_by != username:
        raise PermissionError(f"That session belongs to {session.brewed_by}")


def _vessel_volume(doc: TeaDoc, teaware_id: str | None) -> int | None:
    """The volume to record for `teaware_id`, refusing a vessel nobody can brew in.

    `ValueError`, not `FileNotFoundError`: the timer reads a 404 as "your tea is gone".
    """
    if teaware_id is None:
        return None
    item = next((w for w in doc.teaware if w.id == teaware_id), None)
    if item is None:
        raise ValueError("That vessel is no longer in the cabinet")
    if item.type not in BREWING_TYPES:
        raise ValueError(f"A {item.type} isn't something you brew in")
    if item.retired_at is not None:
        raise ValueError(f"{item.name} is retired")
    return item.volume_ml


def _adjust_grams(doc: TeaDoc, session: TeaSession, sign: int, stamp: str) -> None:
    """Take (`sign=-1`) or give back (`sign=+1`) the leaf `session` used from its cabinet tea.

    Never below 0; a give-back never lifts the tea above what was bought (or above what it
    already holds, if someone typed in more). An away tea, no grams, or a tea since removed
    changes nothing.
    """
    if session.tea_id is None or session.leaf_grams is None:
        return
    position = next((i for i, tea in enumerate(doc.teas) if tea.id == session.tea_id), None)
    if position is None:
        return
    tea = doc.teas[position]
    grams = max(0.0, tea.grams_remaining + sign * session.leaf_grams)
    if sign > 0 and tea.grams_purchased is not None:
        grams = min(grams, max(tea.grams_purchased, tea.grams_remaining))
    doc.teas[position] = tea.model_copy(update={"grams_remaining": grams, "updated_at": stamp})


def upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession:
    """Store `req` as session `session_id`, finalising it if its status says so.

    A journal-only entry (`timed=False`) arrives already finalised, in one call.
    """
    if not _SESSION_ID.fullmatch(session_id):
        raise ValueError(f"Not a session id: {session_id!r}")
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        if req.tea_id is not None:
            _tea_position(doc, req.tea_id)
        existing = _session_position(doc, session_id)
        image_url = None
        if existing is not None:
            _check_brewer(doc.sessions[existing], username)
            if doc.sessions[existing].status == "finalised":
                raise SessionFinalisedError("This session is already finished")
            image_url = doc.sessions[existing].image_url
        vessel_volume_ml = _vessel_volume(doc, req.teaware_id)

        stamp = _now_iso()
        infusions = req.infusions
        finished_at = None
        if req.status == "finalised":
            # The phone always carries one pending steep; a finished session keeps
            # only what was actually brewed, renumbered so numbering stays 1..N.
            brewed = [i for i in req.infusions if i.actual_seconds is not None]
            infusions = [i.model_copy(update={"number": n}) for n, i in enumerate(brewed, 1)]
            finished_at = stamp

        session = TeaSession(
            **req.model_dump(exclude={"infusions"}),
            infusions=infusions,
            id=session_id,
            brewed_by=username,
            vessel_volume_ml=vessel_volume_ml,
            image_url=image_url,
            updated_at=stamp,
            finished_at=finished_at,
        )
        if req.status == "finalised":
            _adjust_grams(doc, session, -1, stamp)
        if existing is None:
            doc.sessions.append(session)
        else:
            doc.sessions[existing] = session
        return session


def discard(username: str, session_id: str) -> None:
    """Remove an in-progress session and its photo. Nothing it recorded touches the tea."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _session_position(doc, session_id)
        if position is None:
            raise FileNotFoundError(f"No session with id {session_id!r}")
        _check_brewer(doc.sessions[position], username)
        if doc.sessions[position].status == "finalised":
            raise SessionFinalisedError("A finished session cannot be discarded")
        del doc.sessions[position]
    # After the write commits, so a failed write never loses the photo.
    repo.delete_image(cabinet_id, session_id)


def list_in_progress(username: str) -> list[TeaSession]:
    """The caller's own live sessions — never another member's timer."""
    live = [
        s
        for s in cabinets.read_doc_for(username).sessions
        if s.status == "in_progress" and s.brewed_by == username
    ]
    return sorted(live, key=lambda s: s.updated_at, reverse=True)


def list_for_tea(username: str, tea_id: str) -> list[TeaSession]:
    doc = cabinets.read_doc_for(username)
    _tea_position(doc, tea_id)
    return newest_first(s for s in doc.sessions if s.tea_id == tea_id and s.status == "finalised")


def _own_session(doc: TeaDoc, session_id: str, username: str) -> int:
    position = _session_position(doc, session_id)
    if position is None:
        raise FileNotFoundError(f"No session with id {session_id!r}")
    _check_brewer(doc.sessions[position], username)
    return position


def save_image(username: str, session_id: str, content: bytes, content_type: str) -> TeaSession:
    """Store the sitting's table photo and point `image_url` at its served route."""
    extension = tea_service.image_extension(content, content_type)
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _own_session(doc, session_id, username)
        repo.save_image(cabinet_id, session_id, content, extension)
        updated = doc.sessions[position].model_copy(
            update={
                "image_url": tea_service.served_image_url(
                    f"/api/tea/sessions/{session_id}/image", content
                ),
                "updated_at": _now_iso(),
            }
        )
        doc.sessions[position] = updated
        return updated


def delete_image(username: str, session_id: str) -> TeaSession:
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _own_session(doc, session_id, username)
        repo.delete_image(cabinet_id, session_id)
        updated = doc.sessions[position].model_copy(
            update={"image_url": None, "updated_at": _now_iso()}
        )
        doc.sessions[position] = updated
        return updated


def image_path(username: str, session_id: str) -> Path:
    """The stored photo of a session any member can see. 404s cover no session and no photo."""
    cabinet_id = cabinets.resolve(username)
    if cabinet_id is None or not any(
        s.id == session_id for s in repo.read_doc(cabinet_id).sessions
    ):
        raise FileNotFoundError(f"No session with id {session_id!r}")
    path = repo.find_image(cabinet_id, session_id)
    if path is None:
        raise FileNotFoundError(f"No image for session {session_id!r}")
    return path


_JOURNAL_ONLY_FIELDS = {"started_at", "tea_id", "away_tea_name", "away_class_id"}
_TEA_FIELDS = {"tea_id", "away_tea_name", "away_class_id"}


def _finished_position(doc: TeaDoc, session_id: str, username: str) -> int:
    position = _own_session(doc, session_id, username)
    if doc.sessions[position].status != "finalised":
        raise ValueError("That session is still brewing — finish it on the timer first")
    return position


def _entry(doc: TeaDoc, session: TeaSession, index: dict[str, CatalogueNode]) -> JournalEntry:
    tea = next((t for t in doc.teas if t.id == session.tea_id), None) if session.tea_id else None
    if tea is not None:
        name = tea.name
        class_id = catalogue.resolve_class(index, tea.catalogue_node_id)
        image = tea.image_url
    else:
        name = session.away_tea_name or "a removed tea"
        class_id = session.away_class_id or "other"
        image = None
    return JournalEntry(
        **session.model_dump(), tea_name=name, class_id=class_id, tea_image_url=image
    )


def _moment(iso: str) -> datetime:
    """`started_at` as an aware moment; a string the phone wrote oddly sorts last, not 500s."""
    try:
        moment = datetime.fromisoformat(iso)
    except ValueError:
        return datetime.min.replace(tzinfo=UTC)
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def newest_first(sessions: Iterable[TeaSession]) -> list[TeaSession]:
    """By when each sitting took place — a back-dated journal-only entry by its day, not by
    when it was typed in."""
    return sorted(
        sessions, key=lambda s: (_moment(s.started_at), s.finished_at or ""), reverse=True
    )


def list_journal(username: str) -> list[JournalEntry]:
    """Every finished session in the cabinet, any member's, newest sitting first."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    doc = cabinets.read_doc_for(username)
    done = newest_first(s for s in doc.sessions if s.status == "finalised")
    return [_entry(doc, s, index) for s in done]


def edit_journal(username: str, session_id: str, req: JournalEdit) -> JournalEntry:
    """Apply a Journal edit to a finished session, moving grams only if the leaf changed."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        position = _finished_position(doc, session_id, username)
        old = doc.sessions[position]
        moved = req.model_fields_set & _JOURNAL_ONLY_FIELDS
        if old.timed and moved:
            raise ValueError("Only a journal-only entry can change its tea or date")

        stamp = _now_iso()
        update: dict[str, object] = {
            "cha_xi": req.cha_xi,
            "tasting": req.tasting,
            "rating": req.rating,
            "leaf_grams": req.leaf_grams,
            "water_temp_c": req.water_temp_c,
            "teaware_id": req.teaware_id,
            "updated_at": stamp,
        }
        # An unchanged vessel keeps its recorded volume, even if the pot has since retired.
        if req.teaware_id != old.teaware_id:
            update["vessel_volume_ml"] = _vessel_volume(doc, req.teaware_id)
        if "started_at" in moved and req.started_at:
            update["started_at"] = req.started_at
        if moved & _TEA_FIELDS:
            update["tea_id"] = req.tea_id
            update["away_tea_name"] = req.away_tea_name.strip()
            update["away_class_id"] = req.away_class_id
        new = TeaSession.model_validate({**old.model_dump(), **update})
        if new.tea_id is not None:
            _tea_position(doc, new.tea_id)

        # Only a real change moves grams: a give-back-then-take of the same leaf could drift
        # against the clamps.
        if (new.tea_id, new.leaf_grams) != (old.tea_id, old.leaf_grams):
            _adjust_grams(doc, old, +1, stamp)
            _adjust_grams(doc, new, -1, stamp)
        doc.sessions[position] = new
        return _entry(doc, new, index)


def delete_journal(username: str, session_id: str) -> None:
    """Delete a finished sitting, giving its leaf back to its tea. Not the timer's discard."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _finished_position(doc, session_id, username)
        _adjust_grams(doc, doc.sessions[position], +1, _now_iso())
        del doc.sessions[position]
    repo.delete_image(cabinet_id, session_id)
