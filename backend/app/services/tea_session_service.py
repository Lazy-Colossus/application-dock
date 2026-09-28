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

from datetime import UTC, datetime
from pathlib import Path

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import TeaSession, TeaSessionWrite
from app.schemas.teaware import BREWING_TYPES
from app.services import tea_cabinet_service as cabinets
from app.services import tea_service


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
    done = [s for s in doc.sessions if s.tea_id == tea_id and s.status == "finalised"]
    return sorted(done, key=lambda s: s.finished_at or "", reverse=True)


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
                "image_url": f"/api/tea/sessions/{session_id}/image",
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
