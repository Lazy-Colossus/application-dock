"""Business logic for Gongfu Session Timer sessions.

The phone owns a live session and sends it whole after every steep; this module
only ever replaces the stored copy. Finalising is the one transition with side
effects — it deducts the leaf used from the tea — so it happens inside the same
`doc_transaction` that marks the session finalised, and a finalised session is
frozen so a retried finish can never deduct twice.

Raises `FileNotFoundError`, `SessionFinalisedError`, `PermissionError` (another
member's session), `ValueError` (a vessel it can't be brewed in); the router translates.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import TeaSession, TeaSessionWrite
from app.schemas.teaware import BREWING_TYPES
from app.services import tea_cabinet_service as cabinets


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


def upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession:
    """Store `req` as session `session_id`, finalising it if its status says so."""
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        tea_position = _tea_position(doc, req.tea_id)
        existing = _session_position(doc, session_id)
        if existing is not None:
            _check_brewer(doc.sessions[existing], username)
            if doc.sessions[existing].status == "finalised":
                raise SessionFinalisedError("This session is already finished")
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
            if req.leaf_grams is not None:
                tea = doc.teas[tea_position]
                doc.teas[tea_position] = tea.model_copy(
                    update={
                        "grams_remaining": max(0.0, tea.grams_remaining - req.leaf_grams),
                        "updated_at": stamp,
                    }
                )

        session = TeaSession(
            **req.model_dump(exclude={"infusions"}),
            infusions=infusions,
            id=session_id,
            brewed_by=username,
            vessel_volume_ml=vessel_volume_ml,
            updated_at=stamp,
            finished_at=finished_at,
        )
        if existing is None:
            doc.sessions.append(session)
        else:
            doc.sessions[existing] = session
        return session


def discard(username: str, session_id: str) -> None:
    """Remove an in-progress session. Nothing it recorded touches the tea."""
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        position = _session_position(doc, session_id)
        if position is None:
            raise FileNotFoundError(f"No session with id {session_id!r}")
        _check_brewer(doc.sessions[position], username)
        if doc.sessions[position].status == "finalised":
            raise SessionFinalisedError("A finished session cannot be discarded")
        del doc.sessions[position]


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
