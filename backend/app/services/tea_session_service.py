"""Business logic for Gongfu Session Timer sessions.

The phone owns a live session and sends it whole after every steep; this module
only ever replaces the stored copy. Finalising is the one transition with side
effects — it deducts the leaf used from the tea — so it happens inside the same
`doc_transaction` that marks the session finalised, and a finalised session is
frozen so a retried finish can never deduct twice.

Raises `FileNotFoundError`, `SessionFinalisedError`; the router translates.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import TeaSession, TeaSessionWrite


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


def upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession:
    """Store `req` as session `session_id`, finalising it if its status says so."""
    with repo.doc_transaction(username) as doc:
        tea_position = _tea_position(doc, req.tea_id)
        existing = _session_position(doc, session_id)
        if existing is not None and doc.sessions[existing].status == "finalised":
            raise SessionFinalisedError("This session is already finished")

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
    with repo.doc_transaction(username) as doc:
        position = _session_position(doc, session_id)
        if position is None:
            raise FileNotFoundError(f"No session with id {session_id!r}")
        if doc.sessions[position].status == "finalised":
            raise SessionFinalisedError("A finished session cannot be discarded")
        del doc.sessions[position]


def list_in_progress(username: str) -> list[TeaSession]:
    live = [s for s in repo.read_doc(username).sessions if s.status == "in_progress"]
    return sorted(live, key=lambda s: s.updated_at, reverse=True)


def list_for_tea(username: str, tea_id: str) -> list[TeaSession]:
    doc = repo.read_doc(username)
    _tea_position(doc, tea_id)
    done = [s for s in doc.sessions if s.tea_id == tea_id and s.status == "finalised"]
    return sorted(done, key=lambda s: s.finished_at or "", reverse=True)
