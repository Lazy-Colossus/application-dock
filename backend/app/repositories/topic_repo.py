"""Topic persistence: the shared `topics.json` (many-to-many word grouping).

Layering: services call this; routers do not. Raises stdlib errors, never
HTTPException. The only filesystem code for topics.
"""

from __future__ import annotations

from app.core.config import settings
from app.repositories import _storage
from app.schemas.hotaru import Topic

_TOPICS_PATH = settings.data_dir / "hotaru" / "topics.json"


def read_topics() -> list[Topic]:
    rows = _storage.read_json(_TOPICS_PATH, default=[])
    return [Topic.model_validate(t) for t in rows]


def write_topics(topics: list[Topic]) -> None:
    _storage.atomic_write_json(_TOPICS_PATH, [t.model_dump(mode="json") for t in topics])


def find_topic(topic_id: str) -> Topic | None:
    for t in read_topics():
        if t.id == topic_id:
            return t
    return None


def add(topic: Topic) -> None:
    write_topics(read_topics() + [topic])


def replace(topic: Topic) -> None:
    """Persist `topic` in place of the existing one with the same id."""
    write_topics([topic if t.id == topic.id else t for t in read_topics()])
