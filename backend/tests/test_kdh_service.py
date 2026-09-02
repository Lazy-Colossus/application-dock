"""Story 1.3 — the guest rule and the colour palette."""

import pytest

from app.services import kdh_service as service

# ── who may administer (a denylist, not an allowlist) ────────────────────────


def test_the_default_guest_is_players(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "players")
    assert service.is_admin("players") is False


@pytest.mark.parametrize("username", ["jake", "dani", "jakub", "someone-new"])
def test_every_other_account_is_an_admin(monkeypatch: pytest.MonkeyPatch, username: str) -> None:
    """The point of the inversion: no account has to be enumerated to administer."""
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "players")
    assert service.is_admin(username) is True


def test_several_guests_can_be_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "players,visitors")
    assert service.is_admin("players") is False
    assert service.is_admin("visitors") is False
    assert service.is_admin("jake") is True


def test_guest_list_tolerates_padding_and_blanks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.config.settings.kdh_guests", " players , , visitors ")
    assert service.is_admin("players") is False
    assert service.is_admin("visitors") is False


def test_an_empty_guest_list_makes_everyone_an_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Documented fail-open direction (AR-2) — asserted so it can never drift silently."""
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "")
    assert service.is_admin("players") is True


def test_require_admin_raises_for_a_guest(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.core.config.settings.kdh_guests", "players")
    with pytest.raises(PermissionError):
        service.require_admin("players")
    service.require_admin("jake")  # does not raise


# ── the colour palette ───────────────────────────────────────────────────────


def test_palette_colours_are_unique() -> None:
    assert len(set(service.PALETTE)) == len(service.PALETTE)


def test_assign_colour_returns_the_first_free_one() -> None:
    assert service.assign_colour(set()) == service.PALETTE[0]
    assert service.assign_colour({service.PALETTE[0]}) == service.PALETTE[1]


def test_assign_colour_skips_gaps() -> None:
    """A removed invitee keeps their colour reserved, so gaps are normal (AR-7)."""
    taken = {service.PALETTE[0], service.PALETTE[2]}
    assert service.assign_colour(taken) == service.PALETTE[1]


def test_assign_colour_raises_when_the_palette_is_exhausted() -> None:
    with pytest.raises(ValueError, match="No colours left"):
        service.assign_colour(set(service.PALETTE))
