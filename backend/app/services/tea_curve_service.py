"""The Brewing Curve: where a session's suggested steep times come from.

A chain of sources, most personal first — the caller's own best-rated past
session of the tea, then any member's, the tea's own brewing parameters, the
nearest Almanac entry up the catalogue tree, then a generic gongfu curve.
Steep times come from the first source that has any; leaf grams and water
temperature each fall through the chain on their own, so a tea with a steep
list but no temperature still gets the Almanac's temperature.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.repositories import almanac_repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import BrewingCurve, CurveSource, TeaSession
from app.services import tea_cabinet_service as cabinets
from app.services import tea_catalogue_service as catalogue

GENERIC_STEEPS: list[int] = [10, 15, 20, 25]


@dataclass(frozen=True)
class _Link:
    source: CurveSource
    label: str
    leaf_grams: float | None
    water_temp_c: int | None
    steep_seconds: list[int]


def _best_session(doc: TeaDoc, tea_id: str, brewed_by: str | None = None) -> TeaSession | None:
    rated = [
        s
        for s in doc.sessions
        if s.tea_id == tea_id
        and s.status == "finalised"
        and s.rating is not None
        and (brewed_by is None or s.brewed_by == brewed_by)
        and any(i.actual_seconds is not None for i in s.infusions)
    ]
    # Most recent wins a tie: technique drifts, and the curve should follow it.
    return max(rated, key=lambda s: (s.rating, s.finished_at or ""), default=None)


def _short_date(iso: str | None) -> str:
    if not iso:
        return ""
    moment = datetime.fromisoformat(iso)
    return f"{moment.day} {moment:%b}"


def curve_for(username: str, tea_id: str) -> BrewingCurve:
    doc = cabinets.read_doc_for(username)
    tea = next((t for t in doc.teas if t.id == tea_id), None)
    if tea is None:
        raise FileNotFoundError(f"No tea with id {tea_id!r}")

    links: list[_Link] = []

    # Your own taste first; a tea only your partner has brewed still starts from theirs.
    best = _best_session(doc, tea_id, username) or _best_session(doc, tea_id)
    if best is not None:
        whose = "your" if best.brewed_by == username else f"{best.brewed_by}'s"
        links.append(
            _Link(
                "best_session",
                f"from {whose} best session (★{best.rating}, {_short_date(best.finished_at)})",
                best.leaf_grams,
                best.water_temp_c,
                # A double-tapped 0 s steep must still suggest a target the next
                # snapshot can carry (targets are > 0).
                [max(1, i.actual_seconds) for i in best.infusions if i.actual_seconds is not None],
            )
        )

    if tea.brewing is not None:
        links.append(
            _Link(
                "tea",
                "tea default",
                tea.brewing.leaf_grams,
                tea.brewing.water_temp_c,
                tea.brewing.steep_seconds,
            )
        )

    index = catalogue.node_index(catalogue.merged_nodes(username))
    entries = {e.catalogue_node_id: e for e in almanac_repo.read_seed_entries()}
    for node in catalogue.ancestry(index, tea.catalogue_node_id):
        entry = entries.get(node.id)
        if entry is not None:
            links.append(
                _Link(
                    "almanac",
                    f"almanac: {node.name}",
                    entry.brewing.leaf_grams,
                    entry.brewing.water_temp_c,
                    entry.brewing.steep_seconds,
                )
            )

    links.append(_Link("generic", "generic gongfu", None, None, GENERIC_STEEPS))

    steeps = next(link for link in links if link.steep_seconds)
    return BrewingCurve(
        leaf_grams=next((link.leaf_grams for link in links if link.leaf_grams is not None), None),
        water_temp_c=next(
            (link.water_temp_c for link in links if link.water_temp_c is not None), None
        ),
        steep_seconds=list(steeps.steep_seconds),
        source=steeps.source,
        source_label=steeps.label,
    )
