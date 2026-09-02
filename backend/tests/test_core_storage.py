"""Story 1.8 — the shared atomic writer used by every repository."""

import json
import threading

import pytest

from app.core.storage import atomic_write_json


def test_writes_json_and_creates_parent_dirs(tmp_path) -> None:
    path = tmp_path / "nested" / "deep" / "doc.json"
    atomic_write_json(path, {"a": 1})
    assert json.loads(path.read_text(encoding="utf-8")) == {"a": 1}


def test_preserves_non_ascii_unescaped(tmp_path) -> None:
    path = tmp_path / "doc.json"
    atomic_write_json(path, {"word": "蛍"})
    assert "蛍" in path.read_text(encoding="utf-8")


def test_replaces_an_existing_file(tmp_path) -> None:
    path = tmp_path / "doc.json"
    atomic_write_json(path, {"v": 1})
    atomic_write_json(path, {"v": 2})
    assert json.loads(path.read_text(encoding="utf-8")) == {"v": 2}


def test_leaves_no_temp_files_behind(tmp_path) -> None:
    path = tmp_path / "doc.json"
    atomic_write_json(path, [1, 2, 3])
    assert [p.name for p in tmp_path.iterdir()] == ["doc.json"]


def test_concurrent_writes_to_one_path_do_not_share_a_temp_file(tmp_path) -> None:
    """The old deterministic `path + '.tmp'` let one writer clobber the other's
    staged payload before either rename. Whichever write lands last must be a
    complete, valid document — never a mix of the two."""
    path = tmp_path / "doc.json"
    payloads = [{"writer": i, "data": [i] * 200} for i in range(8)]
    errors: list[BaseException] = []

    def write(payload: dict) -> None:
        try:
            atomic_write_json(path, payload)
        except BaseException as exc:  # pragma: no cover - surfaced by the assert
            errors.append(exc)

    threads = [threading.Thread(target=write, args=(p,)) for p in payloads]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert json.loads(path.read_text(encoding="utf-8")) in payloads
    assert [p.name for p in tmp_path.iterdir()] == ["doc.json"]


def test_failed_write_cleans_up_and_leaves_previous_file_intact(tmp_path) -> None:
    path = tmp_path / "doc.json"
    atomic_write_json(path, {"good": True})

    class Unserializable:
        pass

    with pytest.raises(TypeError):
        atomic_write_json(path, {"bad": Unserializable()})

    assert json.loads(path.read_text(encoding="utf-8")) == {"good": True}
    assert [p.name for p in tmp_path.iterdir()] == ["doc.json"]


def test_failed_replace_preserves_previous_file(tmp_path, monkeypatch) -> None:
    """A disk failure at the rename must not destroy what was already there."""
    path = tmp_path / "doc.json"
    atomic_write_json(path, {"v": 1})

    def failing_replace(*args, **kwargs):
        raise OSError("simulated disk failure")

    monkeypatch.setattr("app.core.storage.os.replace", failing_replace)
    with pytest.raises(OSError, match="simulated disk failure"):
        atomic_write_json(path, {"v": 2})
    monkeypatch.undo()

    assert json.loads(path.read_text(encoding="utf-8")) == {"v": 1}
    assert [p.name for p in tmp_path.iterdir()] == ["doc.json"]
