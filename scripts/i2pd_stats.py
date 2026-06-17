"""
i2pd web console scraper.

i2pd ships a small HTML web console at http://127.0.0.1:7070/ by default.
This module turns its main page into a clean JSON-friendly dict so the
Echelon UI stops needing Math.random() telemetry.

Two functions:
  - parse_i2pd_main_page(html: str) -> dict       (pure, no network)
  - fetch_i2pd_stats(host, port, timeout) -> dict (does the HTTP GET)

The parser is tolerant: every field is optional. If we can't find a piece
of data we default to 0 / None / "Unknown" rather than raising. Callers
get back a single dict whose `running` key tells them whether i2pd was
reachable at all.
"""
from __future__ import annotations

import re
import urllib.error
import urllib.request
from typing import Optional

# ─── unit conversion ──────────────────────────────────────────────────────

# i2pd uses binary prefixes (KiB / MiB / GiB) and decimal too in some places.
# We normalise everything to bytes and bytes-per-second.
_BYTE_UNITS = {
    "B":   1,
    "KB":  1000,
    "MB":  1000 ** 2,
    "GB":  1000 ** 3,
    "TB":  1000 ** 4,
    "KiB": 1024,
    "MiB": 1024 ** 2,
    "GiB": 1024 ** 3,
    "TiB": 1024 ** 4,
}


def _to_bytes(value: float, unit: str) -> int:
    return int(value * _BYTE_UNITS.get(unit.replace("/s", ""), 1))


# ─── individual extractors ────────────────────────────────────────────────


def _extract_text(html: str, label: str) -> Optional[str]:
    """Find <b>Label:</b> X and return X (stripped, no markup)."""
    pattern = rf"<b>\s*{re.escape(label)}\s*:\s*</b>\s*([^<]+)"
    m = re.search(pattern, html, flags=re.I)
    if not m:
        return None
    return m.group(1).strip()


def _extract_number(html: str, label: str) -> Optional[float]:
    """Find <b>Label:</b> N (integer or float) and return N."""
    pattern = rf"<b>\s*{re.escape(label)}\s*:\s*</b>\s*([\d.,]+)"
    m = re.search(pattern, html, flags=re.I)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_version(html: str) -> Optional[str]:
    """Pull the i2pd version out of the <title> tag if it's there."""
    m = re.search(r"<title>[^<]*?(\d+\.\d+(?:\.\d+)?)", html, flags=re.I)
    return m.group(1) if m else None


# ─── compound parsers ─────────────────────────────────────────────────────


_HMS_RE = re.compile(r"(\d+):(\d{2}):(\d{2})")
_DAYS_RE = re.compile(r"(\d+)\s*days?", re.I)
_HOURS_RE = re.compile(r"(\d+)\s*hours?", re.I)
_MINUTES_RE = re.compile(r"(\d+)\s*min(?:ute)?s?", re.I)
_SECONDS_RE = re.compile(r"(\d+)\s*sec(?:ond)?s?", re.I)


def _parse_uptime(text: str) -> int:
    """Parse i2pd's various uptime formats and return total seconds.

    Examples we accept:
      '0 days, 12:34:56'
      '1 days, 0 hours, 1 minutes, 2 seconds'
      '00:42:17'
      '5 minutes'
    """
    if not text:
        return 0

    days = int(_DAYS_RE.search(text).group(1)) if _DAYS_RE.search(text) else 0
    seconds_total = days * 86400

    hms = _HMS_RE.search(text)
    if hms:
        h, m, s = int(hms.group(1)), int(hms.group(2)), int(hms.group(3))
        seconds_total += h * 3600 + m * 60 + s
    else:
        h_m = _HOURS_RE.search(text)
        m_m = _MINUTES_RE.search(text)
        s_m = _SECONDS_RE.search(text)
        if h_m:
            seconds_total += int(h_m.group(1)) * 3600
        if m_m:
            seconds_total += int(m_m.group(1)) * 60
        if s_m:
            seconds_total += int(s_m.group(1))

    return seconds_total


_BANDWIDTH_TOTAL_RE = re.compile(r"([\d.]+)\s*([KMGT]?i?B)\b")
_BANDWIDTH_RATE_RE = re.compile(r"\(\s*([\d.]+)\s*([KMGT]?i?B/s)")


def _parse_bandwidth_pair(text: str) -> tuple[int, int]:
    """Parse '234.56 MiB (12.34 KiB/s)' into (totalBytes, bytesPerSecond)."""
    if not text:
        return (0, 0)
    total = 0
    rate = 0
    m = _BANDWIDTH_TOTAL_RE.search(text)
    if m:
        try:
            total = _to_bytes(float(m.group(1)), m.group(2))
        except ValueError:
            pass
    r = _BANDWIDTH_RATE_RE.search(text)
    if r:
        try:
            rate = _to_bytes(float(r.group(1)), r.group(2))
        except ValueError:
            pass
    return (total, rate)


# ─── public API ───────────────────────────────────────────────────────────


def empty_stats() -> dict:
    """The shape we always return — fields default to falsy values."""
    return {
        "running": False,
        "version": None,
        "networkStatus": "Unknown",
        "uptimeSeconds": 0,
        "tunnelCreationSuccessPercent": 0,
        "receivedBps": 0,
        "sentBps": 0,
        "transitBps": 0,
        "totalReceivedBytes": 0,
        "totalSentBytes": 0,
        "totalTransitBytes": 0,
        "routers": 0,
        "floodfills": 0,
        "leaseSets": 0,
        "tunnelsClient": 0,
        "tunnelsTransit": 0,
    }


def parse_i2pd_main_page(html: str) -> dict:
    """Convert i2pd's main webconsole HTML into a stats dict.

    The parser is intentionally forgiving: every field is optional. If we
    can't extract a field we leave it at its `empty_stats()` default.
    """
    out = empty_stats()
    if not isinstance(html, str) or not html:
        return out

    out["running"] = True
    out["version"] = _extract_version(html)

    network_status = _extract_text(html, "Network status")
    if network_status:
        out["networkStatus"] = network_status

    out["uptimeSeconds"] = _parse_uptime(_extract_text(html, "Uptime") or "")

    success_rate = _extract_number(html, "Tunnel creation success rate")
    if success_rate is not None:
        out["tunnelCreationSuccessPercent"] = int(success_rate)

    recv_total, recv_rate = _parse_bandwidth_pair(_extract_text(html, "Received") or "")
    sent_total, sent_rate = _parse_bandwidth_pair(_extract_text(html, "Sent") or "")
    transit_total, transit_rate = _parse_bandwidth_pair(_extract_text(html, "Transit") or "")
    out["totalReceivedBytes"], out["receivedBps"] = recv_total, recv_rate
    out["totalSentBytes"], out["sentBps"] = sent_total, sent_rate
    out["totalTransitBytes"], out["transitBps"] = transit_total, transit_rate

    for label, key in [
        ("Routers", "routers"),
        ("Floodfills", "floodfills"),
        ("LeaseSets", "leaseSets"),
        ("Client Tunnels", "tunnelsClient"),
        ("Transit Tunnels", "tunnelsTransit"),
    ]:
        n = _extract_number(html, label)
        if n is not None:
            out[key] = int(n)

    return out


def fetch_i2pd_stats(host: str, port: int, timeout: float = 5.0) -> dict:
    """Fetch + parse i2pd web console main page.

    Returns a dict with the same shape as `empty_stats()`. On any network
    error (connection refused, timeout, DNS) `running` is False and all
    numeric fields are 0.
    """
    url = f"http://{host}:{port}/"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            raw = resp.read()
    except (urllib.error.URLError, OSError, TimeoutError):
        return empty_stats()
    try:
        html = raw.decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return empty_stats()
    return parse_i2pd_main_page(html)
