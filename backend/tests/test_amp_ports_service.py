"""Unit tests for amp_ports_service. Each test gets its own empty data_dir."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import amp_repo
from app.services import amp_ports_service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_public_ip_none_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service.settings, "amp_public_ip", "")
    assert amp_ports_service.public_ip() is None


def test_public_ip_returned_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service.settings, "amp_public_ip", "203.0.113.5")
    assert amp_ports_service.public_ip() == "203.0.113.5"


def test_set_ports_persists_and_returns() -> None:
    assert amp_ports_service.set_ports({"i1": 27015}) == {"i1": 27015}
    assert amp_repo.read_ports() == {"i1": 27015}


@pytest.mark.parametrize("bad", [0, 65536, -1])
def test_set_ports_rejects_out_of_range(bad: int) -> None:
    with pytest.raises(ValueError):
        amp_ports_service.set_ports({"i1": bad})


def test_set_ports_rejects_non_int() -> None:
    with pytest.raises(ValueError):
        amp_ports_service.set_ports({"i1": True})  # bool is not a valid port


def test_reconcile_prunes_stale_ids() -> None:
    amp_repo.write_ports({"i1": 27015, "gone": 25565})
    result = amp_ports_service.reconcile(["i1"])
    assert result == {"i1": 27015}
    assert amp_repo.read_ports() == {"i1": 27015}


def test_reconcile_keeps_live_and_does_not_rewrite_when_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    amp_repo.write_ports({"i1": 27015})
    writes = {"n": 0}
    real_write = amp_repo.write_ports
    monkeypatch.setattr(
        amp_repo,
        "write_ports",
        lambda ports: (writes.__setitem__("n", writes["n"] + 1), real_write(ports))[1],
    )
    result = amp_ports_service.reconcile(["i1", "i2"])
    assert result == {"i1": 27015}
    assert writes["n"] == 0  # nothing stale → no write
