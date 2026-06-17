"""
Comprehensive tests for echelon_sync_daemon.py.

Each test boots a fresh daemon (via the `client` fixture in conftest.py)
on a random localhost port, with a tempdir as ECHELON_SYNC_ROOT.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import pytest


# ───────────────────────────────────────── /health ────────────────────────────

class TestHealth:
    def test_returns_200_with_root_path(self, client):
        api, root = client
        code, _hdrs, body = api.request("/health")
        assert code == 200
        # Root path no longer exposed in /health (security hardening).
        assert body == {"status": "ok"}

    def test_unknown_get_returns_404(self, client):
        api, _root = client
        code, _hdrs, body = api.request("/nope")
        assert code == 404
        assert body["error"] == "not found"

    def test_options_preflight_returns_204_with_cors_headers(self, client):
        api, _root = client
        code, hdrs, _body = api.request(
            "/publish",
            method="OPTIONS",
            headers={"Origin": "http://localhost:3000"},
        )
        assert code == 204
        assert hdrs.get("Access-Control-Allow-Origin") == "http://localhost:3000"
        assert "POST" in hdrs.get("Access-Control-Allow-Methods", "")


# ────────────────────────────────────────── /publish ──────────────────────────

class TestPublish:
    def test_round_trips_a_simple_site(self, client):
        api, root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": "blog.i2p",
            "files": {
                "index.html": "<h1>blog</h1>",
                "css/style.css": "body{color:red}",
                "nested/deep/file.txt": "deep!",
            },
        })
        assert code == 200
        assert body["eepsite"] == "blog.i2p"
        assert body["writtenCount"] == 3
        assert sorted(body["files"]) == ["css/style.css", "index.html", "nested/deep/file.txt"]

        # Files are physically present on disk.
        site_root = root / "blog.i2p"
        assert (site_root / "index.html").read_text() == "<h1>blog</h1>"
        assert (site_root / "css" / "style.css").read_text() == "body{color:red}"
        assert (site_root / "nested" / "deep" / "file.txt").read_text() == "deep!"

    def test_overwrite_drops_files_no_longer_supplied(self, client):
        api, root = client
        # First publish: two files.
        api.request("/publish", "POST", {
            "eepsite": "x.i2p",
            "files": {"a.html": "A", "b.html": "B"},
        })
        # Second publish: only a.html.
        code, _h, _body = api.request("/publish", "POST", {
            "eepsite": "x.i2p",
            "files": {"a.html": "A2"},
        })
        assert code == 200
        site = root / "x.i2p"
        assert (site / "a.html").read_text() == "A2"
        assert not (site / "b.html").exists()

    def test_appends_dot_i2p_if_missing(self, client):
        api, root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": "noext",
            "files": {"index.html": "ok"},
        })
        assert code == 200
        assert body["eepsite"] == "noext.i2p"
        assert (root / "noext.i2p" / "index.html").read_text() == "ok"

    def test_lowercases_site_name(self, client):
        api, root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": "MyBlog.I2P",
            "files": {"index.html": "ok"},
        })
        assert code == 200
        assert body["eepsite"] == "myblog.i2p"
        assert (root / "myblog.i2p" / "index.html").exists()

    @pytest.mark.parametrize("invalid_name", [
        "",
        "..i2p",
        "../etc.i2p",
        "/abs.i2p",
        "spaces in name.i2p",
        "<script>.i2p",
        "really/nested.i2p",
        "x" * 64 + ".i2p",  # too long
    ])
    def test_rejects_invalid_eepsite_names(self, client, invalid_name):
        api, _root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": invalid_name,
            "files": {"a.html": "x"},
        })
        assert code == 400
        assert "eepsite" in body["error"].lower()

    @pytest.mark.parametrize("bad_path", [
        "../etc/passwd",
        "/etc/passwd",
        "../../escape.html",
        "ok/../../escape.html",
        "with space.html",
        "with\\backslash.html",
        "a/./b.html",
        "",
    ])
    def test_rejects_path_traversal(self, client, bad_path):
        api, root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": "victim.i2p",
            "files": {bad_path: "x"},
        })
        assert code == 400
        assert "path" in body["error"].lower() or "file" in body["error"].lower()

    def test_rejects_missing_files_field(self, client):
        api, _root = client
        code, _h, body = api.request("/publish", "POST", {"eepsite": "x.i2p"})
        assert code == 400
        assert "files" in body["error"].lower()

    def test_rejects_empty_files_field(self, client):
        api, _root = client
        code, _h, body = api.request("/publish", "POST", {"eepsite": "x.i2p", "files": {}})
        assert code == 400

    def test_rejects_non_string_file_contents(self, client):
        api, _root = client
        code, _h, body = api.request("/publish", "POST", {
            "eepsite": "x.i2p",
            "files": {"a.html": 12345},  # number, not string
        })
        assert code == 400
        assert "string" in body["error"].lower()

    def test_rejects_oversized_body(self, daemon):
        # Bypass our small JSON helper and craft an oversized POST manually.
        base, _root, mod = daemon
        big = b"x" * (mod.MAX_BODY + 1024)
        req = urllib.request.Request(
            f"{base}/publish",
            data=big,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(big)),
            },
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req, timeout=5)
        assert exc.value.code == 413


# ───────────────────────────────────────── /list ──────────────────────────────

class TestList:
    def test_empty_initially(self, client):
        api, _root = client
        code, _h, body = api.request("/list")
        assert code == 200
        assert body == {"eepsites": []}

    def test_lists_all_published_with_sizes(self, client):
        api, _root = client
        api.request("/publish", "POST", {"eepsite": "a.i2p", "files": {"index.html": "<h1>A</h1>"}})
        api.request("/publish", "POST", {"eepsite": "b.i2p", "files": {"x.txt": "BBBBB"}})
        code, _h, body = api.request("/list")
        assert code == 200
        names = sorted(e["eepsite"] for e in body["eepsites"])
        assert names == ["a.i2p", "b.i2p"]

        a = next(e for e in body["eepsites"] if e["eepsite"] == "a.i2p")
        index_entry = next(f for f in a["files"] if f["path"] == "index.html")
        assert index_entry["size"] == len("<h1>A</h1>")


# ──────────────────────────────────── DELETE /eepsite/{name} ──────────────────

class TestDelete:
    def test_removes_only_named_eepsite(self, client):
        api, root = client
        api.request("/publish", "POST", {"eepsite": "keep.i2p", "files": {"a.html": "K"}})
        api.request("/publish", "POST", {"eepsite": "drop.i2p", "files": {"a.html": "D"}})
        code, _h, body = api.request("/eepsite/drop.i2p", "DELETE")
        assert code == 200
        assert body == {"deleted": "drop.i2p"}
        assert not (root / "drop.i2p").exists()
        assert (root / "keep.i2p" / "a.html").read_text() == "K"

    def test_delete_nonexistent_is_idempotent(self, client):
        api, _root = client
        code, _h, body = api.request("/eepsite/never-existed.i2p", "DELETE")
        assert code == 200
        assert body == {"deleted": "never-existed.i2p"}

    def test_delete_invalid_name_returns_400(self, client):
        api, _root = client
        code, _h, body = api.request("/eepsite/..", "DELETE")
        assert code == 400


# ──────────────────────────────────────── CORS ────────────────────────────────

class TestCors:
    def test_localhost_origin_is_echoed(self, client):
        api, _root = client
        _code, hdrs, _body = api.request(
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )
        assert hdrs.get("Access-Control-Allow-Origin") == "http://localhost:5173"

    def test_capacitor_origin_is_echoed(self, client):
        api, _root = client
        _code, hdrs, _body = api.request(
            "/health",
            headers={"Origin": "capacitor://localhost"},
        )
        assert hdrs.get("Access-Control-Allow-Origin") == "capacitor://localhost"

    def test_arbitrary_remote_origin_is_not_echoed(self, client):
        api, _root = client
        _code, hdrs, _body = api.request(
            "/health",
            headers={"Origin": "https://evil.example.com"},
        )
        # No origin echoed back -> browser will block the cross-origin response.
        assert "Access-Control-Allow-Origin" not in hdrs

    def test_no_origin_returns_wildcard(self, client):
        # Same-device curl/fetch with no Origin header gets *.
        api, _root = client
        _code, hdrs, _body = api.request("/health")
        assert hdrs.get("Access-Control-Allow-Origin") == "*"


# ──────────────────────────────────── /i2pd/stats ─────────────────────────

class TestI2pdStatsEndpoint:
    """The daemon proxies i2pd's web-console stats out to the browser."""

    def test_returns_running_false_when_i2pd_unreachable(self, client):
        from unittest.mock import patch
        api, _root = client
        with patch(
            "scripts.i2pd_stats.fetch_i2pd_stats",
            return_value={"running": False, "routers": 0, "receivedBps": 0, "uptimeSeconds": 0},
        ):
            code, _hdrs, body = api.request("/i2pd/stats")
        assert code == 200
        assert body["running"] is False
        assert body["routers"] == 0
        assert body["receivedBps"] == 0
        assert body["uptimeSeconds"] == 0

    def test_returns_parsed_payload_when_i2pd_reachable(self, client):
        from unittest.mock import patch

        api, _root = client
        canned = {
            "running": True,
            "version": "2.55.0",
            "networkStatus": "OK",
            "routers": 3214,
            "floodfills": 174,
            "tunnelsTransit": 47,
        }
        with patch(
            "scripts.i2pd_stats.fetch_i2pd_stats",
            return_value=canned,
        ):
            code, _hdrs, body = api.request("/i2pd/stats")

        assert code == 200
        assert body["running"] is True
        assert body["version"] == "2.55.0"
        assert body["networkStatus"] == "OK"
        assert body["routers"] == 3214
        assert body["floodfills"] == 174
        assert body["tunnelsTransit"] == 47

    def test_response_carries_localhost_cors_header(self, client):
        from unittest.mock import patch
        api, _root = client
        with patch(
            "scripts.i2pd_stats.fetch_i2pd_stats",
            return_value={"running": False},
        ):
            _code, hdrs, _body = api.request(
                "/i2pd/stats",
                headers={"Origin": "http://localhost:5173"},
            )
        assert hdrs.get("Access-Control-Allow-Origin") == "http://localhost:5173"


# ───────────────────────────── /i2pd/config ────────────────────────────────

class TestI2pdConfigEndpoint:
    """The daemon reads + writes a whitelisted slice of ~/.i2pd/i2pd.conf."""

    SAMPLE = (
        "# header comment\n"
        "bandwidth = X\n"
        "share = 50\n"
        "[http]\n"
        "address = 127.0.0.1\n"
        "port = 7070\n"
    )

    def _setup_cfg(self, tmp_path, monkeypatch, daemon, contents=None):
        cfg = tmp_path / "i2pd.conf"
        if contents is not None:
            cfg.write_text(contents, encoding="utf-8")
        # Re-resolve the daemon module's _i2pd_config_path lookup by env var.
        monkeypatch.setenv("ECHELON_I2PD_CONFIG", str(cfg))
        return cfg

    def test_get_returns_whitelisted_values(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)
        code, _hdrs, body = api.request("/i2pd/config")
        assert code == 200
        assert body["configPath"] == str(cfg)
        # Whitelisted only.
        assert body["values"]["bandwidth"] == "X"
        assert body["values"]["http.port"] == "7070"
        # Unknown keys aren't echoed.
        assert "reseed.verify" not in body["values"]
        # Schema description.
        assert "bandwidth" in body["knownKeys"]
        assert "http.port" in body["knownKeys"]

    def test_get_on_missing_file_returns_empty_values(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = tmp_path / "doesnt-exist.conf"
        monkeypatch.setenv("ECHELON_I2PD_CONFIG", str(cfg))
        code, _hdrs, body = api.request("/i2pd/config")
        assert code == 200
        assert body["values"] == {}

    def test_post_round_trips_through_get(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)

        code, _hdrs, body = api.request("/i2pd/config", "POST", {
            "values": {"bandwidth": "L", "share": "25", "http.port": "8080"},
        })
        assert code == 200
        assert body["writtenCount"] == 3
        # The on-disk file got the updates.
        text = cfg.read_text(encoding="utf-8")
        assert "bandwidth = L" in text
        assert "share = 25" in text
        assert "port = 8080" in text  # under [http]
        # GET reflects them.
        _code, _h, getbody = api.request("/i2pd/config")
        assert getbody["values"]["bandwidth"] == "L"
        assert getbody["values"]["http.port"] == "8080"

    def test_post_rejects_non_whitelisted_key(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)
        original = cfg.read_text(encoding="utf-8")

        code, _hdrs, body = api.request("/i2pd/config", "POST", {
            "values": {"reseed.verify": "false"},
        })
        assert code == 400
        assert "non-whitelisted" in body["error"]
        # File is untouched.
        assert cfg.read_text(encoding="utf-8") == original

    def test_post_rejects_invalid_value(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)
        original = cfg.read_text(encoding="utf-8")

        code, _hdrs, body = api.request("/i2pd/config", "POST", {
            "values": {"bandwidth": "Z"},
        })
        assert code == 400
        assert "invalid value" in body["error"]
        assert cfg.read_text(encoding="utf-8") == original

    def test_post_rejects_oversize_port(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)
        original = cfg.read_text(encoding="utf-8")

        code, _hdrs, _body = api.request("/i2pd/config", "POST", {
            "values": {"http.port": "99999"},
        })
        assert code == 400
        assert cfg.read_text(encoding="utf-8") == original

    def test_post_rejects_missing_values_field(self, client, tmp_path, monkeypatch):
        api, _root = client
        self._setup_cfg(tmp_path, monkeypatch, None, self.SAMPLE)

        code, _h, body = api.request("/i2pd/config", "POST", {})
        assert code == 400
        assert "values" in body["error"].lower()

    def test_post_creates_file_when_missing(self, client, tmp_path, monkeypatch):
        api, _root = client
        cfg = tmp_path / "subdir" / "i2pd.conf"
        monkeypatch.setenv("ECHELON_I2PD_CONFIG", str(cfg))

        code, _h, body = api.request("/i2pd/config", "POST", {
            "values": {"bandwidth": "L"},
        })
        assert code == 200
        assert cfg.exists()
        assert "bandwidth = L" in cfg.read_text(encoding="utf-8")


# ───────────────────────────── /i2pd/outproxy ─────────────────────────────

class TestI2pdOutproxyEndpoint:
    """Echelon's managed outproxy section in tunnels.conf."""

    USER_TUNNELS = (
        "[my-irc-client]\n"
        "type = client\n"
        "destination = irc.echelon.i2p\n"
        "listenport = 6669\n"
    )

    def _setup(self, tmp_path, monkeypatch, contents=None):
        path = tmp_path / "tunnels.conf"
        if contents is not None:
            path.write_text(contents, encoding="utf-8")
        monkeypatch.setenv("ECHELON_I2PD_TUNNELS", str(path))
        return path

    def test_get_on_missing_file_reports_disabled(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = tmp_path / "no-such-file.conf"
        monkeypatch.setenv("ECHELON_I2PD_TUNNELS", str(path))
        code, _h, body = api.request("/i2pd/outproxy")
        assert code == 200
        assert body["spec"]["mode"] == "disabled"
        assert body["lockedBindHost"] == "127.0.0.1"

    def test_get_reports_existing_block_state(self, client, tmp_path, monkeypatch):
        from scripts.i2pd_tunnels import OutproxySpec, build_managed_block
        api, _ = client
        path = self._setup(
            tmp_path, monkeypatch,
            self.USER_TUNNELS + "\n" + build_managed_block(OutproxySpec(mode="http", http_upstream_port=8118)),
        )
        code, _h, body = api.request("/i2pd/outproxy")
        assert code == 200
        assert body["spec"]["mode"] == "http"
        assert body["spec"]["http_upstream_port"] == 8118
        assert body["tunnelsPath"] == str(path)

    def test_post_enables_http_outproxy_round_trips_via_get(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)

        code, _h, body = api.request("/i2pd/outproxy", "POST", {
            "mode": "http",
            "http_upstream_port": 8120,
            "advertise": False,
        })
        assert code == 200
        assert body["spec"]["mode"] == "http"
        assert body["spec"]["http_upstream_port"] == 8120

        # User content survived.
        text = path.read_text(encoding="utf-8")
        assert "[my-irc-client]" in text
        assert "[echelon-outproxy-http]" in text

        # GET returns the same.
        _c, _h2, getbody = api.request("/i2pd/outproxy")
        assert getbody["spec"]["mode"] == "http"

    def test_post_disable_clears_managed_block_only(self, client, tmp_path, monkeypatch):
        from scripts.i2pd_tunnels import OutproxySpec, build_managed_block
        api, _ = client
        path = self._setup(
            tmp_path, monkeypatch,
            self.USER_TUNNELS + "\n" + build_managed_block(OutproxySpec(mode="both")),
        )

        code, _h, body = api.request("/i2pd/outproxy", "POST", {"mode": "disabled"})
        assert code == 200
        assert body["spec"]["mode"] == "disabled"

        text = path.read_text(encoding="utf-8")
        assert "ECHELON OUTPROXY" not in text          # markers gone
        assert "echelon-outproxy" not in text          # stanza gone
        assert "[my-irc-client]" in text               # user content untouched

    def test_post_rejects_wildcard_upstream_host(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)
        original = path.read_text(encoding="utf-8")

        code, _h, body = api.request("/i2pd/outproxy", "POST", {
            "mode": "http", "upstream_host": "0.0.0.0",
        })
        assert code == 400
        assert "upstream_host" in body["error"]
        # File untouched.
        assert path.read_text(encoding="utf-8") == original

    def test_post_rejects_unknown_mode(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)
        original = path.read_text(encoding="utf-8")

        code, _h, body = api.request("/i2pd/outproxy", "POST", {"mode": "exit"})
        assert code == 400
        assert "mode" in body["error"]
        assert path.read_text(encoding="utf-8") == original

    def test_post_rejects_oversize_port(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)
        original = path.read_text(encoding="utf-8")

        code, _h, _body = api.request("/i2pd/outproxy", "POST", {
            "mode": "http", "http_upstream_port": 99999,
        })
        assert code == 400
        assert path.read_text(encoding="utf-8") == original

    def test_post_idempotent_no_duplicate_blocks(self, client, tmp_path, monkeypatch):
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)

        for _ in range(3):
            code, _h, _body = api.request("/i2pd/outproxy", "POST", {"mode": "both"})
            assert code == 200

        text = path.read_text(encoding="utf-8")
        assert text.count("ECHELON OUTPROXY START") == 1
        assert text.count("ECHELON OUTPROXY END") == 1

    def test_post_response_carries_localhost_cors_header(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)
        _code, hdrs, _body = api.request(
            "/i2pd/outproxy", "POST", {"mode": "disabled"},
            headers={"Origin": "http://localhost:5173"},
        )
        assert hdrs.get("Access-Control-Allow-Origin") == "http://localhost:5173"

    def test_post_keys_filename_cannot_be_overridden_via_payload(self, client, tmp_path, monkeypatch):
        """Defence in depth: even if a malicious POST tries to set
        http_keys_file/socks_keys_file, the daemon ignores them and the
        hard-coded names appear in tunnels.conf."""
        api, _ = client
        path = self._setup(tmp_path, monkeypatch, self.USER_TUNNELS)
        code, _h, _body = api.request("/i2pd/outproxy", "POST", {
            "mode": "http",
            "http_keys_file": "../../../etc/passwd",  # attempted escape
            "socks_keys_file": "/tmp/evil.dat",
        })
        assert code == 200
        text = path.read_text(encoding="utf-8")
        assert "echelon-outproxy-http.dat" in text
        assert "../" not in text
        assert "/etc/passwd" not in text
        assert "/tmp/evil.dat" not in text


# ───────────────────────── /filters/lists + friends ───────────────────────

class TestFilterEndpoints:
    """Subscription manager + blocklist + events endpoints."""

    def _filters_dir(self, tmp_path, monkeypatch):
        d = tmp_path / "echelon-filters"
        monkeypatch.setenv("ECHELON_FILTERS_ROOT", str(d))
        return d

    def test_get_lists_initially_empty_with_well_known_suggestions(self, client, tmp_path, monkeypatch):
        api, _ = client
        d = self._filters_dir(tmp_path, monkeypatch)
        code, _h, body = api.request("/filters/lists")
        assert code == 200
        assert body["filtersRoot"] == str(d)
        assert body["subscriptions"] == []
        assert any(item["id"] == "stevenblack" for item in body["wellKnown"])

    def test_post_lists_adds_subscription(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, body = api.request("/filters/lists", "POST", {
            "name": "Local",
            "url": "https://example.com/list.txt",
        })
        assert code == 200
        assert body["subscription"]["name"] == "Local"
        # GET reflects.
        _c, _h2, getbody = api.request("/filters/lists")
        assert len(getbody["subscriptions"]) == 1

    def test_post_lists_rejects_unsafe_url(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, body = api.request("/filters/lists", "POST", {
            "name": "Evil",
            "url": "javascript:alert(1)",
        })
        assert code == 400
        assert "unsafe" in body["error"].lower()

    def test_post_lists_rejects_empty_name(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, body = api.request("/filters/lists", "POST", {
            "name": "",
            "url": "https://example.com/list.txt",
        })
        assert code == 400

    def test_delete_lists_by_id(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        _c, _h, body = api.request("/filters/lists", "POST", {
            "name": "X", "url": "https://example.com/x.txt",
        })
        sub_id = body["subscription"]["id"]
        code, _h2, removed = api.request(f"/filters/lists/{sub_id}", "DELETE")
        assert code == 200
        assert removed["removed"] == sub_id
        # GET shows empty.
        _c2, _h3, listbody = api.request("/filters/lists")
        assert listbody["subscriptions"] == []

    def test_delete_unknown_id_returns_404(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, _body = api.request("/filters/lists/nope1234", "DELETE")
        assert code == 404

    def test_delete_id_with_unsafe_chars_returns_404(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, _body = api.request("/filters/lists/..%2Fetc", "DELETE")
        assert code == 404

    def test_refresh_with_no_subscriptions_returns_empty_blocklist(self, client, tmp_path, monkeypatch):
        api, _ = client
        self._filters_dir(tmp_path, monkeypatch)
        code, _h, body = api.request("/filters/refresh", "POST", {})
        assert code == 200
        assert body["subscriptions"] == []
        assert body["blocklistSize"] == 0

    def test_blocklist_endpoint_size_after_real_refresh(self, client, tmp_path, monkeypatch):
        from unittest.mock import patch
        api, _ = client
        d = self._filters_dir(tmp_path, monkeypatch)
        api.request("/filters/lists", "POST", {
            "name": "L", "url": "https://example.com/l.txt",
        })
        # Stub the downloader so /filters/refresh returns a real-looking list.
        canned_body = b"0.0.0.0 a.example.com\n0.0.0.0 b.example.com\n"

        class _Stub:
            def fetch(self, url, etag):
                return 200, canned_body, '"v1"'

        with patch("scripts.threat_filters.FilterDownloader", return_value=_Stub()):
            code, _h, body = api.request("/filters/refresh", "POST", {})
        assert code == 200
        assert body["blocklistSize"] == 2
        # /filters/blocklist also reflects the new size.
        code, _h, blockbody = api.request("/filters/blocklist")
        assert blockbody["blocklistSize"] == 2
        assert sorted(blockbody["sample"]) == ["a.example.com", "b.example.com"]


class TestFilterEventsEndpoint:
    def test_events_initially_empty(self, client):
        # Reset the global buffer so prior tests don't leak.
        from scripts.threat_events import reset_global_buffer
        reset_global_buffer()
        api, _ = client
        code, _h, body = api.request("/filters/events")
        assert code == 200
        assert body["events"] == []
        assert body["headSeq"] == 0
        assert body["bufferCap"] >= 1

    def test_events_stream_returns_appended_events(self, client):
        from scripts.threat_events import reset_global_buffer, get_global_buffer
        reset_global_buffer()
        get_global_buffer().append(domain="evil.example.com", list_source="L1")
        get_global_buffer().append(domain="ads.example.com", list_source="L1")
        api, _ = client
        code, _h, body = api.request("/filters/events")
        assert code == 200
        assert len(body["events"]) == 2
        assert body["events"][0]["domain"] == "evil.example.com"
        assert body["headSeq"] >= 2

    def test_events_since_filters(self, client):
        from scripts.threat_events import reset_global_buffer, get_global_buffer
        buf = reset_global_buffer()
        buf.append(domain="a.com")
        cut = buf.head_seq()
        buf.append(domain="b.com")
        api, _ = client
        code, _h, body = api.request(f"/filters/events?since={cut}")
        assert code == 200
        assert [e["domain"] for e in body["events"]] == ["b.com"]

    def test_events_since_invalid_treated_as_zero(self, client):
        from scripts.threat_events import reset_global_buffer, get_global_buffer
        reset_global_buffer()
        get_global_buffer().append(domain="x.com")
        api, _ = client
        code, _h, body = api.request("/filters/events?since=garbage")
        assert code == 200
        assert len(body["events"]) == 1
