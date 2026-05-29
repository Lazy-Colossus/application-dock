"""Filesystem persistence coverage for app.repositories.session_repo."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import settings
from app.repositories import session_repo
from app.schemas.session import SessionData


@pytest.fixture(autouse=True)
def isolate_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point settings.data_dir at a fresh tmp directory for each test."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    return tmp_path


def _session(
    label: str = "2026-05-28", status: str = "in_progress", **overrides: Any
) -> SessionData:
    payload: dict[str, Any] = {
        "label": label,
        "name": label,
        "date": label[:10] if label[:10].count("-") == 2 else "2026-05-28",
        "created": "2026-05-28T14:00:00Z",
        "status": status,
        "archers": ["Alice", "Bob"],
        "targets": [],
    }
    payload.update(overrides)
    return SessionData(**payload)


# ─── _atomic_write_json ──────────────────────────────────────────────────────


def test_atomic_write_creates_file_and_removes_tmp(isolate_data_dir: Path) -> None:
    path = isolate_data_dir / "test.json"
    session_repo._atomic_write_json(path, {"hello": "world"})
    assert path.exists()
    assert json.loads(path.read_text()) == {"hello": "world"}
    # No .tmp leftover
    assert not (isolate_data_dir / "test.json.tmp").exists()


def test_atomic_write_replaces_existing_file(isolate_data_dir: Path) -> None:
    path = isolate_data_dir / "test.json"
    session_repo._atomic_write_json(path, {"v": 1})
    session_repo._atomic_write_json(path, {"v": 2})
    assert json.loads(path.read_text()) == {"v": 2}


# ─── write_session / read_session ────────────────────────────────────────────


def test_write_session_to_arbitrary_path(isolate_data_dir: Path) -> None:
    session = _session(label="2026-05-28", status="finalised")
    target_path = isolate_data_dir / "2026-05-28.json"
    session_repo.write_session(target_path, session)

    assert target_path.exists()
    written = json.loads(target_path.read_text())
    assert written["label"] == "2026-05-28"
    assert written["status"] == "finalised"
    assert written["archers"] == ["Alice", "Bob"]


def test_read_session_round_trips_a_written_session(isolate_data_dir: Path) -> None:
    original = _session(
        label="2026-05-28",
        status="finalised",
        targets=[
            {"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 0]}},
        ],
    )
    session_repo.write_session(isolate_data_dir / "2026-05-28.json", original)
    loaded = session_repo.read_session("2026-05-28")
    assert loaded == original


def test_read_session_raises_when_missing() -> None:
    with pytest.raises(FileNotFoundError):
        session_repo.read_session("2099-01-01")


def test_read_session_raises_on_malformed_json(isolate_data_dir: Path) -> None:
    (isolate_data_dir / "bad.json").write_text("{not json")
    with pytest.raises(json.JSONDecodeError):
        session_repo.read_session("bad")


def test_read_session_raises_on_schema_mismatch(isolate_data_dir: Path) -> None:
    (isolate_data_dir / "wrong.json").write_text(json.dumps({"label": "x"}))
    with pytest.raises(ValueError):
        session_repo.read_session("wrong")


# ─── list_sessions ───────────────────────────────────────────────────────────


def test_list_sessions_returns_empty_when_no_files() -> None:
    assert session_repo.list_sessions() == []


def test_list_sessions_excludes_in_progress(isolate_data_dir: Path) -> None:
    session_repo.write_in_progress(_session(label="active"))
    session_repo.write_session(
        isolate_data_dir / "2026-05-28.json",
        _session(label="2026-05-28", status="finalised"),
    )
    sessions = session_repo.list_sessions()
    assert len(sessions) == 1
    assert sessions[0].label == "2026-05-28"


def test_list_sessions_excludes_any_underscore_prefixed_file(isolate_data_dir: Path) -> None:
    (isolate_data_dir / "_other.json").write_text(json.dumps({"junk": True}))
    session_repo.write_session(
        isolate_data_dir / "2026-05-28.json",
        _session(label="2026-05-28", status="finalised"),
    )
    sessions = session_repo.list_sessions()
    assert [s.label for s in sessions] == ["2026-05-28"]


def test_list_sessions_sorts_newest_first(isolate_data_dir: Path) -> None:
    for label in ["2026-05-20", "2026-05-28", "2026-05-21-2", "2026-05-21"]:
        session_repo.write_session(
            isolate_data_dir / f"{label}.json",
            _session(label=label, status="finalised"),
        )
    sessions = session_repo.list_sessions()
    assert [s.label for s in sessions] == [
        "2026-05-28",
        "2026-05-21-2",
        "2026-05-21",
        "2026-05-20",
    ]


def test_list_sessions_skips_malformed_session_files(
    isolate_data_dir: Path, caplog: pytest.LogCaptureFixture
) -> None:
    # File matches the session-label shape but its contents are corrupt.
    (isolate_data_dir / "2026-05-28-99.json").write_text("{not json")
    session_repo.write_session(
        isolate_data_dir / "2026-05-28.json",
        _session(label="2026-05-28", status="finalised"),
    )
    sessions = session_repo.list_sessions()
    assert [s.label for s in sessions] == ["2026-05-28"]
    assert any("2026-05-28-99.json" in record.message for record in caplog.records)


def test_list_sessions_silently_ignores_non_session_named_files(
    isolate_data_dir: Path, caplog: pytest.LogCaptureFixture
) -> None:
    # File doesn't match the session-label shape — not a session at all.
    (isolate_data_dir / "random.json").write_text("{not json")
    sessions = session_repo.list_sessions()
    assert sessions == []
    # No warning — we don't expect every stray .json to be a session.
    assert not any("random.json" in record.message for record in caplog.records)


# ─── in-progress helpers ─────────────────────────────────────────────────────


def test_write_in_progress_creates_ip_prefixed_file(isolate_data_dir: Path) -> None:
    session_repo.write_in_progress(_session(label="2026-05-29"))
    assert (isolate_data_dir / "_ip_2026-05-29.json").exists()


def test_write_in_progress_coerces_status(isolate_data_dir: Path) -> None:
    # Even if caller passes status="finalised", the file is written as in_progress.
    session_repo.write_in_progress(_session(label="2026-05-29", status="finalised"))
    raw = json.loads((isolate_data_dir / "_ip_2026-05-29.json").read_text())
    assert raw["status"] == "in_progress"


def test_read_in_progress_returns_none_when_absent() -> None:
    assert session_repo.read_in_progress("2026-05-29") is None


def test_read_in_progress_returns_session_when_present() -> None:
    original = _session(label="2026-05-29")
    session_repo.write_in_progress(original)
    result = session_repo.read_in_progress("2026-05-29")
    assert result is not None
    assert result.label == "2026-05-29"
    assert result.status == "in_progress"


def test_delete_in_progress_removes_file(isolate_data_dir: Path) -> None:
    session_repo.write_in_progress(_session(label="2026-05-29"))
    assert (isolate_data_dir / "_ip_2026-05-29.json").exists()
    session_repo.delete_in_progress("2026-05-29")
    assert not (isolate_data_dir / "_ip_2026-05-29.json").exists()


def test_delete_in_progress_is_idempotent() -> None:
    # No file exists — must not raise.
    session_repo.delete_in_progress("2026-05-29")
    session_repo.delete_in_progress("2026-05-29")


# ─── multiple concurrent in-progress sessions (Story 6.1) ───────────────────


def test_list_in_progress_returns_all_newest_first(isolate_data_dir: Path) -> None:
    for label in ["2026-05-20", "2026-05-29", "2026-05-21-2", "2026-05-21"]:
        session_repo.write_in_progress(_session(label=label, date=label[:10]))
    labels = [s.label for s in session_repo.list_in_progress()]
    assert labels == ["2026-05-29", "2026-05-21-2", "2026-05-21", "2026-05-20"]


def test_list_in_progress_empty_when_none() -> None:
    assert session_repo.list_in_progress() == []


def test_in_progress_labels_helper(isolate_data_dir: Path) -> None:
    session_repo.write_in_progress(_session(label="2026-05-29"))
    session_repo.write_in_progress(_session(label="2026-05-29-2"))
    assert session_repo.list_in_progress_labels() == {"2026-05-29", "2026-05-29-2"}


def test_finalised_files_not_listed_as_in_progress(isolate_data_dir: Path) -> None:
    session_repo.write_session(
        isolate_data_dir / "2026-05-29.json",
        _session(label="2026-05-29", status="finalised"),
    )
    assert session_repo.list_in_progress() == []
    assert session_repo.list_session_labels() == {"2026-05-29"}


def test_legacy_in_progress_file_is_migrated(isolate_data_dir: Path) -> None:
    # Pre-Story-6.1 file without name/date.
    legacy = {
        "label": "2026-05-29",
        "created": "2026-05-29T10:00:00Z",
        "status": "in_progress",
        "archers": ["Alice", "Bob"],
        "targets": [],
    }
    (isolate_data_dir / "_in_progress.json").write_text(json.dumps(legacy))
    result = session_repo.read_in_progress("2026-05-29")
    assert result is not None
    assert result.name == "2026-05-29"
    assert result.date == "2026-05-29"
    assert (isolate_data_dir / "_ip_2026-05-29.json").exists()
    assert not (isolate_data_dir / "_in_progress.json").exists()


# ─── atomicity (best effort) ─────────────────────────────────────────────────


def test_failed_replace_preserves_previous_file(
    isolate_data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If os.replace raises mid-write, the previous file content survives."""
    path = isolate_data_dir / "test.json"
    session_repo._atomic_write_json(path, {"v": 1})

    import os as _os

    real_replace = _os.replace

    def failing_replace(*args: Any, **kwargs: Any) -> None:
        raise OSError("simulated disk failure")

    monkeypatch.setattr("app.repositories.session_repo.os.replace", failing_replace)
    with pytest.raises(OSError, match="simulated disk failure"):
        session_repo._atomic_write_json(path, {"v": 2})

    monkeypatch.setattr("app.repositories.session_repo.os.replace", real_replace)
    # Original v=1 still there.
    assert json.loads(path.read_text()) == {"v": 1}
