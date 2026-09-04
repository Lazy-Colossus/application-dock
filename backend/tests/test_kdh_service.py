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
