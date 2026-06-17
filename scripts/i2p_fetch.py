"""
i2pd HTTP-proxy client (Phase L.1).

The browser CANNOT fetch eepsites directly: i2pd's port 4444 is an HTTP
*proxy*, not an origin server, and a webview fetch can't speak proxy
protocol. Worse, even if it could, rendering raw eepsite HTML in a
webview leaks the user's clearnet IP via any embedded clearnet resource
(see scripts/html_sanitizer.py). So the daemon fetches eepsites on the
browser's behalf, THROUGH i2pd, and hands back sanitized HTML.

This module is ONLY the fetch step. It speaks proper HTTP/1.1 proxy
protocol to i2pd: open a socket to 127.0.0.1:4444 and send a request
line with an ABSOLUTE URI:

    GET http://example.i2p/path HTTP/1.1
    Host: example.i2p

i2pd resolves the .i2p destination, builds tunnels, fetches, and streams
the response back over the same socket.

Hard safety rails (module-level constants, not wire-controlled):
  - Only .i2p / .b32.i2p hosts are fetchable here. A request for a
    clearnet host is REFUSED — clearnet egress goes through the
    explicit outproxy flow (Phase B), never this eepsite path. This
    keeps "browse an eepsite" from ever silently touching clearnet.
  - GET / HEAD only. No POST-through-proxy from the browse endpoint.
  - Response size cap so a hostile eepsite can't exhaust memory.
  - Hard connect + read timeouts feed the smart-error classifier.
  - The proxy host/port come from the daemon's own config, never from
    the browser request, so the browser can't redirect the fetch at an
    arbitrary host.
"""
from __future__ import annotations

import dataclasses
import http.client
import re
import socket
from typing import Optional, Tuple
from urllib.parse import urlparse, urlunparse

# i2pd HTTP proxy defaults. Overridable via daemon env, never via the wire.
DEFAULT_I2P_PROXY_HOST = "127.0.0.1"
DEFAULT_I2P_PROXY_PORT = 4444

# Only these hosts may be fetched through the eepsite path.
I2P_HOST_RE = re.compile(r"^[a-z0-9.-]+\.i2p$", re.IGNORECASE)

CONNECT_TIMEOUT_SEC = 10.0
READ_TIMEOUT_SEC = 60.0          # cold eepsites can take 10-30s to build tunnels
RESPONSE_BODY_CAP = 8 * 1024 * 1024   # 8 MB — eepsites are small; cap hostile ones
RESPONSE_CHUNK = 64 * 1024
MAX_REDIRECTS = 3                # follow in-network redirects, bounded

# Clearnet outproxy fetch settings
CLEARNET_RESPONSE_BODY_CAP = 16 * 1024 * 1024  # 16 MB for clearnet
CLEARNET_CONNECT_TIMEOUT = 15.0
CLEARNET_READ_TIMEOUT = 30.0


class I2pFetchError(Exception):
    """Carries a machine-readable reason that maps to the browser's
    SmartErrorPage error categories."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        # reason ∈ {no-i2pd, dns-failed, tunnel-timeout, rate-limited,
        #           too-large, bad-host, frame-blocked, unknown}
        self.reason = reason
        self.message = message


@dataclasses.dataclass
class FetchResult:
    final_url: str
    status: int
    content_type: str
    body: bytes
    # Response headers we care about for sanitization decisions.
    x_frame_options: Optional[str]


def is_i2p_host(host: str) -> bool:
    return bool(I2P_HOST_RE.match(host.strip()))


def is_clearnet_host(host: str) -> bool:
    """Check if a host is a clearnet (non-.i2p) address."""
    host = host.strip().lower()
    if not host:
        return False
    # .i2p is I2P, everything else is clearnet
    if is_i2p_host(host):
        return False
    # Basic sanity: must have at least one dot or be an IP
    if '.' not in host and not host.replace(':', '').replace('[', '').replace(']', '').replace('.', '').isdigit():
        return False
    return True


def normalize_eepsite_url(raw: str) -> str:
    """Turn user input into a canonical http://host[/path] eepsite URL.

    Raises I2pFetchError(bad-host) if the host isn't a .i2p destination.
    """
    s = raw.strip()
    if not s:
        raise I2pFetchError("bad-host", "empty address")
    # Strip any scheme the user typed; we always use http inside I2P.
    s = re.sub(r"^[a-z]+://", "", s, flags=re.IGNORECASE)
    # Split host / path
    slash = s.find("/")
    if slash == -1:
        host, path = s, "/"
    else:
        host, path = s[:slash], s[slash:]
    host = host.strip().lower()
    # Strip any port the user may have appended; eepsites are addressed
    # without ports through the proxy.
    host = host.split(":", 1)[0]
    if not is_i2p_host(host):
        raise I2pFetchError(
            "bad-host",
            f"{host!r} is not an .i2p eepsite address. Clearnet sites must "
            f"go through the outproxy, not the eepsite browser.",
        )
    if not path.startswith("/"):
        path = "/" + path
    return f"http://{host}{path}"


def _classify_socket_error(exc: Exception) -> I2pFetchError:
    """Map a low-level socket/HTTP error to a SmartErrorPage reason."""
    if isinstance(exc, (ConnectionRefusedError,)):
        return I2pFetchError("no-i2pd", "i2pd HTTP proxy refused the connection — is i2pd running?")
    if isinstance(exc, socket.timeout) or isinstance(exc, TimeoutError):
        return I2pFetchError("tunnel-timeout", "Timed out building a tunnel / waiting for the eepsite.")
    if isinstance(exc, (socket.gaierror, OSError)):
        return I2pFetchError("no-i2pd", f"Could not reach the i2pd proxy: {exc}")
    return I2pFetchError("unknown", str(exc))


def fetch_eepsite(
    raw_url: str,
    *,
    proxy_host: str = DEFAULT_I2P_PROXY_HOST,
    proxy_port: int = DEFAULT_I2P_PROXY_PORT,
    _redirect_depth: int = 0,
) -> FetchResult:
    """Fetch an eepsite THROUGH i2pd's HTTP proxy and return the raw
    (un-sanitized) response. The caller MUST sanitize before rendering.

    Raises I2pFetchError with a reason that maps to SmartErrorPage.
    """
    url = normalize_eepsite_url(raw_url)
    parsed = urlparse(url)
    host = parsed.netloc

    # Connect to the i2pd HTTP proxy and issue an absolute-URI request —
    # this is the proper "use me as a proxy" form. http.client lets us do
    # this by setting the request URL to the absolute URI via set_tunnel?
    # No — set_tunnel is for CONNECT. For a plain HTTP proxy we open a
    # connection to the PROXY and call request() with the absolute URL as
    # the path.
    conn = http.client.HTTPConnection(proxy_host, proxy_port, timeout=CONNECT_TIMEOUT_SEC)
    try:
        conn.connect()
        conn.sock.settimeout(READ_TIMEOUT_SEC)
        # Absolute-URI request line: "GET http://host/path HTTP/1.1"
        conn.putrequest("GET", url, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", host)
        conn.putheader("Accept", "text/html,application/xhtml+xml,*/*")
        conn.putheader("Accept-Encoding", "identity")  # no gzip — keep sanitizer simple
        conn.putheader("Connection", "close")
        conn.endheaders()

        resp = conn.getresponse()
        status = resp.status

        # Follow in-network redirects (Location must also be .i2p).
        if status in (301, 302, 303, 307, 308):
            loc = resp.getheader("Location", "")
            resp.read()  # drain
            if not loc:
                raise I2pFetchError("unknown", f"{status} redirect with no Location")
            if _redirect_depth >= MAX_REDIRECTS:
                raise I2pFetchError("unknown", "too many redirects")
            # Resolve relative redirects against the current URL.
            next_url = _resolve_redirect(url, loc)
            return fetch_eepsite(
                next_url,
                proxy_host=proxy_host,
                proxy_port=proxy_port,
                _redirect_depth=_redirect_depth + 1,
            )

        # ── i2pd proxy-level error classification ───────────────────
        # i2pd signals ITS OWN proxy errors (as opposed to the eepsite's
        # response) with HTTP 500 + a distinctive HTML body containing
        # "<h1>Proxy error: ...</h1>". These bodies were captured from a
        # live i2pd 2.60 HTTP proxy (see test_i2p_live + the recorded
        # fixtures); we classify on the exact phrases i2pd emits.
        #
        # Known i2pd proxy-error h1 phrases → our SmartErrorPage reasons:
        #   "Host not found"          → dns-failed   (not in addressbook)
        #   "Outproxy failure"        → bad-host     (clearnet w/o outproxy)
        #   "Cannot reach LeaseSet"   → tunnel-timeout
        #   "Tunnel building failed"  → tunnel-timeout
        #   "Decryption failed"       → tunnel-timeout (transient)
        if status == 500:
            body = _read_capped(resp)
            low = body.lower()
            if b"proxy error" in low or b"i2pd http proxy" in low:
                if b"host not found" in low or b"addressbook" in low:
                    raise I2pFetchError("dns-failed", "Eepsite address not found in the NetDB / addressbook.")
                if b"outproxy" in low:
                    raise I2pFetchError(
                        "bad-host",
                        "Destination is not an in-network eepsite and the outproxy is disabled.",
                    )
                if (b"leaseset" in low or b"tunnel" in low or b"decryption" in low
                        or b"timeout" in low or b"timed out" in low):
                    raise I2pFetchError("tunnel-timeout", "i2pd could not reach the eepsite (tunnel/leaseset).")
                # An i2pd proxy error we don't specifically recognise.
                raise I2pFetchError("tunnel-timeout", "i2pd proxy error reaching the eepsite.")
            # A genuine 500 FROM the eepsite itself — pass it through.
            return _build_result(url, status, resp, body)

        # Some i2pd builds also surface 404/502/503/504 directly.
        if status == 404:
            body = _read_capped(resp)
            low = body.lower()
            if (b"proxy error" in low and (b"host not found" in low or b"addressbook" in low)
                    or b"destination not found" in low):
                raise I2pFetchError("dns-failed", "Eepsite address not found in the NetDB.")
            return _build_result(url, status, resp, body)
        if status in (502, 504):
            resp.read()
            raise I2pFetchError("tunnel-timeout", f"i2pd returned {status} — tunnel build or eepsite timeout.")
        if status == 503:
            resp.read()
            raise I2pFetchError("rate-limited", "i2pd returned 503 — service unavailable / rate-limited.")

        body = _read_capped(resp)
        return _build_result(url, status, resp, body)

    except I2pFetchError:
        raise
    except (http.client.HTTPException,) as e:
        raise I2pFetchError("unknown", f"HTTP error talking to i2pd proxy: {e}") from e
    except Exception as e:  # noqa: BLE001 — map everything to a reason
        raise _classify_socket_error(e) from e
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass




def _build_result(
    url: str,
    status: int,
    resp: http.client.HTTPResponse,
    body: bytes,
) -> FetchResult:
    ctype = resp.getheader("Content-Type", "application/octet-stream")
    xfo = resp.getheader("X-Frame-Options")
    return FetchResult(
        final_url=url,
        status=status,
        content_type=ctype,
        body=body,
        x_frame_options=xfo,
    )


def _resolve_redirect(base_url: str, location: str) -> str:
    """Resolve a redirect Location against the base URL, then re-validate
    it's still an .i2p destination (normalize_eepsite_url does the check
    in the recursive fetch call)."""
    if re.match(r"^[a-z]+://", location, re.IGNORECASE):
        return location  # absolute — re-validated by normalize in recursion
    base = urlparse(base_url)
    if location.startswith("/"):
        return urlunparse((base.scheme, base.netloc, location, "", "", ""))
    # relative path
    base_dir = base.path.rsplit("/", 1)[0]
    return urlunparse((base.scheme, base.netloc, f"{base_dir}/{location}", "", "", ""))


# ── Clearnet outproxy fetch ───────────────────────────────────


def normalize_clearnet_url(raw: str) -> str:
    """Turn user input into a canonical https:// or http:// clearnet URL.

    Raises I2pFetchError(bad-host) if the host is a .i2p address
    (those should go through fetch_eepsite instead).
    """
    s = raw.strip()
    if not s:
        raise I2pFetchError("bad-host", "empty address")

    # If user typed just a domain, assume https
    if not re.match(r"^[a-z]+://", s, re.IGNORECASE):
        s = "https://" + s

    parsed = urlparse(s)
    host = parsed.netloc.lower()

    if is_i2p_host(host):
        raise I2pFetchError(
            "bad-host",
            f"{host!r} is an .i2p address — use the eepsite browser, not the outproxy.",
        )

    if not host:
        raise I2pFetchError("bad-host", "no host in URL")

    # Strip default ports
    host_clean = host.split(":")[0]
    if not is_clearnet_host(host_clean):
        raise I2pFetchError("bad-host", f"{host_clean!r} doesn't look like a valid domain.")

    return s


def fetch_clearnet_via_outproxy(
    raw_url: str,
    *,
    proxy_host: str = DEFAULT_I2P_PROXY_HOST,
    proxy_port: int = DEFAULT_I2P_PROXY_PORT,
    _redirect_depth: int = 0,
) -> FetchResult:
    """Fetch a clearnet URL through i2pd's outproxy.

    When i2pd's outproxy is enabled, the HTTP proxy on port 4444 will
    forward non-.i2p requests to the clearnet. This function speaks the
    same HTTP proxy protocol as fetch_eepsite, but for clearnet hosts.

    The i2pd config must have outproxy enabled:
        [httpproxy]
        outproxy = 127.0.0.1:8118   (or whatever upstream proxy)

    Raises I2pFetchError with a reason that maps to SmartErrorPage.
    """
    url = normalize_clearnet_url(raw_url)
    parsed = urlparse(url)
    host = parsed.netloc

    conn = http.client.HTTPConnection(proxy_host, proxy_port, timeout=CLEARNET_CONNECT_TIMEOUT)
    try:
        conn.connect()
        conn.sock.settimeout(CLEARNET_READ_TIMEOUT)

        # Absolute-URI request through the i2pd proxy
        conn.putrequest("GET", url, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", host)
        conn.putheader("Accept", "text/html,application/xhtml+xml,*/*")
        conn.putheader("Accept-Encoding", "identity")
        conn.putheader("Connection", "close")
        conn.endheaders()

        resp = conn.getresponse()
        status = resp.status

        # Follow redirects (may be clearnet redirects)
        if status in (301, 302, 303, 307, 308):
            loc = resp.getheader("Location", "")
            resp.read()
            if not loc:
                raise I2pFetchError("unknown", f"{status} redirect with no Location")
            if _redirect_depth >= MAX_REDIRECTS:
                raise I2pFetchError("unknown", "too many redirects")
            next_url = _resolve_redirect(url, loc) if not re.match(r"^[a-z]+://", loc, re.IGNORECASE) else loc
            return fetch_clearnet_via_outproxy(
                next_url,
                proxy_host=proxy_host,
                proxy_port=proxy_port,
                _redirect_depth=_redirect_depth + 1,
            )

        # i2pd proxy-level errors (outproxy failure, etc.)
        if status == 500:
            body = _read_capped(resp, cap=CLEARNET_RESPONSE_BODY_CAP)
            low = body.lower()
            if b"proxy error" in low or b"i2pd http proxy" in low:
                if b"outproxy" in low:
                    raise I2pFetchError(
                        "no-outproxy",
                        "Clearnet outproxy failed — is i2pd's outproxy enabled and "
                        "is an upstream proxy (Privoxy/SOCKS) running?",
                    )
                if b"host not found" in low or b"addressbook" in low:
                    raise I2pFetchError("dns-failed", "Domain not found.")
                raise I2pFetchError("tunnel-timeout", "i2pd proxy error reaching the site.")
            # Genuine 500 from the site itself
            return _build_result(url, status, resp, body)

        if status == 404:
            body = _read_capped(resp, cap=CLEARNET_RESPONSE_BODY_CAP)
            return _build_result(url, status, resp, body)
        if status in (502, 504):
            resp.read()
            raise I2pFetchError("tunnel-timeout", f"Site returned {status} — gateway timeout.")
        if status == 503:
            resp.read()
            raise I2pFetchError("rate-limited", "Site returned 503 — service unavailable.")

        body = _read_capped(resp, cap=CLEARNET_RESPONSE_BODY_CAP)
        return _build_result(url, status, resp, body)

    except I2pFetchError:
        raise
    except (http.client.HTTPException,) as e:
        raise I2pFetchError("unknown", f"HTTP error talking to i2pd proxy: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise _classify_socket_error(e) from e
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def _read_capped(resp: http.client.HTTPResponse, cap: int = RESPONSE_BODY_CAP) -> bytes:
    """Read the response body up to cap; raise if exceeded."""
    chunks = []
    total = 0
    while True:
        chunk = resp.read(RESPONSE_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > cap:
            raise I2pFetchError(
                "too-large",
                f"Response exceeds {cap // (1024*1024)} MB cap.",
            )
        chunks.append(chunk)
    return b"".join(chunks)
