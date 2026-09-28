"""Taps from several phones at once must all land (NFR-a)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_concurrent_increments_on_one_cell_all_count() -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: service.adjust_stock("ana", "minerals", "basic", 1), range(50)))
    ship = service.get_ship("ana")
    assert ship.stock["minerals"]["basic"] == 50
    assert ship.rev == 50
    assert len(repo.read_memberships()) == 1
