"""Business logic for the Hotaru vocabulary library.

Calls repositories, raises stdlib exceptions. No HTTPException here.
"""

from __future__ import annotations

from uuid import uuid4

from app.repositories import vocab_repo
from app.schemas.hotaru import Visibility, Word


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


def create_word(
    user: str,
    reading: str,
    meaning: str,
    kanji: str | None = None,
    romaji: str = "",
    pos: str = "",
    source: str | None = None,
    lesson: str = "",
    visibility: Visibility = "shared",
) -> Word:
    """Create a user-added word and persist it.

    The storage file is chosen by `visibility` (shared → the shared file; private →
    the active user's private file), independent of the `source` tag — so a Custom
    word filed into a textbook lesson still respects privacy.

    Raises:
        ValueError: if reading or meaning is blank, or an explicit `source` is not a
        known textbook source.
    """
    reading = reading.strip()
    meaning = meaning.strip()
    if not reading:
        raise ValueError("Reading is required.")
    if not meaning:
        raise ValueError("Meaning is required.")

    # A blank source means "a Custom word" → owned by the active user. An explicit
    # source is only allowed when filing into a known textbook (else it could collide
    # with the frontend's Custom sentinel or spoof another user's id).
    provided_source = (source or "").strip()
    if provided_source and provided_source not in vocab_repo.textbook_sources():
        raise ValueError(f"Unknown source {provided_source!r}.")
    source = provided_source or user

    kanji = (kanji or "").strip() or None
    caps = ["r2m", "m2r"] + (["k2r"] if kanji else [])

    word = Word(
        id=f"{source}-{uuid4().hex[:8]}",
        source=source,
        reading=reading,
        kanji=kanji,
        romaji=romaji.strip(),
        meaning=meaning,
        pos=pos.strip(),
        lesson=lesson.strip(),
        visibility=visibility,
        drill_caps=caps,
    )

    if visibility == "private":
        vocab_repo.write_private(user, vocab_repo.read_private(user) + [word])
    else:
        vocab_repo.write_shared(vocab_repo.read_shared() + [word])
    return word
