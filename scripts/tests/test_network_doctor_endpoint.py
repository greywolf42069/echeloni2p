"""End-to-end test: /network/doctor daemon endpoint shape."""
from __future__ import annotations


def test_network_doctor_endpoint_returns_diagnosis(client, monkeypatch):
    daemon_client, _ = client
    # i2pd console almost certainly not running on the test's random env →
    # the doctor should report i2pd down, overall=down, with a recommendation.
    monkeypatch.setenv("ECHELON_I2PD_CONSOLE_PORT", "59999")  # nothing there
    status, _, body = daemon_client.request("/network/doctor")
    assert status == 200
    assert "overall" in body
    assert body["overall"] in ("ok", "degraded", "down")
    assert isinstance(body["checks"], list)
    # The daemon answering means the daemon check passes.
    daemon_check = next(c for c in body["checks"] if c["key"] == "daemon")
    assert daemon_check["status"] == "pass"
    # i2pd unreachable → there is a recommendation to start it.
    if body["overall"] == "down":
        assert body["recommendation"]["code"] in ("start_i2pd", "start_daemon")


def test_network_doctor_check_shape(client):
    daemon_client, _ = client
    status, _, body = daemon_client.request("/network/doctor")
    assert status == 200
    for c in body["checks"]:
        assert set(c.keys()) == {"key", "status", "label", "detail"}
        assert c["status"] in ("pass", "warn", "fail", "info")
