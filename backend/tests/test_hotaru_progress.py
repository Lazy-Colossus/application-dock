from datetime import UTC, datetime

from app.core.config import settings
from app.repositories import progress_repo
from app.schemas.hotaru import ProgressEntry

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def test_fresh_user_has_empty_progress() -> None:
    assert progress_repo.read_progress("dani") == {}
    assert progress_repo.get_entry("dani", "w1") is None


def test_write_then_read_roundtrips() -> None:
    entries = {"w1": ProgressEntry(tier=2, points=4, last_reviewed_at=NOW)}
    progress_repo.write_progress("dani", entries)
    read = progress_repo.read_progress("dani")
    assert read == entries


def test_set_and_get_entry() -> None:
    e = ProgressEntry(tier=1, points=0, last_reviewed_at=NOW)
    progress_repo.set_entry("dani", "w1", e)
    assert progress_repo.get_entry("dani", "w1") == e
    # A second entry does not clobber the first (read-modify-write).
    e2 = ProgressEntry(tier=3, points=2, last_reviewed_at=NOW)
    progress_repo.set_entry("dani", "w2", e2)
    assert progress_repo.get_entry("dani", "w1") == e
    assert progress_repo.get_entry("dani", "w2") == e2


def test_progress_lives_at_the_per_user_path() -> None:
    progress_repo.set_entry("dani", "w1", ProgressEntry(tier=1))
    path = settings.data_dir / "hotaru" / "users" / "dani" / "progress.json"
    assert path.exists()
    assert "w1" in path.read_text(encoding="utf-8")


def test_progress_is_isolated_per_user() -> None:
    progress_repo.set_entry("dani", "w1", ProgressEntry(tier=2))
    # jake's progress is untouched — no file, empty read.
    assert progress_repo.read_progress("jake") == {}
    jake_path = settings.data_dir / "hotaru" / "users" / "jake" / "progress.json"
    assert not jake_path.exists()
