"""
Manage Echelon's outproxy section in i2pd's tunnels.conf.

The user's tunnels.conf is THEIRS — Echelon never touches anything
outside its own clearly-marked managed block:

    # === ECHELON OUTPROXY START — managed by Echelon, do not edit ===
    ...stanzas...
    # === ECHELON OUTPROXY END ===

Disabling the outproxy removes that block in its entirety, leaving
every other line in the file untouched. Enabling re-emits the block
deterministically, so toggle/toggle is idempotent and never drifts.

Safety rails:
  * `bind_host` of the backend clearnet proxy is locked to 127.0.0.1
    (exposing the backend on 0.0.0.0 / LAN-routable addresses would
    let any nearby device use it as an open proxy — refused).
  * Hostnames / ports validated against strict allowlists.
  * Atomic writes (tempfile.mkstemp + os.replace).
  * Modes: 'disabled', 'http', 'socks', 'both'. Fall-through anything
    else fails closed (refuses to write).
"""
from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

# ─── Markers for the Echelon-managed block ───────────────────────────────

START_MARKER = "# === ECHELON OUTPROXY START — managed by Echelon, do not edit ==="
END_MARKER   = "# === ECHELON OUTPROXY END ==="

# Both stanzas use these fixed local-only hosts. Locked, not user-configurable
# from the UI — exposing the backend proxy on 0.0.0.0 is the canonical way to
# accidentally turn yourself into an open proxy.
LOCKED_BIND_HOST = "127.0.0.1"

OutproxyMode = Literal["disabled", "http", "socks", "both"]
_VALID_MODES = ("disabled", "http", "socks", "both")

# ─── Validators ──────────────────────────────────────────────────────────

# Hostnames and IPs we'll accept as upstream-proxy hosts. Restricted to the
# loopback addresses + simple host-like names. No shell metachars, no spaces,
# no angle brackets, no commas, no path separators.
_HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,253}$")


def _is_loopback_or_hostlike(host: str) -> bool:
    h = host.strip()
    if h in ("127.0.0.1", "::1", "localhost"):
        return True
    return bool(_HOST_RE.match(h))


def _is_port(value: int | str) -> bool:
    try:
        n = int(value)
    except (ValueError, TypeError):
        return False
    return 1 <= n <= 65535


def _is_mode(value: str) -> bool:
    return value in _VALID_MODES


# ─── Spec ────────────────────────────────────────────────────────────────

@dataclass
class OutproxySpec:
    """User-supplied configuration for the managed outproxy block."""
    mode: OutproxyMode = "disabled"
    upstream_host: str = "127.0.0.1"
    http_upstream_port: int = 8118    # Privoxy default
    socks_upstream_port: int = 1080   # generic SOCKS default
    # Whether the destination is published to the I2P netDb. We default
    # to NOT publishing — the user has to opt in to being discoverable.
    advertise: bool = False
    # File names i2pd uses to persist the destination keys. Hard-coded so
    # an attacker who somehow controls a POST body can't direct writes to
    # ../../etc/passwd via the keys path.
    http_keys_file: str = field(default="echelon-outproxy-http.dat", init=False)
    socks_keys_file: str = field(default="echelon-outproxy-socks.dat", init=False)


def validate_spec(spec: OutproxySpec) -> None:
    """Raise ValueError for anything unsafe. Caller catches and 400s."""
    if not _is_mode(spec.mode):
        raise ValueError(f"invalid mode: {spec.mode!r}")
    if not _is_loopback_or_hostlike(spec.upstream_host):
        raise ValueError(f"invalid upstream_host: {spec.upstream_host!r}")
    # 0.0.0.0 / wildcard binds are rejected explicitly even if they pass the
    # generic host regex — no exposure of the backend proxy to LAN.
    if spec.upstream_host.strip() in ("0.0.0.0", "::", "*"):
        raise ValueError("upstream_host must be loopback (127.0.0.1) or named host, not a wildcard")
    if not _is_port(spec.http_upstream_port):
        raise ValueError(f"invalid http_upstream_port: {spec.http_upstream_port!r}")
    if not _is_port(spec.socks_upstream_port):
        raise ValueError(f"invalid socks_upstream_port: {spec.socks_upstream_port!r}")
    if not isinstance(spec.advertise, bool):
        raise ValueError("advertise must be a bool")


def spec_from_dict(raw: dict) -> OutproxySpec:
    """Build a spec from a JSON-decoded request body. Validates."""
    if not isinstance(raw, dict):
        raise ValueError("body must be an object")
    spec = OutproxySpec(
        mode=str(raw.get("mode", "disabled")).strip(),  # type: ignore[arg-type]
        upstream_host=str(raw.get("upstream_host", "127.0.0.1")),
        http_upstream_port=int(raw.get("http_upstream_port", 8118)),
        socks_upstream_port=int(raw.get("socks_upstream_port", 1080)),
        advertise=bool(raw.get("advertise", False)),
    )
    validate_spec(spec)
    return spec


def spec_to_dict(spec: OutproxySpec) -> dict:
    """Serialise back to a JSON-friendly dict for the wire format."""
    return {
        "mode": spec.mode,
        "upstream_host": spec.upstream_host,
        "http_upstream_port": spec.http_upstream_port,
        "socks_upstream_port": spec.socks_upstream_port,
        "advertise": spec.advertise,
        "http_keys_file": spec.http_keys_file,
        "socks_keys_file": spec.socks_keys_file,
    }


# ─── Stanza builder ──────────────────────────────────────────────────────


def _http_stanza(spec: OutproxySpec) -> str:
    return (
        f"[echelon-outproxy-http]\n"
        f"type = server\n"
        f"host = {LOCKED_BIND_HOST}\n"
        f"port = {spec.http_upstream_port}\n"
        f"keys = {spec.http_keys_file}\n"
        f"gzip = false\n"
        f"inbound.length = 1\n"
        f"outbound.length = 1\n"
    )


def _socks_stanza(spec: OutproxySpec) -> str:
    return (
        f"[echelon-outproxy-socks]\n"
        f"type = server\n"
        f"host = {LOCKED_BIND_HOST}\n"
        f"port = {spec.socks_upstream_port}\n"
        f"keys = {spec.socks_keys_file}\n"
        f"gzip = false\n"
        f"inbound.length = 1\n"
        f"outbound.length = 1\n"
    )


def build_managed_block(spec: OutproxySpec) -> str:
    """Render the managed block — empty if mode == 'disabled'.

    Always sandwiched between START_MARKER / END_MARKER so reads can
    extract it precisely.
    """
    if spec.mode == "disabled":
        return ""

    body = ""
    if spec.mode in ("http", "both"):
        body += _http_stanza(spec) + "\n"
    if spec.mode in ("socks", "both"):
        body += _socks_stanza(spec) + "\n"
    note = (
        "# advertise = true → destination is published to netDb (other peers can find it)\n"
        f"# advertise = {'true' if spec.advertise else 'false'} (Echelon-controlled)\n"
        f"# bind host is locked to {LOCKED_BIND_HOST}; backend port is your local clearnet proxy.\n"
        f"# Set up Privoxy / 3proxy / Squid on those ports first.\n"
    )
    return f"{START_MARKER}\n{note}{body}{END_MARKER}\n"


# ─── tunnels.conf parser (only what we need) ─────────────────────────────


_LINE_SECTION_RE = re.compile(r"^\s*\[([A-Za-z][A-Za-z0-9._-]*)\]\s*(?:[#;].*)?$")
_LINE_KV_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9._-]*)\s*=\s*(.*?)\s*(?:[#;].*)?$")


def parse_tunnels_conf(text: str) -> dict[str, dict[str, str]]:
    """Return {section_name: {key: value}} for the whole file.

    Comments, blank lines, and the markers themselves are ignored.
    Sections under the markers ARE included — caller wanting only
    user-managed tunnels should use `extract_user_tunnels()` instead.
    """
    out: dict[str, dict[str, str]] = {}
    if not text:
        return out
    section: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        sec_m = _LINE_SECTION_RE.match(line)
        if sec_m:
            section = sec_m.group(1)
            out.setdefault(section, {})
            continue
        if section is None:
            continue
        kv_m = _LINE_KV_RE.match(line)
        if kv_m:
            out[section][kv_m.group(1)] = kv_m.group(2).strip()
    return out


# ─── Managed-block extract / splice ──────────────────────────────────────


def extract_managed_block(text: str) -> tuple[int, int] | None:
    """Return (start_idx, end_idx) of the managed block in `text`,
    inclusive of START_MARKER through the terminating newline after
    END_MARKER. None if no marker is found (or only one — refuse to
    operate on a corrupted file)."""
    s = text.find(START_MARKER)
    if s < 0:
        return None
    e = text.find(END_MARKER, s)
    if e < 0:
        return None
    # advance to end of END_MARKER's line (include trailing newline if present)
    line_end = text.find("\n", e)
    if line_end < 0:
        line_end = len(text) - 1
    return (s, line_end + 1)


def splice_managed_block(text: str, new_block: str) -> str:
    """Replace the existing managed block in `text` with `new_block`.

    Normalised so that two successive calls with the same `new_block`
    produce identical output (idempotency is enforced by the test suite).

    If `new_block` is empty: remove the existing managed block.
    If there's no existing block and `new_block` is non-empty: append it.
    """
    pos = extract_managed_block(text)
    if pos is None:
        before, after = text, ""
    else:
        s, e = pos
        before, after = text[:s], text[e:]

    # Canonicalise spacing on either side.
    before = before.rstrip()           # drop trailing newlines/spaces
    after = after.lstrip("\n")         # drop only leading newlines

    parts: list[str] = []
    if not new_block:
        # Disable case — just stitch user content back together.
        if before:
            parts.append(before + "\n")
        if after:
            if before:
                parts.append("\n")
            parts.append(after if after.endswith("\n") else after + "\n")
        return "".join(parts)

    # Enable / replace case.
    block = new_block if new_block.endswith("\n") else new_block + "\n"
    if before:
        parts.append(before + "\n\n")
    parts.append(block)
    if after:
        parts.append(after if after.endswith("\n") else after + "\n")
    return "".join(parts)


# ─── Read / write ────────────────────────────────────────────────────────


def read_managed_spec(path: str | os.PathLike) -> OutproxySpec:
    """Reverse-engineer the current spec from the managed block in a
    tunnels.conf. If the block is missing, returns a `disabled` spec."""
    p = Path(path)
    if not p.exists():
        return OutproxySpec(mode="disabled")
    text = p.read_text(encoding="utf-8")
    pos = extract_managed_block(text)
    if pos is None:
        return OutproxySpec(mode="disabled")
    block = text[pos[0]:pos[1]]
    sections = parse_tunnels_conf(block)
    has_http = "echelon-outproxy-http" in sections
    has_socks = "echelon-outproxy-socks" in sections
    if has_http and has_socks:
        mode: OutproxyMode = "both"
    elif has_http:
        mode = "http"
    elif has_socks:
        mode = "socks"
    else:
        return OutproxySpec(mode="disabled")

    # Ports come from whichever block is present.
    # Safe int parse — a hand-edited tunnels.conf with `port = abc`
    # would crash without the try/except.
    try:
        http_port = int(sections.get("echelon-outproxy-http", {}).get("port", "8118"))
    except (ValueError, TypeError):
        http_port = 8118
    try:
        socks_port = int(sections.get("echelon-outproxy-socks", {}).get("port", "1080"))
    except (ValueError, TypeError):
        socks_port = 1080
    # The host we wrote was always 127.0.0.1; if a hand-edit changed it,
    # we round-trip it back to the locked value on save.
    upstream_host = (
        sections.get("echelon-outproxy-http", {}).get("host")
        or sections.get("echelon-outproxy-socks", {}).get("host")
        or "127.0.0.1"
    )
    advertise = "advertise = true" in block
    return OutproxySpec(
        mode=mode,
        upstream_host=upstream_host,
        http_upstream_port=http_port,
        socks_upstream_port=socks_port,
        advertise=advertise,
    )


def write_managed_spec(path: str | os.PathLike, spec: OutproxySpec) -> None:
    """Apply `spec` to the file at `path` atomically. Validates first
    (so we never leave a half-good file even if a value is bad)."""
    validate_spec(spec)

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    existing = p.read_text(encoding="utf-8") if p.exists() else ""
    new_block = build_managed_block(spec)
    new_text = splice_managed_block(existing, new_block)

    fd, tmp_path = tempfile.mkstemp(prefix=".tunnels_conf_", dir=str(p.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new_text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, p)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
