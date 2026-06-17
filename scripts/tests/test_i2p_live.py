"""
LIVE I2P network integration test — ground truth.

This is the second laboratory layer: it talks to the REAL I2P network
through a real i2pd, fetches a real, long-lived eepsite, runs it through
the full Echelon pipeline (i2p_fetch -> html_sanitizer), and asserts the
deanonymization invariants hold on genuine network content.

It is SKIPPED by default (CI stays deterministic — the high-fidelity
replay in test_i2p_integration.py covers the logic). Enable it on a
machine that has i2pd integrated into the network:

    ECHELON_I2P_LIVE=1 \
    ECHELON_I2P_PROXY_PORT=4444 \
    python3 -m pytest scripts/tests/test_i2p_live.py -v

Prereqs (see docs/networking.md):
  - i2pd running, HTTP proxy reachable on ECHELON_I2P_PROXY_PORT
    (default 4444; the dev lab used 4446).
  - i2pd integrated enough to resolve eepsites. On a hard NAT this
    requires the Yggdrasil overlay (docs/networking.md §3) — verified
    working during development on macOS arm64 behind symmetric NAT.

Targets are addressed by b32 (no addressbook subscription needed).
reg.i2p is one of the most stable, long-lived eepsites on the network.
"""
from __future__ import annotations

import os
import re
import time

import pytest

from scripts import i2p_fetch
from scripts.i2p_fetch import I2pFetchError, fetch_eepsite
from scripts import html_sanitizer

LIVE = os.environ.get("ECHELON_I2P_LIVE", "") == "1"
PROXY_HOST = os.environ.get("ECHELON_I2P_PROXY_HOST", "127.0.0.1")
PROXY_PORT = int(os.environ.get("ECHELON_I2P_PROXY_PORT", "4444"))

# Long-lived, stable eepsites addressed by b32 (addressbook-independent).
# reg.i2p — the hostname registry; almost always reachable.
REG_I2P_B32 = "shx5vqsw7usdaunyzr2qmes2fq37oumybpudrd4jjj4e4vk4uusa.b32.i2p"

# Per-fetch budget; cold leaseset lookups + tunnel builds can be slow.
FETCH_TIMEOUT_BUDGET = 150.0

pytestmark = pytest.mark.skipif(
    not LIVE,
    reason="live I2P test; set ECHELON_I2P_LIVE=1 with a running, integrated i2pd",
)


def _fetch_with_retry(b32: str, attempts: int = 3):
    """Live network is probabilistic; retry transient tunnel/leaseset
    failures a few times before giving up."""
    last: Exception | None = None
    deadline = time.time() + FETCH_TIMEOUT_BUDGET
    for _ in range(attempts):
        if time.time() > deadline:
            break
        try:
            return fetch_eepsite(b32, proxy_host=PROXY_HOST, proxy_port=PROXY_PORT)
        except I2pFetchError as e:
            last = e
            if e.reason in ("tunnel-timeout", "rate-limited", "unknown"):
                time.sleep(5)
                continue
            raise
    if last:
        raise last
    raise RuntimeError("no fetch attempted")


def test_live_proxy_is_reachable():
    """Sanity: the i2pd HTTP proxy is actually listening."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(3)
        assert s.connect_ex((PROXY_HOST, PROXY_PORT)) == 0, (
            f"i2pd proxy not reachable on {PROXY_HOST}:{PROXY_PORT}"
        )


def test_live_fetch_reg_i2p():
    """Fetch the real reg.i2p homepage through i2pd."""
    result = _fetch_with_retry(REG_I2P_B32)
    assert result.status == 200
    assert b"<html" in result.body.lower()
    assert len(result.body) > 200


def test_live_fetch_then_sanitize_holds_invariants():
    """The full pipeline on a REAL eepsite: fetch + sanitize, then assert
    the deanonymization invariants (no clearnet, no script) hold on
    genuine network content."""
    result = _fetch_with_retry(REG_I2P_B32)
    safe, report = html_sanitizer.sanitize_html(
        result.body.decode("utf-8", errors="replace"), result.final_url,
    )
    low = safe.lower()

    # No surviving clearnet origin.
    clearnet = [
        m.group(0) for m in re.finditer(r"https?://([a-z0-9.\-]+)", low)
        if not m.group(1).endswith(".i2p")
    ]
    assert clearnet == [], f"clearnet leaked from real eepsite: {clearnet[:5]}"

    # No script / handlers.
    assert "<script" not in low
    assert not re.search(r"\son[a-z]+\s*=", low)

    # CSP injected.
    assert "Content-Security-Policy" in safe
    assert "connect-src" in safe

    # The sanitizer actually did work on the real page.
    assert report.rewritten_in_network >= 1


def test_live_bogus_eepsite_is_dns_failed():
    """A non-existent .i2p host must classify as dns-failed against the
    REAL i2pd (which returns its 500 'Host not found' proxy error)."""
    bogus = "echelon-definitely-not-a-real-eepsite-zzz999.i2p"
    with pytest.raises(I2pFetchError) as exc:
        fetch_eepsite(bogus, proxy_host=PROXY_HOST, proxy_port=PROXY_PORT)
    assert exc.value.reason == "dns-failed"
