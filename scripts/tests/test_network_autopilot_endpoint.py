"""End-to-end tests: the Network Doctor autopilot endpoints.
/network/mode, /network/autofix-plan, /network/apply-safe-config."""
from __future__ import annotations


def test_network_mode_shape(client, monkeypatch):
    daemon_client, _ = client
    monkeypatch.setenv("ECHELON_I2PD_CONSOLE_PORT", "59999")  # i2pd absent
    status, _, body = daemon_client.request("/network/mode")
    assert status == 200
    assert set(body.keys()) == {"mode", "reason"}
    assert body["mode"].startswith(("A_", "B_", "C_", "D_", "E_"))


def test_autofix_plan_shape(client, monkeypatch):
    daemon_client, _ = client
    monkeypatch.setenv("ECHELON_I2PD_CONSOLE_PORT", "59999")
    status, _, body = daemon_client.request("/network/autofix-plan")
    assert status == 200
    assert set(body.keys()) == {"mode", "reason", "safeAutoFixes", "requiresUserAction"}
    assert isinstance(body["safeAutoFixes"], list)
    assert isinstance(body["requiresUserAction"], list)
    # i2pd absent → degraded mode asking the user to start i2pd
    assert body["mode"] == "E_DEGRADED"
    assert "start_i2pd" in body["requiresUserAction"]


def test_apply_safe_config_refuses_root_actions(client, tmp_path, monkeypatch):
    daemon_client, _ = client
    monkeypatch.setenv("ECHELON_I2PD_CONFIG", str(tmp_path / "i2pd.conf"))
    status, _, body = daemon_client.request(
        "/network/apply-safe-config", method="POST",
        body={"fixes": ["install_yggdrasil", "start_i2pd"]})
    assert status == 200
    assert body["applied"] == []
    assert "install_yggdrasil" in body["refused"]
    assert "start_i2pd" in body["refused"]
    assert body["writtenKeys"] == []


def test_apply_safe_config_applies_client_tweak(client, tmp_path, monkeypatch):
    daemon_client, _ = client
    cfg = tmp_path / "i2pd.conf"
    monkeypatch.setenv("ECHELON_I2PD_CONFIG", str(cfg))
    status, _, body = daemon_client.request(
        "/network/apply-safe-config", method="POST",
        body={"fixes": ["client_i2pd_config"]})
    assert status == 200
    assert body["applied"] == ["client_i2pd_config"]
    assert "notransit" in body["writtenKeys"]
    # the safe edit was actually written to disk
    assert "notransit" in cfg.read_text()


def test_apply_safe_config_bad_body(client):
    daemon_client, _ = client
    status, _, body = daemon_client.request(
        "/network/apply-safe-config", method="POST", body={"fixes": "notalist"})
    assert status == 400
