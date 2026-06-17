"""
Shared pytest fixtures for the Echelon sync daemon test suite.

Every test gets:
  - a fresh, isolated webroot (tempdir) instead of polluting ~/echelon-eepsites
  - a daemon HTTP server bound to a random localhost port
  - a small `client` helper for talking to it
"""
from __future__ import annotations

import contextlib
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

# Make `scripts/echelon_sync_daemon.py` importable as a module without
# polluting the user's environment.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def isolated_root(tmp_path, monkeypatch):
    """Point ECHELON_SYNC_ROOT at a tempdir for the duration of the test."""
    root = tmp_path / "echelon-eepsites"
    monkeypatch.setenv("ECHELON_SYNC_ROOT", str(root))
    return root


@pytest.fixture
def daemon(isolated_root, monkeypatch):
    """Boot the sync daemon on a random localhost port. Returns (base_url, root_path)."""
    port = _free_port()
    monkeypatch.setenv("ECHELON_SYNC_PORT", str(port))
    monkeypatch.setenv("ECHELON_SYNC_HOST", "127.0.0.1")
    # Don't actually sleep between WF cells in tests.
    monkeypatch.setenv("ECHELON_WF_PACING_BUDGET_S", "0")

    # Re-import the module so it picks up the env vars. We have to be
    # careful: the module reads HOST/PORT/ROOT at import time. So drop
    # any cached module first.
    import importlib
    if "scripts.echelon_sync_daemon" in sys.modules:
        del sys.modules["scripts.echelon_sync_daemon"]
    daemon_mod = importlib.import_module("scripts.echelon_sync_daemon")

    server = ThreadingHTTPServer((daemon_mod.HOST, daemon_mod.PORT), daemon_mod.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    # Give the server a beat to actually accept connections.
    time.sleep(0.05)

    base_url = f"http://{daemon_mod.HOST}:{daemon_mod.PORT}"
    try:
        yield base_url, isolated_root, daemon_mod
    finally:
        server.shutdown()
        server.server_close()


class DaemonClient:
    def __init__(self, base_url: str):
        self.base = base_url

    def request(self, path: str, method: str = "GET", body=None, headers=None, timeout: float = 5.0):
        url = f"{self.base}{path}"
        data = None
        hdrs = dict(headers or {})
        if body is not None:
            data = json.dumps(body).encode()
            hdrs.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                parsed = json.loads(raw.decode()) if raw else None
                return resp.status, dict(resp.headers), parsed
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                parsed = json.loads(raw.decode()) if raw else None
            except Exception:  # noqa: BLE001
                parsed = None
            return e.code, dict(e.headers), parsed


@pytest.fixture
def client(daemon):
    base_url, root, _mod = daemon
    return DaemonClient(base_url), root
