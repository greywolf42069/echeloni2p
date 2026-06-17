"""Tests for scripts/auth.py — token gen + validation + middleware logic.

The daemon-side wiring is exercised in test_auth_endpoint.py.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts import auth as auth_mod


class TestSecret:
    def test_load_or_create_writes_64_hex(self, tmp_path):
        secret_file = tmp_path / "secret"
        token = auth_mod.load_or_create_secret(secret_file)
        assert len(token) == auth_mod.TOKEN_BYTES * 2
        # All hex chars
        assert all(c in "0123456789abcdef" for c in token)
        # File written
        assert secret_file.exists()
        assert secret_file.read_text(encoding="utf-8").strip() == token

    def test_load_or_create_is_idempotent(self, tmp_path):
        secret_file = tmp_path / "secret"
        first = auth_mod.load_or_create_secret(secret_file)
        second = auth_mod.load_or_create_secret(secret_file)
        assert first == second

    def test_load_or_create_creates_parent_dir(self, tmp_path):
        secret_file = tmp_path / "nested" / "dir" / "secret"
        token = auth_mod.load_or_create_secret(secret_file)
        assert secret_file.parent.exists()
        assert len(token) == 64

    def test_chmod_0600_when_supported(self, tmp_path):
        secret_file = tmp_path / "secret"
        auth_mod.load_or_create_secret(secret_file)
        if hasattr(os, "stat") and hasattr(secret_file, "stat"):
            mode = secret_file.stat().st_mode & 0o777
            # Either 0o600 (POSIX) or platform-dependent — accept any
            # mode whose group/other read bits are clear.
            assert mode & 0o077 == 0 or os.name == "nt"

    def test_two_invocations_produce_same_token(self, tmp_path):
        secret_file = tmp_path / "secret"
        a = auth_mod.load_or_create_secret(secret_file)
        b = auth_mod.load_or_create_secret(secret_file)
        assert a == b

    def test_secret_path_env_override(self, monkeypatch, tmp_path):
        custom = tmp_path / "custom-secret"
        monkeypatch.setenv("ECHELON_SECRET_PATH", str(custom))
        assert auth_mod.secret_path() == custom


class TestRequireAuthEnabled:
    @pytest.mark.parametrize("val,expected", [
        ("1", True),
        ("true", True),
        ("yes", True),
        ("on", True),
        ("TRUE", True),
        ("0", False),
        ("false", False),
        ("no", False),
        ("off", False),
        ("", False),
        ("garbage", False),
    ])
    def test_parses_env_var(self, monkeypatch, val, expected):
        monkeypatch.setenv("ECHELON_REQUIRE_AUTH", val)
        assert auth_mod.require_auth_enabled() is expected

    def test_unset_is_false(self, monkeypatch):
        monkeypatch.delenv("ECHELON_REQUIRE_AUTH", raising=False)
        assert auth_mod.require_auth_enabled() is False


class TestValidateToken:
    def test_matching_token_validates(self):
        assert auth_mod.validate_token("abc123", "abc123") is True

    def test_mismatched_token_rejected(self):
        assert auth_mod.validate_token("abc123", "abc124") is False

    def test_empty_token_rejected(self):
        assert auth_mod.validate_token("", "abc123") is False
        assert auth_mod.validate_token(None, "abc123") is False

    def test_empty_expected_rejected(self):
        assert auth_mod.validate_token("abc123", "") is False


class TestAuthStatusFor:
    EXPECTED = "secret-token-abc"

    def test_no_require_auth_lets_everything_through(self):
        result = auth_mod.auth_status_for(
            "/publish",
            submitted_token=None,
            expected_token=self.EXPECTED,
            require_auth=False,
        )
        assert result is None

    def test_public_route_skips_auth(self):
        for route in auth_mod.PUBLIC_ROUTES:
            result = auth_mod.auth_status_for(
                route,
                submitted_token=None,
                expected_token=self.EXPECTED,
                require_auth=True,
            )
            assert result is None, f"public route {route} should not require auth"

    def test_missing_token_rejected_with_401(self):
        result = auth_mod.auth_status_for(
            "/publish",
            submitted_token=None,
            expected_token=self.EXPECTED,
            require_auth=True,
        )
        assert result is not None
        assert result[0] == 401

    def test_wrong_token_rejected_with_401(self):
        result = auth_mod.auth_status_for(
            "/publish",
            submitted_token="wrong",
            expected_token=self.EXPECTED,
            require_auth=True,
        )
        assert result is not None
        assert result[0] == 401

    def test_correct_token_passes(self):
        result = auth_mod.auth_status_for(
            "/publish",
            submitted_token=self.EXPECTED,
            expected_token=self.EXPECTED,
            require_auth=True,
        )
        assert result is None

    def test_no_secret_on_disk_returns_503(self):
        result = auth_mod.auth_status_for(
            "/publish",
            submitted_token="something",
            expected_token=None,
            require_auth=True,
        )
        assert result is not None
        assert result[0] == 503


class TestPublicRoutes:
    def test_health_is_public(self):
        assert auth_mod.is_public_route("/health") is True

    def test_auth_info_is_public(self):
        assert auth_mod.is_public_route("/auth/info") is True

    def test_publish_is_not_public(self):
        assert auth_mod.is_public_route("/publish") is False

    def test_eepgen_is_not_public(self):
        assert auth_mod.is_public_route("/eepgen/complete") is False
