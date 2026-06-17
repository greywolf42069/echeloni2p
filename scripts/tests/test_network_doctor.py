"""Tests for the Network Doctor diagnostic engine (pure logic)."""
from __future__ import annotations

import pytest

from scripts import i2pd_stats
from scripts.network_doctor import DoctorInputs, diagnose


def stats(**over) -> dict:
    s = i2pd_stats.empty_stats()
    s["running"] = True
    s["version"] = "2.60.0"
    s["networkStatus"] = "OK"
    s["routers"] = 500
    s["tunnelsClient"] = 10
    s["tunnelCreationSuccessPercent"] = 60
    s.update(over)
    return s


def inp(**over):
    base = dict(
        daemon_reachable=True,
        i2pd_stats=stats(),
        yggdrasil_installed=False,
        yggdrasil_running=False,
        eepsite_probe_ok=None,
    )
    base.update(over)
    return DoctorInputs(**base)


def _check(diag, key):
    return next((c for c in diag.checks if c.key == key), None)


class TestHonestyChecks:
    """Yggdrasil peer count, i2pd meshnet enabled, Termux wake-lock."""

    def test_ygg_running_zero_peers_fails(self):
        d = diagnose(inp(yggdrasil_running=True, yggdrasil_peers=0))
        assert _check(d, "yggdrasil_peers").status == "fail"

    def test_ygg_running_with_peers_passes(self):
        d = diagnose(inp(yggdrasil_running=True, yggdrasil_peers=6))
        assert _check(d, "yggdrasil_peers").status == "pass"

    def test_peer_check_absent_when_ygg_down(self):
        d = diagnose(inp(yggdrasil_running=False, yggdrasil_peers=None))
        assert _check(d, "yggdrasil_peers") is None

    def test_meshnet_not_enabled_warns(self):
        d = diagnose(inp(yggdrasil_running=True, yggdrasil_peers=3,
                         i2pd_meshnet_enabled=False))
        assert _check(d, "meshnet_config").status == "warn"

    def test_meshnet_enabled_passes(self):
        d = diagnose(inp(yggdrasil_running=True, yggdrasil_peers=3,
                         i2pd_meshnet_enabled=True))
        assert _check(d, "meshnet_config").status == "pass"

    def test_termux_no_wake_lock_warns(self):
        d = diagnose(inp(platform_is_termux=True, termux_wake_lock=False), platform="termux")
        assert _check(d, "wake_lock").status == "warn"

    def test_termux_wake_lock_held_passes(self):
        d = diagnose(inp(platform_is_termux=True, termux_wake_lock=True), platform="termux")
        assert _check(d, "wake_lock").status == "pass"

    def test_no_wake_lock_check_off_termux(self):
        d = diagnose(inp(platform_is_termux=False, termux_wake_lock=None))
        assert _check(d, "wake_lock") is None


class TestHardDown:
    def test_daemon_down(self):
        d = diagnose(inp(daemon_reachable=False))
        assert d.overall == "down"
        assert d.recommendation.code == "start_daemon"
        assert "echelon_sync_daemon" in d.recommendation.command

    def test_i2pd_down(self):
        d = diagnose(inp(i2pd_stats=i2pd_stats.empty_stats()))  # running=False
        assert d.overall == "down"
        assert d.recommendation.code == "start_i2pd"


class TestHealthy:
    def test_all_green_no_recommendation(self):
        d = diagnose(inp(i2pd_stats=stats(networkStatus="OK", tunnelsClient=12)))
        assert d.overall == "ok"
        assert d.recommendation is None
        assert _check(d, "tunnels").status == "pass"

    def test_eepsite_probe_ok_forces_ok(self):
        d = diagnose(inp(
            i2pd_stats=stats(networkStatus="Firewalled - Symmetric NAT", tunnelsClient=10),
            eepsite_probe_ok=True,
        ))
        assert d.overall == "ok"
        assert _check(d, "eepsite").status == "pass"


class TestReseeding:
    def test_low_router_count_warns_and_waits(self):
        d = diagnose(inp(i2pd_stats=stats(routers=20, tunnelsClient=0)))
        assert _check(d, "routers").status == "warn"
        # With few routers we recommend waiting, not Yggdrasil.
        assert d.recommendation.code == "wait_reseed"


class TestSymmetricNatRecommendsYggdrasil:
    def test_stalled_tunnels_hostile_nat_recommends_yggdrasil(self):
        d = diagnose(inp(
            i2pd_stats=stats(
                routers=600,
                tunnelsClient=1,            # stalled
                networkStatus="Firewalled - Symmetric NAT",
                tunnelCreationSuccessPercent=15,
            ),
        ))
        assert d.overall == "degraded"
        assert d.recommendation.code == "enable_yggdrasil"
        assert "yggdrasil" in d.recommendation.command.lower()
        assert _check(d, "tunnels").status == "fail"
        assert _check(d, "nat").status == "warn"

    def test_termux_platform_gives_pkg_command(self):
        d = diagnose(inp(
            i2pd_stats=stats(routers=600, tunnelsClient=1,
                             networkStatus="Firewalled - Symmetric NAT",
                             tunnelCreationSuccessPercent=15),
        ), platform="termux")
        assert "pkg install yggdrasil" in d.recommendation.command

    def test_macos_platform_gives_brew_command(self):
        d = diagnose(inp(
            i2pd_stats=stats(routers=600, tunnelsClient=1,
                             networkStatus="Firewalled - Symmetric NAT",
                             tunnelCreationSuccessPercent=15),
        ), platform="macos")
        assert "brew install yggdrasil" in d.recommendation.command

    def test_already_on_yggdrasil_recommends_waiting_not_reinstall(self):
        d = diagnose(inp(
            i2pd_stats=stats(routers=600, tunnelsClient=1,
                             networkStatus="Firewalled - Symmetric NAT",
                             tunnelCreationSuccessPercent=15),
            yggdrasil_running=True,
        ))
        assert d.recommendation.code == "wait_yggdrasil"
        assert _check(d, "yggdrasil").status == "pass"


class TestStalledButGoodNat:
    def test_stalled_tunnels_ok_nat_recommends_waiting(self):
        d = diagnose(inp(
            i2pd_stats=stats(routers=600, tunnelsClient=1, networkStatus="OK",
                             tunnelCreationSuccessPercent=80),
        ))
        # Good NAT + stalled = just building; don't push Yggdrasil.
        assert d.recommendation.code == "wait_tunnels"


class TestYggdrasilStatusCheck:
    def test_yggdrasil_not_installed_is_info(self):
        d = diagnose(inp())
        assert _check(d, "yggdrasil").status == "info"

    def test_yggdrasil_installed_not_running(self):
        d = diagnose(inp(yggdrasil_installed=True, yggdrasil_running=False))
        assert _check(d, "yggdrasil").status == "info"
        assert "not running" in _check(d, "yggdrasil").label.lower()


class TestSerialization:
    def test_to_dict_round_trips(self):
        d = diagnose(inp(i2pd_stats=stats(tunnelsClient=1,
                         networkStatus="Firewalled - Symmetric NAT",
                         tunnelCreationSuccessPercent=10)))
        out = d.to_dict()
        assert out["overall"] in ("ok", "degraded", "down")
        assert isinstance(out["checks"], list)
        assert all({"key", "status", "label", "detail"} <= set(c) for c in out["checks"])
        assert out["recommendation"]["code"] == "enable_yggdrasil"

    def test_eepsite_probe_false_marks_fail_check(self):
        d = diagnose(inp(eepsite_probe_ok=False,
                         i2pd_stats=stats(tunnelsClient=8)))
        assert _check(d, "eepsite").status == "fail"
