"""Interactive script to create or overwrite the auth credentials file (_auth.json).

Usage (from backend/ directory):
    DATA_DIR=./local-data python scripts/setup_auth.py
"""

from __future__ import annotations

import getpass

# Ensure app is importable from backend/ working directory
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402 — must come after sys.path insert
from app.repositories import auth_repo  # noqa: E402
from app.services.auth_service import hash_password  # noqa: E402


def main() -> None:
    print(f"Auth credentials will be stored in: {settings.data_dir / '_auth.json'}")

    existing = auth_repo.read_user()
    if existing is not None:
        print(f"\n⚠️  Existing credentials found for user '{existing.username}'.")
        confirm = input("Overwrite? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            sys.exit(0)

    username = input("\nUsername: ").strip()
    if not username:
        print("Error: username cannot be empty.")
        sys.exit(1)

    password = getpass.getpass("Password: ")
    if not password:
        print("Error: password cannot be empty.")
        sys.exit(1)

    password_confirm = getpass.getpass("Confirm password: ")
    if password != password_confirm:
        print("Error: passwords do not match.")
        sys.exit(1)

    record = auth_repo.UserRecord(username=username, password_hash=hash_password(password))
    auth_repo.write_user(record)
    print(f"\n✅  Credentials saved for user '{username}'.")


if __name__ == "__main__":
    main()
