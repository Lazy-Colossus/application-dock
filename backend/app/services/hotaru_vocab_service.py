"""Business logic for the Hotaru vocabulary library.

Calls repositories, raises stdlib exceptions. No HTTPException here.
"""

from __future__ import annotations

from app.repositories import vocab_repo
from app.schemas.hotaru import Word


def list_words(lesson: str | None = None, user: str | None = None) -> list[Word]:
    """Assemble the Master Vocabulary List and optionally filter by lesson.

    Master = read-only seed + shared user-added words + (the active user's own
    private words, when `user` is given). Private words are read only from that
    user's own directory (path-as-privacy-boundary), so no visibility filtering
    is needed here.
    """
    words = vocab_repo.read_seed() + vocab_repo.read_shared()
    if user is not None:
        words += vocab_repo.read_private(user)
    if lesson is not None:
        words = [w for w in words if w.lesson == lesson]
    return words
