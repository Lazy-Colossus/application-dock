"""The fixed resource vocabulary and the always-complete grid."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.iss_vanguard import (
    RESOURCES,
    TIERS,
    ProjectWriteRequest,
    ShipDoc,
    StockAdjustRequest,
    empty_grid,
    is_empty_grid,
)


def test_vocabulary_is_fixed_and_ordered() -> None:
    assert RESOURCES == (
        "microorganisms",
        "alien_technologies",
        "minerals",
        "strange_flora",
        "living_specimens",
    )
    assert TIERS == ("basic", "rare", "very_rare")


def test_empty_grid_has_all_fifteen_cells_at_zero() -> None:
    grid = empty_grid()
    assert list(grid) == list(RESOURCES)
    assert all(list(row) == list(TIERS) for row in grid.values())
    assert is_empty_grid(grid)


def test_a_partial_cost_is_completed_with_zeros() -> None:
    req = ProjectWriteRequest(code="VB07", cost={"minerals": {"rare": 2}})
    assert req.cost["minerals"] == {"basic": 0, "rare": 2, "very_rare": 0}
    assert req.cost["microorganisms"] == {"basic": 0, "rare": 0, "very_rare": 0}
    assert not is_empty_grid(req.cost)


@pytest.mark.parametrize(
    "cost",
    [
        {"gold": {"basic": 1}},
        {"minerals": {"legendary": 1}},
        {"minerals": {"basic": -1}},
        {"minerals": {"basic": 1.5}},
    ],
)
def test_a_malformed_cost_is_rejected(cost: dict) -> None:
    with pytest.raises(ValidationError):
        ProjectWriteRequest(code="VB07", cost=cost)


def test_stock_delta_is_only_plus_or_minus_one() -> None:
    StockAdjustRequest(resource="minerals", tier="basic", delta=-1)
    with pytest.raises(ValidationError):
        StockAdjustRequest(resource="minerals", tier="basic", delta=2)


def test_a_new_ship_doc_starts_empty_at_rev_zero() -> None:
    doc = ShipDoc(id="s_" + "0" * 32, owner="ana")
    assert (doc.rev, doc.projects, is_empty_grid(doc.stock)) == (0, [], True)
