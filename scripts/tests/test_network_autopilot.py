"""Tests for the network autopilot — diagnosis → mode + autofix plan, and
the apply-safe-config safety rule (never auto-apply root/install fixes)."""
from __future__ import annotations

from scripts import network_doctor as nd
from scripts import network_autopilot as ap


def _diag(stats, *, ygg_installed=False, ygg_running=False, probe=None):
    inp = nd.DoctorInputs(
        daemon_reachable=True, i2pd_stats=stats,
        yggdrasil_installed=ygg_installed, yggdrasil_running=ygg_running,
        eepsite_probe_ok=probe,
    )
    return nd.diagnose(inp, platform="termux")


HEALTHY = {"running": True, "version": "2.60.0", "routers": 800,
           "tunnelsClient": 20, "tunnelCreationSuccessPercent": 50,
           "networkStatus": "OK"}
STALLED_SYMMETRIC = {"running": True, "version": "2.60.0", "routers": 800,
                     "tunnelsClient": 0, "tunnelCreationSuccessPercent": 5,
                     "networkStatus": "Symmetric NAT"}
RESEEDING = {"running": True, "version": "2.60.0", "routers": 10,
             "tunnelsClient": 0, "tunnelCreationSuccessPercent": 0,
             "networkStatus": "Testing"}


class TestModeClassification:
    def test_healthy_native(self):
        plan = ap.classify_mode(_diag(HEALTHY), yggdrasil_running=False)
        assert plan.mode == ap.MODE_NATIVE
        assert plan.requires_user_action == []

    def test_healthy_on_yggdrasil_reports_b(self):
        plan = ap.classify_mode(_diag(HEALTHY, ygg_running=True), yggdrasil_running=True)
        assert plan.mode == ap.MODE_YGGDRASIL

    def test_reseeding_is_bootstrap(self):
        plan = ap.classify_mode(_diag(RESEEDING), yggdrasil_running=False)
        assert plan.mode == ap.MODE_BOOTSTRAP
        assert plan.reason == "still_reseeding_low_router_count"

    def test_symmetric_nat_stalled_recommends_yggdrasil_install(self):
        plan = ap.classify_mode(_diag(STALLED_SYMMETRIC), yggdrasil_running=False)
        assert plan.mode == ap.MODE_DEGRADED
        assert plan.reason == "symmetric_nat_stalled_client_tunnels"
        assert "install_yggdrasil" in plan.requires_user_action
        # client config tweak is something we CAN do ourselves
        assert "client_i2pd_config" in plan.safe_auto_fixes

    def test_symmetric_nat_stalled_but_ygg_running_waits(self):
        plan = ap.classify_mode(_diag(STALLED_SYMMETRIC, ygg_running=True), yggdrasil_running=True)
        assert plan.mode == ap.MODE_YGGDRASIL
        assert "install_yggdrasil" not in plan.requires_user_action

    def test_daemon_down_is_degraded_user_action(self):
        inp = nd.DoctorInputs(daemon_reachable=False, i2pd_stats=None,
                              yggdrasil_installed=False, yggdrasil_running=False,
                              eepsite_probe_ok=None)
        plan = ap.classify_mode(nd.diagnose(inp), yggdrasil_running=False)
        assert plan.mode == ap.MODE_DEGRADED
        assert "start_daemon" in plan.requires_user_action

    def test_live_probe_overrides_scary_nat(self):
        # hostile NAT label but eepsite actually loads → healthy
        plan = ap.classify_mode(
            _diag(STALLED_SYMMETRIC, probe=True), yggdrasil_running=True)
        assert plan.mode == ap.MODE_YGGDRASIL
        assert plan.reason == "tunnels_healthy"

    def test_plan_serializes(self):
        plan = ap.classify_mode(_diag(HEALTHY), yggdrasil_running=False)
        d = plan.to_dict()
        assert set(d) == {"mode", "reason", "safeAutoFixes", "requiresUserAction"}


class TestApplySafeEdits:
    def test_client_config_applies(self):
        edits, applied, refused = ap.applicable_safe_edits(["client_i2pd_config"])
        assert edits == {"notransit": "true"}
        assert applied == ["client_i2pd_config"]
        assert refused == []

    def test_install_yggdrasil_always_refused(self):
        edits, applied, refused = ap.applicable_safe_edits(["install_yggdrasil"])
        assert edits == {}
        assert applied == []
        assert "install_yggdrasil" in refused

    def test_root_actions_never_applied(self):
        for code in ("start_daemon", "start_i2pd", "reseed_follow_redirect"):
            edits, applied, refused = ap.applicable_safe_edits([code])
            assert edits == {} and applied == [] and refused == [code]

    def test_unknown_code_refused(self):
        _edits, applied, refused = ap.applicable_safe_edits(["rm_rf_slash"])
        assert applied == [] and "rm_rf_slash" in refused

    def test_mixed_request_partitions(self):
        edits, applied, refused = ap.applicable_safe_edits(
            ["client_i2pd_config", "install_yggdrasil"])
        assert edits == {"notransit": "true"}
        assert applied == ["client_i2pd_config"]
        assert refused == ["install_yggdrasil"]

    def test_only_whitelisted_keys_ever_written(self):
        # every edit this module would write must pass i2pd_config whitelist
        from scripts import i2pd_config
        for code, cfg in ap.SAFE_FIX_CONFIG_EDITS.items():
            for k in cfg:
                assert i2pd_config.is_whitelisted(k), f"{code}->{k} not whitelisted"
