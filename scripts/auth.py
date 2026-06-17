"""
Sync daemon shared-secret auth (Phase I.1).

In v0.1 the daemon binds to 127.0.0.1 only, but ANY local process can
post to that loopback address. The threat we want to defeat is "a
random app on the user's phone hijacks the eepsite publish flow".

Defense:
  - Daemon owns a 32-byte secret token stored at ~/.echelon/secret
    (mode 0600 — only the running user can read).
  - When ECHELON_REQUIRE_AUTH=1 (off by default in v0.1 for backwards
    compatibility, on by default in v0.2 once the browser flow ships
    a paste-token Settings UI), the daemon rejects any write request
    without a matching `X-Echelon-Auth: <token>` header.
  - The /health and /auth/info endpoints stay unauthenticated so the
    browser can probe daemon presence without first knowing the token.

The browser learns the token by displaying a "Setup token" Settings
field; the user runs `cat ~/.echelon/secret` once and pastes the
result. This is one-time pain but actually secure — the browser
itself can never read the file, so a malicious page can't escalate.

For tests, ECHELON_REQUIRE_AUTH stays unset and auth-protected routes
behave as if no auth is required.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Optional

# 32 bytes = 256-bit token; rendered as 64 hex chars.
TOKEN_BYTES = 32

# Routes that NEVER require auth, even when REQUIRE_AUTH is set.
# These are needed for the browser to bootstrap and to probe daemon
# health without a token. Keep this list short; everything that
# mutates state should be auth-gated.
PUBLIC_ROUTES = frozenset({
    "/health",
    "/auth/info",
})


def secret_path() -> Path:
    """Resolve the secret file location. Override with ECHELON_SECRET_PATH."""
    raw = os.environ.get("ECHELON_SECRET_PATH")
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".echelon" / "secret"


def require_auth_enabled() -> bool:
    """When True, the daemon enforces X-Echelon-Auth on protected routes."""
    raw = os.environ.get("ECHELON_REQUIRE_AUTH", "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def load_or_create_secret(path: Optional[Path] = None) -> str:
    """Read the persisted token, or generate one + persist it on first run.

    The file is written with mode 0600 from the start using os.open() so
    there is no window where the token exists with default permissions.
    On platforms where chmod 0600 is a no-op (Windows), the file is still
    placed under the user profile.
    """
    p = path or secret_path()
    if p.exists():
        try:
            return p.read_text(encoding="utf-8").strip()
        except OSError:
            pass  # fall through to regenerate
    p.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(TOKEN_BYTES)
    # Write with 0600 permissions from the start — no race window.
    # Use os.open + fd write so the file is created with the right mode.
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, token.encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    return token


def validate_token(submitted: Optional[str], expected: str) -> bool:
    """Constant-time comparison so we don't leak the token via timing."""
    if not submitted or not expected:
        return False
    return secrets.compare_digest(submitted, expected)


def is_public_route(path: str) -> bool:
    return path in PUBLIC_ROUTES


# ── CSRF / cross-origin write protection ─────────────────────────────
#
# The daemon binds to loopback, but a malicious CLEARNET page open in the
# user's browser can still cause the browser to send requests to
# 127.0.0.1. CORS blocks the page from READING the response, but NOT the
# side effect of a state-changing write. We therefore reject the *request*
# on write routes unless it is same-origin-ish:
#   • a browser cross-origin request always carries an Origin header the
#     page cannot forge or strip → if Origin is present it MUST be in the
#     allowlist (the localhost/PWA origins);
#   • we also require Content-Type: application/json on write routes, which
#     forces a CORS preflight for any cross-origin attempt (simple-request
#     POSTs like text/plain or form bodies are refused).
# Non-browser clients (curl, the daemon's own tooling) send no Origin and
# are allowed — they are same-device by virtue of the loopback bind.

def origin_is_allowed(origin: Optional[str], allow_match) -> bool:
    """True if no Origin (non-browser, same-device) or Origin is allowlisted.
    `allow_match(origin) -> bool` is injected so the daemon supplies its
    own CORS allowlist without this module importing it."""
    if not origin:
        return True
    return bool(allow_match(origin))


def content_type_is_json(content_type: Optional[str]) -> bool:
    """True if the Content-Type is application/json (ignoring params/charset)."""
    if not content_type:
        return False
    return content_type.split(";", 1)[0].strip().lower() == "application/json"


def write_request_rejection(
    *,
    origin: Optional[str],
    content_type: Optional[str],
    method: str,
    allow_match,
) -> Optional[tuple[int, str]]:
    """Return None if a state-changing request is allowed, else (status,msg).

    Applies to POST/PUT/PATCH/DELETE. DELETE carries no body so the JSON
    content-type rule is only enforced when a body/content-type is present.
    """
    if not origin_is_allowed(origin, allow_match):
        return (403, "cross-origin request refused")
    # Body-bearing writes must be application/json (blocks simple-request CSRF).
    if method in ("POST", "PUT", "PATCH"):
        if not content_type_is_json(content_type):
            return (415, "write requests must be Content-Type: application/json")
    elif content_type and not content_type_is_json(content_type):
        # DELETE with a non-JSON body is suspicious — refuse.
        return (415, "unexpected request body content-type")
    return None


def auth_status_for(
    request_path: str,
    submitted_token: Optional[str],
    expected_token: Optional[str],
    *,
    require_auth: bool,
) -> Optional[tuple[int, str]]:
    """Return None when the request is allowed; otherwise (status, message)
    that the daemon should reply with.

    Pure function — no I/O. Keeps the test surface tiny.
    """
    if not require_auth:
        return None
    if is_public_route(request_path):
        return None
    if expected_token is None:
        # require_auth was set but no secret on disk yet — refuse,
        # don't leak info.
        return (503, "auth required but no secret configured on the daemon")
    if not validate_token(submitted_token, expected_token):
        return (401, "missing or invalid X-Echelon-Auth token")
    return None
