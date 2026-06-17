"""Unit tests for scripts/i2pd_config.py — the i2pd.conf parser/writer."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.i2pd_config import (  # noqa: E402
    is_whitelisted,
    known_keys,
    parse_i2pd_config_text,
    read_i2pd_config,
    validate,
    whitelisted_view,
    write_i2pd_config,
)


SAMPLE_CONF = """\
# i2pd configuration file
# (just a sample for tests)

bandwidth = X
share = 50
notransit = false
floodfill = false

[http]
address = 127.0.0.1
port = 7070

[httpproxy]
address = 127.0.0.1
port = 4444

[socksproxy]
address = 127.0.0.1
port = 4447

[reseed]                  ; this section is not whitelisted
verify = true
"""


# ───────────────────────────── parse + validate ───────────────────────────


class TestParse:
    def test_extracts_top_level_keys(self):
        cfg = parse_i2pd_config_text(SAMPLE_CONF)
        assert cfg["bandwidth"] == "X"
        assert cfg["share"] == "50"
        assert cfg["notransit"] == "false"
        assert cfg["floodfill"] == "false"

    def test_dottifies_section_keys(self):
        cfg = parse_i2pd_config_text(SAMPLE_CONF)
        assert cfg["http.address"] == "127.0.0.1"
        assert cfg["http.port"] == "7070"
        assert cfg["httpproxy.port"] == "4444"
        assert cfg["socksproxy.port"] == "4447"

    def test_skips_comments_and_blank_lines(self):
        cfg = parse_i2pd_config_text("# top comment\n\n; another\nbandwidth = O\n")
        assert cfg == {"bandwidth": "O"}

    def test_inline_comment_is_stripped(self):
        cfg = parse_i2pd_config_text("bandwidth = O   # explanation\n")
        assert cfg["bandwidth"] == "O"

    def test_empty_input_returns_empty_dict(self):
        assert parse_i2pd_config_text("") == {}

    def test_repeated_key_uses_last_value(self):
        cfg = parse_i2pd_config_text("bandwidth = L\nbandwidth = X\n")
        assert cfg["bandwidth"] == "X"

    def test_unknown_section_keys_are_kept(self):
        cfg = parse_i2pd_config_text(SAMPLE_CONF)
        assert cfg["reseed.verify"] == "true"


class TestWhitelist:
    def test_known_keys_includes_all_safe_options(self):
        keys = set(known_keys())
        assert {
            "bandwidth", "share", "notransit", "floodfill",
            "http.address", "http.port",
            "httpproxy.address", "httpproxy.port",
            "socksproxy.address", "socksproxy.port",
        }.issubset(keys)

    def test_is_whitelisted_rejects_unknown(self):
        assert not is_whitelisted("reseed.verify")
        assert not is_whitelisted("../escape")

    def test_whitelisted_view_drops_anything_not_safe(self):
        view = whitelisted_view({"bandwidth": "L", "reseed.verify": "true"})
        assert view == {"bandwidth": "L"}


class TestValidate:
    @pytest.mark.parametrize("v", ["L", "O", "P", "X", "1024", "65536"])
    def test_bandwidth_valid_values(self, v):
        assert validate("bandwidth", v)

    @pytest.mark.parametrize("v", ["", "Z", "abc", "-1", "0", "10000000"])
    def test_bandwidth_invalid_values(self, v):
        assert not validate("bandwidth", v)

    @pytest.mark.parametrize("v", ["0", "50", "100"])
    def test_share_valid_range(self, v):
        assert validate("share", v)

    @pytest.mark.parametrize("v", ["-1", "101", "1000", "abc", ""])
    def test_share_invalid(self, v):
        assert not validate("share", v)

    @pytest.mark.parametrize("v", ["true", "false", "1", "0", "yes", "no"])
    def test_bool_valid_forms(self, v):
        assert validate("notransit", v)
        assert validate("floodfill", v)

    @pytest.mark.parametrize("v", ["maybe", "", "TrueFalse"])
    def test_bool_invalid(self, v):
        assert not validate("notransit", v)

    @pytest.mark.parametrize("v", ["1", "80", "65535"])
    def test_port_valid(self, v):
        assert validate("http.port", v)
        assert validate("httpproxy.port", v)
        assert validate("socksproxy.port", v)

    @pytest.mark.parametrize("v", ["0", "65536", "99999", "-1", "abc"])
    def test_port_invalid(self, v):
        assert not validate("http.port", v)

    @pytest.mark.parametrize("v", ["127.0.0.1", "0.0.0.0", "localhost", "termux.local"])
    def test_address_valid(self, v):
        assert validate("http.address", v)

    @pytest.mark.parametrize("v", ["", " ", "a;b", "a b", "<script>", "host`drop`"])
    def test_address_rejects_unsafe_chars(self, v):
        assert not validate("http.address", v)

    def test_non_whitelisted_key_never_validates(self):
        assert not validate("reseed.verify", "true")


# ───────────────────────────── round-trip ─────────────────────────────────


class TestReadWriteRoundtrip:
    def test_round_trip_preserves_existing_value(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        loaded = read_i2pd_config(cfg_path)
        # Whitelisted view only.
        assert "reseed.verify" not in loaded
        assert loaded["bandwidth"] == "X"
        assert loaded["http.port"] == "7070"

    def test_write_changes_only_targeted_keys(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        write_i2pd_config(cfg_path, {"bandwidth": "L", "http.port": "8080"})

        text = cfg_path.read_text(encoding="utf-8")
        # Updated values are present, in the right places.
        assert "bandwidth = L" in text
        assert "port = 8080" in text  # under [http]
        assert "port = 4444" in text  # [httpproxy] left alone
        # Untouched comments + section ordering preserved.
        assert "# i2pd configuration file" in text
        assert "[reseed]" in text
        # Unrelated section preserved verbatim.
        assert "verify = true" in text

    def test_write_creates_file_if_missing(self, tmp_path: Path):
        cfg_path = tmp_path / "subdir" / "i2pd.conf"
        write_i2pd_config(cfg_path, {"bandwidth": "L", "share": "75"})
        text = cfg_path.read_text(encoding="utf-8")
        assert "bandwidth = L" in text
        assert "share = 75" in text

    def test_write_creates_section_when_section_key_is_new(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text("bandwidth = L\n", encoding="utf-8")
        write_i2pd_config(cfg_path, {"socksproxy.port": "4447"})
        text = cfg_path.read_text(encoding="utf-8")
        assert "[socksproxy]" in text
        assert "port = 4447" in text

    def test_write_normalises_bool_values(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text("notransit = false\n", encoding="utf-8")
        write_i2pd_config(cfg_path, {"notransit": "yes"})
        text = cfg_path.read_text(encoding="utf-8")
        assert "notransit = true" in text


# ─────────────────────────── rejection paths ──────────────────────────────


class TestWriteRejection:
    def test_rejects_non_whitelisted_key(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        original = cfg_path.read_text(encoding="utf-8")

        with pytest.raises(ValueError, match="non-whitelisted"):
            write_i2pd_config(cfg_path, {"reseed.verify": "false"})

        # File is untouched.
        assert cfg_path.read_text(encoding="utf-8") == original

    def test_rejects_invalid_value(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        original = cfg_path.read_text(encoding="utf-8")

        with pytest.raises(ValueError, match="invalid value"):
            write_i2pd_config(cfg_path, {"bandwidth": "Z"})

        assert cfg_path.read_text(encoding="utf-8") == original

    def test_rejects_oversize_port(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        original = cfg_path.read_text(encoding="utf-8")

        with pytest.raises(ValueError):
            write_i2pd_config(cfg_path, {"http.port": "99999"})

        assert cfg_path.read_text(encoding="utf-8") == original


# ─────────────────────────── atomic crash safety ──────────────────────────


class TestAtomicWrite:
    def test_crash_during_replace_leaves_original_intact(self, tmp_path: Path):
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        original = cfg_path.read_text(encoding="utf-8")

        # Make os.replace explode AFTER the tempfile is fully written.
        boom = OSError("simulated replace crash")
        with patch("scripts.i2pd_config.os.replace", side_effect=boom):
            with pytest.raises(OSError, match="simulated replace crash"):
                write_i2pd_config(cfg_path, {"bandwidth": "L"})

        # Original file is unmodified.
        assert cfg_path.read_text(encoding="utf-8") == original
        # And the tempfile was cleaned up.
        leftover = list(tmp_path.glob(".i2pd_conf_*"))
        assert leftover == []

    def test_partial_write_does_not_clobber_target(self, tmp_path: Path):
        """If the write to the tempfile fails before replace, the target
        should still be untouched."""
        cfg_path = tmp_path / "i2pd.conf"
        cfg_path.write_text(SAMPLE_CONF, encoding="utf-8")
        original = cfg_path.read_text(encoding="utf-8")

        real_fdopen = os.fdopen
        def boom_fdopen(*args, **kwargs):
            f = real_fdopen(*args, **kwargs)
            real_write = f.write
            def angry_write(*a, **kw):
                real_write(*a, **kw)  # let some bytes through
                raise IOError("disk full")
            f.write = angry_write
            return f

        with patch("scripts.i2pd_config.os.fdopen", side_effect=boom_fdopen):
            with pytest.raises(IOError, match="disk full"):
                write_i2pd_config(cfg_path, {"bandwidth": "L"})

        assert cfg_path.read_text(encoding="utf-8") == original
