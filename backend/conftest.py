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

_tmp_data_dir = tempfile.mkdtemp(prefix="archery-test-data-")
os.environ["DATA_DIR"] = _tmp_data_dir
atexit.register(shutil.rmtree, _tmp_data_dir, ignore_errors=True)
