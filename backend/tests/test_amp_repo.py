"""Unit tests for amp_repo. settings.data_dir is a tmp dir (see conftest)."""

from __future__ import annotations

from app.repositories import amp_repo


def test_read_ports_missing_file_returns_empty() -> None:
    assert amp_repo.read_ports() == {}


def test_write_then_read_round_trips() -> None:
    amp_repo.write_ports({"i1": 27015, "i2": 25565})
    assert amp_repo.read_ports() == {"i1": 27015, "i2": 25565}


def test_read_coerces_values_to_int() -> None:
    # A hand-edited file may carry string ports; reads normalise to int.
    path = amp_repo._ports_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"i1": "27015"}', encoding="utf-8")
    assert amp_repo.read_ports() == {"i1": 27015}
