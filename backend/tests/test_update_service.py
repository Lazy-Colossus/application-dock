import unittest.mock as mock

import pytest

import app.services.update_service as update_service


# --- is_update_available ---

def test_is_update_available_returns_true_when_flag_set(monkeypatch):
    monkeypatch.setattr(update_service, "_update_available", True)
    assert update_service.is_update_available() is True


def test_is_update_available_returns_false_when_flag_set(monkeypatch):
    monkeypatch.setattr(update_service, "_update_available", False)
    assert update_service.is_update_available() is False


def test_boot_detection_true_when_script_exists(tmp_path, monkeypatch):
    script = tmp_path / "update-application-dock.sh"
    script.touch()
    monkeypatch.setattr(update_service, "UPDATE_SCRIPT_PATH", script)
    monkeypatch.setattr(update_service, "_update_available", update_service.UPDATE_SCRIPT_PATH.is_file())
    assert update_service.is_update_available() is True


def test_boot_detection_false_when_script_absent(tmp_path, monkeypatch):
    missing = tmp_path / "update-application-dock.sh"
    monkeypatch.setattr(update_service, "UPDATE_SCRIPT_PATH", missing)
    monkeypatch.setattr(update_service, "_update_available", update_service.UPDATE_SCRIPT_PATH.is_file())
    assert update_service.is_update_available() is False


# --- trigger_update ---

def test_trigger_update_raises_when_unavailable(monkeypatch):
    monkeypatch.setattr(update_service, "_update_available", False)
    with pytest.raises(RuntimeError, match="Update not available"):
        update_service.trigger_update()


def test_trigger_update_calls_containers_run(monkeypatch):
    monkeypatch.setattr(update_service, "_update_available", True)
    mock_client = mock.MagicMock()
    with mock.patch("docker.from_env", return_value=mock_client):
        update_service.trigger_update()
    mock_client.containers.run.assert_called_once()
    call = mock_client.containers.run.call_args
    assert call.args[0] == "docker:cli"
    assert call.kwargs["command"] == ["sh", "/host-scripts/update-application-dock-docker.sh"]
    assert call.kwargs["detach"] is True
    assert call.kwargs["remove"] is True
    assert call.kwargs["name"] == "application-dock-updater"


def test_trigger_update_reraises_docker_exception(monkeypatch):
    import docker.errors

    monkeypatch.setattr(update_service, "_update_available", True)
    mock_client = mock.MagicMock()
    mock_client.containers.run.side_effect = docker.errors.DockerException("socket error")
    with mock.patch("docker.from_env", return_value=mock_client):
        with pytest.raises(RuntimeError, match="Update launch failed"):
            update_service.trigger_update()
