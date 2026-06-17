"""
Tests for scripts/i2pd_stats.py.

We use captured i2pd web-console HTML samples in fixtures/ rather than
hitting a real i2pd. fetch_i2pd_stats() is exercised separately with
its underlying urlopen mocked so we cover the connection-refused path
without touching the network.
"""
from __future__ import annotations

import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(REPO_ROOT))

from scripts.i2pd_stats import (  # noqa: E402
    empty_stats,
    fetch_i2pd_stats,
    parse_i2pd_main_page,
)


def _read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ─── parse_i2pd_main_page ──────────────────────────────────────────────────


class TestParseRunning:
    """Realistic i2pd main page → all fields populated."""

    @pytest.fixture
    def parsed(self):
        return parse_i2pd_main_page(_read("i2pd_main_running.html"))

    def test_marks_running(self, parsed):
        assert parsed["running"] is True

    def test_extracts_version(self, parsed):
        assert parsed["version"] == "2.55.0"

    def test_extracts_network_status_not_v6(self, parsed):
        # Two "Network status" labels exist in the page; we want the
        # first (without "v6") to win, with value "OK".
        assert parsed["networkStatus"] == "OK"

    def test_parses_uptime_with_days_and_hms_components(self, parsed):
        # 1 day + 5h + 23m + 7s = 1*86400 + 5*3600 + 23*60 + 7 = 105_787s
        assert parsed["uptimeSeconds"] == 1 * 86400 + 5 * 3600 + 23 * 60 + 7

    def test_extracts_tunnel_creation_success_rate(self, parsed):
        assert parsed["tunnelCreationSuccessPercent"] == 78

    def test_parses_received_total_and_rate(self, parsed):
        # 234.56 MiB total = round(234.56 * 1024^2)
        assert parsed["totalReceivedBytes"] == int(234.56 * 1024 * 1024)
        # 12.34 KiB/s rate
        assert parsed["receivedBps"] == int(12.34 * 1024)

    def test_parses_sent_total_and_rate(self, parsed):
        assert parsed["totalSentBytes"] == int(123.45 * 1024 * 1024)
        assert parsed["sentBps"] == int(8.90 * 1024)

    def test_parses_transit_total_and_rate(self, parsed):
        assert parsed["totalTransitBytes"] == int(567.89 * 1024 * 1024)
        assert parsed["transitBps"] == int(45.67 * 1024)

    def test_extracts_routers_floodfills_leasesets(self, parsed):
        assert parsed["routers"] == 3214
        assert parsed["floodfills"] == 174
        assert parsed["leaseSets"] == 56

    def test_extracts_client_and_transit_tunnel_counts(self, parsed):
        assert parsed["tunnelsClient"] == 12
        assert parsed["tunnelsTransit"] == 47


class TestParseMinimal:
    """A cut-down page that only carries uptime + network status."""

    @pytest.fixture
    def parsed(self):
        return parse_i2pd_main_page(_read("i2pd_main_minimal.html"))

    def test_marks_running(self, parsed):
        assert parsed["running"] is True

    def test_uptime_in_hms_only(self, parsed):
        # 00:42:17 = 42*60 + 17
        assert parsed["uptimeSeconds"] == 42 * 60 + 17

    def test_network_status_is_firewalled(self, parsed):
        assert parsed["networkStatus"] == "Firewalled"

    def test_unparsed_fields_default_to_zero(self, parsed):
        assert parsed["routers"] == 0
        assert parsed["floodfills"] == 0
        assert parsed["leaseSets"] == 0
        assert parsed["tunnelsClient"] == 0
        assert parsed["tunnelsTransit"] == 0
        assert parsed["receivedBps"] == 0
        assert parsed["sentBps"] == 0
        assert parsed["transitBps"] == 0
        assert parsed["totalReceivedBytes"] == 0
        assert parsed["totalSentBytes"] == 0
        assert parsed["totalTransitBytes"] == 0
        assert parsed["tunnelCreationSuccessPercent"] == 0


class TestParseGarbage:
    """Random HTML that isn't i2pd's console at all."""

    @pytest.fixture
    def parsed(self):
        return parse_i2pd_main_page(_read("i2pd_main_garbage.html"))

    def test_marks_running_because_we_got_html(self, parsed):
        # We did get a response; it just wasn't useful.
        assert parsed["running"] is True

    def test_network_status_defaults_to_unknown(self, parsed):
        assert parsed["networkStatus"] == "Unknown"

    def test_no_fields_extracted(self, parsed):
        assert parsed["uptimeSeconds"] == 0
        assert parsed["routers"] == 0
        assert parsed["receivedBps"] == 0


class TestParseEmpty:
    def test_empty_string_returns_running_false(self):
        assert parse_i2pd_main_page("") == empty_stats()

    def test_none_returns_running_false(self):
        # Defensive — never raise on bad input.
        assert parse_i2pd_main_page(None) == empty_stats()  # type: ignore[arg-type]


# ─── fetch_i2pd_stats ──────────────────────────────────────────────────────


class TestFetch:
    def test_returns_running_false_on_connection_refused(self):
        with patch(
            "scripts.i2pd_stats.urllib.request.urlopen",
            side_effect=urllib.error.URLError("connection refused"),
        ):
            stats = fetch_i2pd_stats("127.0.0.1", 7070, timeout=0.5)
        assert stats == empty_stats()

    def test_returns_running_false_on_oserror(self):
        with patch(
            "scripts.i2pd_stats.urllib.request.urlopen",
            side_effect=OSError("some socket error"),
        ):
            stats = fetch_i2pd_stats("127.0.0.1", 7070, timeout=0.5)
        assert stats["running"] is False

    def test_returns_running_false_on_timeout(self):
        with patch(
            "scripts.i2pd_stats.urllib.request.urlopen",
            side_effect=TimeoutError("timed out"),
        ):
            stats = fetch_i2pd_stats("127.0.0.1", 7070, timeout=0.5)
        assert stats["running"] is False

    def test_passes_through_to_parser_on_success(self):
        html = _read("i2pd_main_running.html").encode("utf-8")

        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
            def read(self):
                return html

        with patch(
            "scripts.i2pd_stats.urllib.request.urlopen",
            return_value=FakeResponse(),
        ):
            stats = fetch_i2pd_stats("127.0.0.1", 7070, timeout=1.0)

        assert stats["running"] is True
        assert stats["version"] == "2.55.0"
        assert stats["routers"] == 3214
