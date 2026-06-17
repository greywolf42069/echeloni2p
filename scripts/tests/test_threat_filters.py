"""
Tests for scripts/threat_filters.py — list management, parser, decisions.

No real network: the downloader is replaced with a stub.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.threat_filters import (  # noqa: E402
    FilterDownloader,
    Subscription,
    SubscriptionStore,
    compile_blocklist,
    is_domain_blocked,
    is_safe_domain,
    is_safe_list_url,
    parse_hosts_file,
    refresh_all,
    refresh_subscription,
)


# ─── parse_hosts_file ────────────────────────────────────────────────────


SAMPLE_HOSTS = """\
# StevenBlack/hosts excerpt
# This file is just for tests.
127.0.0.1 localhost
255.255.255.255 broadcasthost

0.0.0.0 ads.example.com
0.0.0.0 trackers.foo.net
0.0.0.0 doubleclick.net    # inline comment
127.0.0.1 evil.example     # also accepted
plain-one-per-line.com
trailing-whitespace.com   

# Garbage:
0.0.0.0 0.0.0.0
0.0.0.0 NOT A DOMAIN
0.0.0.0
::1 ipv6.example.com
"""


class TestParseHostsFile:
    def test_extracts_blocked_domains(self):
        out = parse_hosts_file(SAMPLE_HOSTS)
        assert "ads.example.com" in out
        assert "trackers.foo.net" in out
        assert "doubleclick.net" in out
        # 'evil.example' is RFC-2606 reserved but matches the domain shape, so the
        # parser accepts it. (Real production lists never contain it; harmless.)
        assert "evil.example" in out

    def test_skips_localhost_and_broadcast(self):
        out = parse_hosts_file(SAMPLE_HOSTS)
        assert "localhost" not in out
        assert "broadcasthost" not in out

    def test_skips_garbage_lines(self):
        out = parse_hosts_file(SAMPLE_HOSTS)
        assert "0.0.0.0" not in out
        # NOT A DOMAIN should be ignored.
        assert "NOT" not in out

    def test_handles_plain_one_domain_per_line(self):
        out = parse_hosts_file(SAMPLE_HOSTS)
        assert "plain-one-per-line.com" in out
        assert "trailing-whitespace.com" in out

    def test_lowercases_domains(self):
        out = parse_hosts_file("0.0.0.0 ADS.EXAMPLE.COM\n")
        assert out == {"ads.example.com"}

    def test_empty_input_returns_empty_set(self):
        assert parse_hosts_file("") == set()
        assert parse_hosts_file("\n\n\n# only comments\n") == set()

    def test_handles_ipv6_prefix(self):
        out = parse_hosts_file(SAMPLE_HOSTS)
        assert "ipv6.example.com" in out


# ─── is_safe_list_url / is_safe_domain ───────────────────────────────────


class TestUrlValidation:
    @pytest.mark.parametrize("url", [
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
        "http://example.com/path",
        "https://phishing.army/download/phishing_army_blocklist.txt",
    ])
    def test_well_formed_urls_accepted(self, url):
        assert is_safe_list_url(url)

    @pytest.mark.parametrize("url", [
        "",
        "not a url",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://old/files",
        "https://has space/path",
        "https://exa<mple.com",
        "https://example.com/path with space",
    ])
    def test_unsafe_urls_rejected(self, url):
        assert not is_safe_list_url(url)


class TestDomainValidation:
    @pytest.mark.parametrize("d", ["example.com", "ads.example.com", "abc-def.io", "a.b.c.de"])
    def test_valid_domains(self, d):
        assert is_safe_domain(d)

    @pytest.mark.parametrize("d", [
        "", " ", "no-tld", ".leading-dot.com", "trailing-dot.com.", "double..dot.com",
        "spaces inside.com", "<script>.com", "shell;cmd.com",
        "a.b.c.d",  # TLD must be ≥ 2 chars
    ])
    def test_invalid_domains(self, d):
        assert not is_safe_domain(d)


# ─── is_domain_blocked ───────────────────────────────────────────────────


class TestDomainBlocked:
    BLOCKED = {"doubleclick.net", "facebook.com", "tracker.specific-site.io"}

    def test_exact_match(self):
        assert is_domain_blocked("doubleclick.net", self.BLOCKED)

    def test_subdomain_match(self):
        assert is_domain_blocked("ads.doubleclick.net", self.BLOCKED)
        assert is_domain_blocked("a.b.c.doubleclick.net", self.BLOCKED)

    def test_proper_subdomain_only_no_partial_suffix_match(self):
        # "mydoubleclick.net" is NOT a subdomain of "doubleclick.net".
        assert not is_domain_blocked("mydoubleclick.net", self.BLOCKED)

    def test_unrelated_domain_not_blocked(self):
        assert not is_domain_blocked("example.com", self.BLOCKED)

    def test_case_insensitive(self):
        assert is_domain_blocked("Ads.Doubleclick.NET", self.BLOCKED)

    def test_handles_trailing_dot(self):
        assert is_domain_blocked("doubleclick.net.", self.BLOCKED)

    def test_empty_input_safe(self):
        assert not is_domain_blocked("", self.BLOCKED)
        assert not is_domain_blocked("   ", self.BLOCKED)


# ─── SubscriptionStore ───────────────────────────────────────────────────


class TestSubscriptionStore:
    def test_load_on_fresh_dir_returns_empty_list(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        assert store.all() == []

    def test_add_then_persist_and_reload(self, tmp_path: Path):
        store1 = SubscriptionStore(root=tmp_path)
        sub = store1.add("Test list", "https://example.com/list.txt")
        assert sub.id
        assert sub.url == "https://example.com/list.txt"
        # New store reads from disk.
        store2 = SubscriptionStore(root=tmp_path)
        all_subs = store2.all()
        assert len(all_subs) == 1
        assert all_subs[0].name == "Test list"

    def test_add_rejects_unsafe_url(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        with pytest.raises(ValueError, match="unsafe list url"):
            store.add("Evil", "javascript:alert(1)")
        assert store.all() == []

    def test_add_rejects_empty_name(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        with pytest.raises(ValueError, match="name required"):
            store.add("", "https://example.com/list.txt")
        with pytest.raises(ValueError, match="name required"):
            store.add("   ", "https://example.com/list.txt")

    def test_add_rejects_unknown_format(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        with pytest.raises(ValueError, match="unsupported format"):
            store.add("X", "https://example.com/list.txt", fmt="easylist")

    def test_add_dedupes_on_url(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        s1 = store.add("First", "https://example.com/list.txt")
        s2 = store.add("Second (with same URL)", "https://example.com/list.txt")
        assert s1.id == s2.id
        assert len(store.all()) == 1

    def test_remove_clears_cache_files(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("Test", "https://example.com/list.txt")
        # Drop a cached body + etag manually.
        store.cache_dir.mkdir(parents=True, exist_ok=True)
        store.cached_body_path(sub.id).write_text("dummy", encoding="utf-8")
        store.cached_etag_path(sub.id).write_text("etag123", encoding="utf-8")
        assert store.remove(sub.id)
        assert not store.cached_body_path(sub.id).exists()
        assert not store.cached_etag_path(sub.id).exists()

    def test_remove_nonexistent_returns_false(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        assert store.remove("not-an-id") is False

    def test_corrupt_manifest_falls_back_to_empty(self, tmp_path: Path):
        (tmp_path).mkdir(exist_ok=True)
        (tmp_path / "subscriptions.json").write_text("{not json", encoding="utf-8")
        store = SubscriptionStore(root=tmp_path)
        assert store.all() == []

    def test_persist_is_atomic(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        store.add("First", "https://example.com/list.txt")
        with patch("scripts.threat_filters.os.replace", side_effect=OSError("simulated")):
            with pytest.raises(OSError, match="simulated"):
                store.add("Second", "https://example.com/other.txt")
        # First sub is still on disk; second never landed.
        store2 = SubscriptionStore(root=tmp_path)
        all_subs = store2.all()
        assert len(all_subs) == 1
        assert all_subs[0].name == "First"


# ─── refresh_subscription ────────────────────────────────────────────────


class _StubDownloader:
    def __init__(self, status: int, body: bytes, etag: str | None = None):
        self.status = status
        self.body = body
        self.etag = etag
        self.calls: list[tuple[str, str | None]] = []

    def fetch(self, url, etag):
        self.calls.append((url, etag))
        return self.status, self.body, self.etag


class TestRefreshSubscription:
    HOSTS_BODY = (
        "0.0.0.0 a.example.com\n"
        "0.0.0.0 b.example.com\n"
        "# end\n"
    )

    def test_first_refresh_downloads_and_persists(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("List", "https://example.com/list.txt")
        downloader = _StubDownloader(200, self.HOSTS_BODY.encode("utf-8"), etag='"abc"')

        out = refresh_subscription(sub, store, downloader=downloader, now=1700000000.0)
        assert out.last_status == "ok"
        assert out.entry_count == 2
        assert out.etag == '"abc"'
        # Cache files exist.
        assert store.cached_body_path(sub.id).exists()
        assert store.cached_etag_path(sub.id).read_text(encoding="utf-8") == '"abc"'

    def test_304_does_not_overwrite_cache(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("L", "https://example.com/list.txt")
        # First refresh: 200 + body.
        refresh_subscription(sub, store, downloader=_StubDownloader(
            200, self.HOSTS_BODY.encode(), etag='"v1"',
        ))
        # Second refresh: 304 — body unchanged.
        body_before = store.cached_body_path(sub.id).read_text(encoding="utf-8")
        out = refresh_subscription(sub, store, downloader=_StubDownloader(304, b"", etag='"v1"'))
        assert out.last_status == "not-modified"
        assert store.cached_body_path(sub.id).read_text(encoding="utf-8") == body_before

    def test_network_error_marks_subscription_error(self, tmp_path: Path):
        import urllib.error
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("L", "https://example.com/list.txt")
        broken = type("B", (), {"fetch": lambda self, url, etag: (_ for _ in ()).throw(
            urllib.error.URLError("connection refused")
        )})()
        out = refresh_subscription(sub, store, downloader=broken)
        assert out.last_status.startswith("error:")

    def test_non_200_marks_error(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("L", "https://example.com/list.txt")
        out = refresh_subscription(sub, store, downloader=_StubDownloader(500, b""))
        assert "HTTP 500" in out.last_status

    def test_conditional_get_sends_etag(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        sub = store.add("L", "https://example.com/list.txt")
        # Initial fetch.
        downloader = _StubDownloader(200, self.HOSTS_BODY.encode(), etag='"first"')
        refresh_subscription(sub, store, downloader=downloader)
        # Reload subscription from disk and refresh again — etag must be sent.
        sub2 = store.find(sub.id)
        assert sub2 is not None
        downloader2 = _StubDownloader(304, b"", etag='"first"')
        refresh_subscription(sub2, store, downloader=downloader2)
        assert downloader2.calls[0][1] == '"first"'


# ─── compile_blocklist ───────────────────────────────────────────────────


class TestCompile:
    def test_unions_across_subscriptions(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        s1 = store.add("L1", "https://example.com/a.txt")
        s2 = store.add("L2", "https://example.com/b.txt")
        refresh_subscription(s1, store, downloader=_StubDownloader(
            200, b"0.0.0.0 a.com\n", etag=None,
        ))
        refresh_subscription(s2, store, downloader=_StubDownloader(
            200, b"0.0.0.0 b.com\n0.0.0.0 a.com\n", etag=None,
        ))
        block = compile_blocklist(store)
        assert block == {"a.com", "b.com"}

    def test_skips_subscriptions_in_error_state(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        s1 = store.add("L1", "https://example.com/a.txt")
        # Force an error state.
        refresh_subscription(s1, store, downloader=_StubDownloader(500, b""))
        block = compile_blocklist(store)
        assert block == set()

    def test_empty_store_returns_empty_blocklist(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        assert compile_blocklist(store) == set()


# ─── refresh_all ─────────────────────────────────────────────────────────


class TestRefreshAll:
    def test_refreshes_each_subscription_once(self, tmp_path: Path):
        store = SubscriptionStore(root=tmp_path)
        store.add("L1", "https://example.com/a.txt")
        store.add("L2", "https://example.com/b.txt")
        downloader = _StubDownloader(200, b"0.0.0.0 a.com\n", etag='"x"')
        refresh_all(store, downloader=downloader)
        assert len(downloader.calls) == 2
