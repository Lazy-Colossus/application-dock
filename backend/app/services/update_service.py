"""
Startup detection and fire-and-forget trigger for the host update script.

Compose contract: the host directory containing `update-application-dock-docker.sh` must be
mounted read-only at `/host-scripts` (fixed — not env-configurable, to keep the mount
and the existence check from drifting), and the Docker socket must be mounted at
`/var/run/docker.sock`. When either mount is absent the feature degrades silently:
`is_update_available()` returns False and `trigger_update()` raises RuntimeError
before touching Docker.

Security note: no user-supplied input flows into the container spec — image, command,
and paths are all constants or operator-configured values from settings. See Story 1.4
Dev Notes for the full threat-model rationale.
"""

from pathlib import Path

import docker
import docker.errors

from app.core.config import settings

HOST_SCRIPTS_MOUNT = Path("/host-scripts")
UPDATE_SCRIPT_PATH = HOST_SCRIPTS_MOUNT / "update-application-dock-docker.sh"
_update_available: bool = UPDATE_SCRIPT_PATH.is_file()


def is_update_available() -> bool:
    return _update_available


def trigger_update() -> None:
    if not is_update_available():
        raise RuntimeError("Update not available")
    try:
        client = docker.from_env()
        volumes: dict[str, dict[str, str]] = {
            "/var/run/docker.sock": {"bind": "/var/run/docker.sock", "mode": "rw"},
            # rw so the script can write log files inside the scripts directory
            str(settings.host_scripts_dir_on_host): {"bind": "/host-scripts", "mode": "rw"},
        }
        if settings.host_project_dir_on_host:
            volumes[settings.host_project_dir_on_host] = {"bind": "/host-project", "mode": "rw"}
        if settings.host_compose_file_dir_on_host:
            volumes[settings.host_compose_file_dir_on_host] = {
                "bind": "/host-compose-dir",
                "mode": "ro",
            }
        client.containers.run(
            "docker:cli",
            command=["sh", "/host-scripts/update-application-dock-docker.sh"],
            volumes=volumes,
            detach=True,
            remove=True,
            name="application-dock-updater",
        )
    except docker.errors.DockerException as exc:
        raise RuntimeError(f"Update launch failed: {exc}") from exc
