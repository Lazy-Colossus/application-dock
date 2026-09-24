"""Interleaved writes to one cabinet must not lose data (NFR-2)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_concurrent_creates_all_survive() -> None:
    def add(n: int) -> None:
        service.create_tea(
            "alice",
            TeaWriteRequest(name=f"Tea {n}", catalogue_node_id="oolong", grams_purchased=50),
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(add, range(40)))

    assert len(service.list_teas("alice")) == 40


def test_a_tea_and_a_node_written_concurrently_both_survive() -> None:
    """They share one document, so this is the case the single file must handle."""

    def add_tea(n: int) -> None:
        service.create_tea("alice", TeaWriteRequest(name=f"Tea {n}", catalogue_node_id="oolong"))

    def add_node(n: int) -> None:
        catalogue.create_node("alice", CreateNodeRequest(parent_id="oolong", name=f"Kind {n}"))

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(add_tea, n) for n in range(20)]
        futures += [pool.submit(add_node, n) for n in range(20)]
        for future in futures:
            future.result()

    doc = repo.read_doc("alice")
    assert len(doc.teas) == 20
    assert len(doc.catalogue_nodes) == 20
