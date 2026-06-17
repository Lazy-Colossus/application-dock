"""Shared test fixtures.

Provides an autouse fixture that bypasses JWT auth for all tests except
test_auth.py, which exercises the full auth flow on its own.
"""

import pytest

from app.core.dependencies import get_current_user
from app.main import app


@pytest.fixture(autouse=True)
def bypass_auth_for_non_auth_tests(request: pytest.FixtureRequest) -> None:  # type: ignore[return]
    """Override the auth dependency with a no-op for every test outside test_auth.py."""
    if "test_auth" in request.fspath.basename:
        yield
        return
    app.dependency_overrides[get_current_user] = lambda: "test_user"
    yield
    app.dependency_overrides.pop(get_current_user, None)
