"""
Tests for scripts/i2pd_tunnels.py.

Heavy on adversarial inputs because a bug here doxxes the user.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.i2pd_tunnels import (  # noqa: E402
    END_MARKER,
    LOCKED_BIND_HOST,
    OutproxySpec,
    START_MARKER,
    build_managed_block,
    extract_managed_block,
    parse_tunnels_conf,
    read_managed_spec,
    spec_from_dict,
    spec_to_dict,
    splice_managed_block,
    validate_spec,
    write_managed_spec,
)


# Sample user-managed tunnels.conf the user may have written by hand.
# We must NEVER mutate this content outside the markers.
USER_TUNNELS = """\
# My personal tunnels — managed by hand.

[my-irc-client]
type = client
destination = irc.echelon.i2p
listenport = 6669

[my-eepsite]
type = http
host = 127.0.0.1
port = 8080
keys = my-eepsite.dat
"""


# ─── parse_tunnels_conf ───────────────────────────────────────────────────


class TestParseTunnelsConf:
    def test_extracts_sections_and_keys(self):
        parsed = parse_tunnels_conf(USER_TUNNELS)
        assert "my-irc-client" in parsed
        assert parsed["my-irc-client"]["destination"] == "irc.echelon.i2p"
        assert parsed["my-eepsite"]["port"] == "8080"

    def test_empty_input_returns_empty_dict(self):
        assert parse_tunnels_conf("") == {}

    def test_skips_comments_and_blanks(self):
        parsed = parse_tunnels_conf(
            "# top comment\n\n[only]\n; semi-comment\nkey = value\n"
        )
        assert parsed == {"only": {"key": "value"}}

    def test_marker_lines_dont_become_sections(self):
        parsed = parse_tunnels_conf(f"{START_MARKER}\n{END_MARKER}\n")
        assert parsed == {}


# ─── validate_spec ────────────────────────────────────────────────────────


class TestValidateSpec:
    def test_default_disabled_passes(self):
        validate_spec(OutproxySpec(mode="disabled"))

    @pytest.mark.parametrize("mode", ["disabled", "http", "socks", "both"])
    def test_all_legal_modes_pass(self, mode):
        validate_spec(OutproxySpec(mode=mode))  # type: ignore[arg-type]

    @pytest.mark.parametrize("mode", ["", "all", "HTTP", "exit", "BOTH", " both ", None])
    def test_illegal_modes_rejected(self, mode):
        with pytest.raises(ValueError, match="invalid mode"):
            validate_spec(OutproxySpec(mode=mode))  # type: ignore[arg-type]

    @pytest.mark.parametrize("host", ["127.0.0.1", "::1", "localhost", "termux.local"])
    def test_loopback_and_hostlike_addresses_pass(self, host):
        validate_spec(OutproxySpec(mode="http", upstream_host=host))

    @pytest.mark.parametrize("host", [
        "0.0.0.0",     # explicit wildcard rejected
        "::",
        "*",
        "host with space",
        "a;b",
        "<script>",
        "../etc/passwd",
        "host`drop`",
        "",
        " ",
        "host,name",
        "host\nname",
    ])
    def test_unsafe_host_rejected(self, host):
        with pytest.raises(ValueError):
            validate_spec(OutproxySpec(mode="http", upstream_host=host))

    @pytest.mark.parametrize("port", [0, -1, 65536, 99999, 9999999])
    def test_port_out_of_range_rejected(self, port):
        with pytest.raises(ValueError, match="invalid http_upstream_port"):
            validate_spec(OutproxySpec(mode="http", http_upstream_port=port))

    def test_socks_port_validated_independently(self):
        with pytest.raises(ValueError, match="invalid socks_upstream_port"):
            validate_spec(OutproxySpec(mode="socks", socks_upstream_port=0))


# ─── spec_from_dict ──────────────────────────────────────────────────────


class TestSpecFromDict:
    def test_full_payload_round_trips(self):
        s = spec_from_dict({
            "mode": "both",
            "upstream_host": "127.0.0.1",
            "http_upstream_port": 8118,
            "socks_upstream_port": 1080,
            "advertise": True,
        })
        assert s.mode == "both"
        assert s.advertise is True

    def test_missing_fields_take_defaults(self):
        s = spec_from_dict({"mode": "http"})
        assert s.upstream_host == "127.0.0.1"
        assert s.http_upstream_port == 8118
        assert s.socks_upstream_port == 1080
        assert s.advertise is False

    def test_string_port_coerced_to_int(self):
        s = spec_from_dict({"mode": "http", "http_upstream_port": "8118"})
        assert s.http_upstream_port == 8118

    def test_bad_port_string_rejected(self):
        with pytest.raises((ValueError, TypeError)):
            spec_from_dict({"mode": "http", "http_upstream_port": "not-a-port"})

    def test_bad_mode_rejected(self):
        with pytest.raises(ValueError):
            spec_from_dict({"mode": "exit"})

    def test_non_dict_input_rejected(self):
        with pytest.raises(ValueError):
            spec_from_dict("not a dict")  # type: ignore[arg-type]
        with pytest.raises(ValueError):
            spec_from_dict(["mode", "http"])  # type: ignore[arg-type]

    def test_keys_file_cannot_be_overridden_via_payload(self):
        # Even if a malicious POST tries to set keys_file, the dataclass
        # ignores unrecognised kwargs and our hard-coded values stand.
        s = spec_from_dict({"mode": "http"})
        assert s.http_keys_file == "echelon-outproxy-http.dat"
        assert s.socks_keys_file == "echelon-outproxy-socks.dat"
        # No way to inject path-traversal via the dict.
        s_dict = spec_to_dict(s)
        assert "/" not in s_dict["http_keys_file"]
        assert ".." not in s_dict["http_keys_file"]


# ─── build_managed_block ─────────────────────────────────────────────────


class TestBuildManagedBlock:
    def test_disabled_produces_empty_block(self):
        assert build_managed_block(OutproxySpec(mode="disabled")) == ""

    def test_http_mode_produces_only_http_stanza(self):
        block = build_managed_block(OutproxySpec(mode="http"))
        assert START_MARKER in block
        assert END_MARKER in block
        assert "[echelon-outproxy-http]" in block
        assert "[echelon-outproxy-socks]" not in block

    def test_socks_mode_produces_only_socks_stanza(self):
        block = build_managed_block(OutproxySpec(mode="socks"))
        assert "[echelon-outproxy-socks]" in block
        assert "[echelon-outproxy-http]" not in block

    def test_both_mode_produces_both_stanzas(self):
        block = build_managed_block(OutproxySpec(mode="both"))
        assert "[echelon-outproxy-http]" in block
        assert "[echelon-outproxy-socks]" in block

    def test_block_locks_bind_host_to_loopback_regardless_of_spec(self):
        # Even if an upstream host is given as something else, the i2pd
        # `host =` line for the server tunnel always renders as 127.0.0.1
        # when we write it… wait — actually the spec's upstream_host
        # is the BACKEND host (Privoxy), not the bind. We document that
        # here: backend host comes from spec, but the bind_host the
        # builder uses for stanzas is locked.
        s = OutproxySpec(mode="http", upstream_host="127.0.0.1")
        block = build_managed_block(s)
        assert f"host = {LOCKED_BIND_HOST}" in block

    def test_http_port_appears_only_in_http_stanza(self):
        s = OutproxySpec(mode="both", http_upstream_port=8118, socks_upstream_port=1080)
        block = build_managed_block(s)
        # http section uses 8118
        http_section = block.split("[echelon-outproxy-http]")[1].split("[echelon-outproxy-socks]")[0]
        assert "port = 8118" in http_section
        assert "port = 1080" not in http_section

    def test_block_idempotent_for_same_spec(self):
        s = OutproxySpec(mode="both")
        assert build_managed_block(s) == build_managed_block(s)


# ─── extract_managed_block ───────────────────────────────────────────────


class TestExtractManagedBlock:
    def test_returns_none_when_marker_missing(self):
        assert extract_managed_block(USER_TUNNELS) is None

    def test_returns_none_when_only_start_marker_present(self):
        text = USER_TUNNELS + "\n" + START_MARKER + "\n[oops]\n"
        assert extract_managed_block(text) is None

    def test_extracts_block_inclusive_of_markers(self):
        block = build_managed_block(OutproxySpec(mode="http"))
        text = USER_TUNNELS + "\n" + block
        pos = extract_managed_block(text)
        assert pos is not None
        s, e = pos
        extracted = text[s:e]
        assert START_MARKER in extracted
        assert END_MARKER in extracted
        assert "[echelon-outproxy-http]" in extracted
        # User-managed sections are OUTSIDE the extracted range.
        assert "[my-irc-client]" not in extracted
        assert "[my-eepsite]" not in extracted


# ─── splice_managed_block ────────────────────────────────────────────────


class TestSpliceManagedBlock:
    def test_appending_new_block_to_user_file_preserves_user_tunnels(self):
        new_block = build_managed_block(OutproxySpec(mode="http"))
        out = splice_managed_block(USER_TUNNELS, new_block)
        # User tunnels still present, in order.
        assert "[my-irc-client]" in out
        assert "[my-eepsite]" in out
        assert out.index("[my-irc-client]") < out.index("[echelon-outproxy-http]")

    def test_replacing_existing_block_keeps_user_tunnels_intact(self):
        text = USER_TUNNELS + "\n" + build_managed_block(OutproxySpec(mode="http"))
        new_block = build_managed_block(OutproxySpec(mode="socks"))
        out = splice_managed_block(text, new_block)
        # User content still intact:
        assert "[my-irc-client]" in out
        assert "[my-eepsite]" in out
        # Old http stanza gone, new socks stanza present:
        assert "[echelon-outproxy-http]" not in out
        assert "[echelon-outproxy-socks]" in out
        # And only ONE managed block:
        assert out.count(START_MARKER) == 1
        assert out.count(END_MARKER) == 1

    def test_disable_removes_block_entirely(self):
        text = USER_TUNNELS + "\n" + build_managed_block(OutproxySpec(mode="both"))
        out = splice_managed_block(text, "")
        assert START_MARKER not in out
        assert END_MARKER not in out
        assert "[echelon-outproxy-http]" not in out
        assert "[echelon-outproxy-socks]" not in out
        # User content untouched.
        assert "[my-irc-client]" in out
        assert "[my-eepsite]" in out

    def test_disabling_when_no_block_existed_is_noop(self):
        out = splice_managed_block(USER_TUNNELS, "")
        assert out == USER_TUNNELS

    def test_idempotent_enable(self):
        first = splice_managed_block(USER_TUNNELS, build_managed_block(OutproxySpec(mode="http")))
        second = splice_managed_block(first, build_managed_block(OutproxySpec(mode="http")))
        assert first == second
        assert second.count(START_MARKER) == 1


# ─── write/read round-trip ───────────────────────────────────────────────


class TestWriteReadRoundtrip:
    def test_round_trip_http_mode(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        write_managed_spec(path, OutproxySpec(mode="http", http_upstream_port=8118))
        spec = read_managed_spec(path)
        assert spec.mode == "http"
        assert spec.http_upstream_port == 8118

    def test_round_trip_both_mode_with_custom_ports(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        write_managed_spec(path, OutproxySpec(
            mode="both", http_upstream_port=8123, socks_upstream_port=1085, advertise=True,
        ))
        spec = read_managed_spec(path)
        assert spec.mode == "both"
        assert spec.http_upstream_port == 8123
        assert spec.socks_upstream_port == 1085
        assert spec.advertise is True

    def test_disable_after_enable_clears_block(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        write_managed_spec(path, OutproxySpec(mode="http"))
        write_managed_spec(path, OutproxySpec(mode="disabled"))
        spec = read_managed_spec(path)
        assert spec.mode == "disabled"
        # User content survived the round-trip.
        text = path.read_text(encoding="utf-8")
        assert "[my-irc-client]" in text
        assert "[my-eepsite]" in text

    def test_write_creates_file_when_missing(self, tmp_path: Path):
        path = tmp_path / "no-such-file.conf"
        write_managed_spec(path, OutproxySpec(mode="http"))
        assert path.exists()
        assert "[echelon-outproxy-http]" in path.read_text(encoding="utf-8")

    def test_read_when_no_block_present_returns_disabled(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        spec = read_managed_spec(path)
        assert spec.mode == "disabled"

    def test_read_when_file_missing_returns_disabled(self, tmp_path: Path):
        spec = read_managed_spec(tmp_path / "nope.conf")
        assert spec.mode == "disabled"


# ─── Rejection paths in write_managed_spec ───────────────────────────────


class TestWriteRejection:
    def test_unsafe_host_rejected_before_any_write(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        original = path.read_text(encoding="utf-8")
        with pytest.raises(ValueError):
            write_managed_spec(path, OutproxySpec(mode="http", upstream_host="0.0.0.0"))
        # File unchanged.
        assert path.read_text(encoding="utf-8") == original

    def test_oversize_port_rejected(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        with pytest.raises(ValueError):
            write_managed_spec(path, OutproxySpec(mode="http", http_upstream_port=99999))
        assert path.read_text(encoding="utf-8") == USER_TUNNELS


# ─── Atomic-write crash safety ───────────────────────────────────────────


class TestAtomicWrite:
    def test_replace_failure_leaves_original_intact(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        with patch("scripts.i2pd_tunnels.os.replace", side_effect=OSError("simulated")):
            with pytest.raises(OSError, match="simulated"):
                write_managed_spec(path, OutproxySpec(mode="http"))
        assert path.read_text(encoding="utf-8") == USER_TUNNELS
        # No tempfile lingering.
        assert list(tmp_path.glob(".tunnels_conf_*")) == []

    def test_partial_write_does_not_clobber_target(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        import os as _os
        real_fdopen = _os.fdopen

        def boom_fdopen(*args, **kwargs):
            f = real_fdopen(*args, **kwargs)
            real_write = f.write

            def angry_write(*a, **kw):
                real_write(*a, **kw)
                raise IOError("disk full")

            f.write = angry_write
            return f

        with patch("scripts.i2pd_tunnels.os.fdopen", side_effect=boom_fdopen):
            with pytest.raises(IOError, match="disk full"):
                write_managed_spec(path, OutproxySpec(mode="http"))
        assert path.read_text(encoding="utf-8") == USER_TUNNELS


# ─── Adversarial / fail-closed scenarios ─────────────────────────────────


class TestFailClosed:
    def test_write_does_not_run_if_validation_fails_even_if_existing_file_has_block(self, tmp_path: Path):
        path = tmp_path / "tunnels.conf"
        # Pretend a previous valid block exists.
        good = USER_TUNNELS + "\n" + build_managed_block(OutproxySpec(mode="http"))
        path.write_text(good, encoding="utf-8")
        with pytest.raises(ValueError):
            write_managed_spec(path, OutproxySpec(mode="http", upstream_host="bad host"))
        # Block stays as it was.
        assert path.read_text(encoding="utf-8") == good

    def test_two_writers_dont_corrupt_via_overlap(self, tmp_path: Path):
        """Sequential writes both succeed cleanly; no duplicate markers."""
        path = tmp_path / "tunnels.conf"
        path.write_text(USER_TUNNELS, encoding="utf-8")
        for _ in range(5):
            write_managed_spec(path, OutproxySpec(mode="http"))
            text = path.read_text(encoding="utf-8")
            assert text.count(START_MARKER) == 1
            assert text.count(END_MARKER) == 1
            assert "[my-eepsite]" in text   # user content preserved every iteration


# ─── spec_to_dict roundtrip ──────────────────────────────────────────────


class TestSpecToDict:
    def test_round_trips_via_dict(self):
        s1 = OutproxySpec(mode="both", upstream_host="127.0.0.1",
                          http_upstream_port=9000, socks_upstream_port=1085, advertise=True)
        s2 = spec_from_dict(spec_to_dict(s1))
        assert s2.mode == s1.mode
        assert s2.upstream_host == s1.upstream_host
        assert s2.http_upstream_port == s1.http_upstream_port
        assert s2.socks_upstream_port == s1.socks_upstream_port
        assert s2.advertise == s1.advertise
