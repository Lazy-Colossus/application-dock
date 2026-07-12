"""
Pytest session bootstrap.

Sets DATA_DIR to a unique writable temp directory BEFORE any application
modules are imported, so `app.core.config.settings.data_dir.mkdir(...)`
(which runs at import time) does not fail on the default `/data` path
when running tests outside the container.
"""

import atexit
import os
import shutil
import tempfile

import pytest

_tmp_data_dir = tempfile.mkdtemp(prefix="archery-test-data-")
os.environ["DATA_DIR"] = _tmp_data_dir
atexit.register(shutil.rmtree, _tmp_data_dir, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_hotaru_data():
    """Isolate Hotaru's writable files between tests.

    The whole session shares one temp DATA_DIR, so words written by one test
    would otherwise leak into another. Wipe `DATA_DIR/hotaru` around each test.
    (Archery writes session JSON in the DATA_DIR root, so it is unaffected.)
    """
    from app.core.config import settings

    hotaru_dir = settings.data_dir / "hotaru"
    shutil.rmtree(hotaru_dir, ignore_errors=True)
    yield
    shutil.rmtree(hotaru_dir, ignore_errors=True)
