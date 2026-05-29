"""
Pytest session bootstrap.

Sets DATA_DIR to a unique writable temp directory BEFORE any application
modules are imported, so `app.core.config.settings.data_dir.mkdir(...)`
(which runs at import time) does not fail on the default `/data` path
when running tests outside the container.
"""

import os
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="archery-test-data-"))
