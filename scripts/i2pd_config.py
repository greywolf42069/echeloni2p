"""
Read + write a curated subset of i2pd's INI-ish configuration file.

i2pd's config (~/.i2pd/i2pd.conf) mixes top-level key=value lines with
[section] blocks. Echelon only ever needs to read or change a small,
hand-picked whitelist of options — the ones the user can sanely tweak
from a UI:

  bandwidth, share, notransit, floodfill,
  http.address, http.port,
  httpproxy.address, httpproxy.port,
  socksproxy.address, socksproxy.port

Everything else in the file is left untouched (including comments and
ordering). Writes are atomic: we render to <path>.tmp and rename over.
"""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Iterable

# ─── Whitelist + validators ───────────────────────────────────────────────


def _is_bool(s: str) -> bool:
    return s.strip().lower() in {"true", "false", "1", "0", "yes", "no"}


def _normalise_bool(s: str) -> str:
    return "true" if s.strip().lower() in {"true", "1", "yes"} else "false"


def _is_port(s: str) -> bool:
    try:
        n = int(s)
    except (ValueError, TypeError):
        return False
    return 1 <= n <= 65535


_HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")


def _is_hostlike(s: str) -> bool:
    return bool(_HOST_RE.match(s.strip()))


def _is_bandwidth(s: str) -> bool:
    s = s.strip()
    if s in {"L", "O", "P", "X"}:
        return True
    # i2pd also accepts a numeric kilobyte/sec rate.
    try:
        n = int(s)
    except ValueError:
        return False
    return 0 < n <= 1_000_000  # 1 GBps cap; sanity bound, not a hard limit


def _is_share_pct(s: str) -> bool:
    try:
        n = int(s)
    except (ValueError, TypeError):
        return False
    return 0 <= n <= 100


# (key, validator, normaliser) for every option Echelon is allowed to touch.
WHITELIST: dict[str, dict] = {
    "bandwidth":       {"validate": _is_bandwidth,  "normalise": str.strip},
    "share":           {"validate": _is_share_pct,  "normalise": str.strip},
    "notransit":       {"validate": _is_bool,       "normalise": _normalise_bool},
    "floodfill":       {"validate": _is_bool,       "normalise": _normalise_bool},
    "http.address":    {"validate": _is_hostlike,   "normalise": str.strip},
    "http.port":       {"validate": _is_port,       "normalise": str.strip},
    "httpproxy.address": {"validate": _is_hostlike, "normalise": str.strip},
    "httpproxy.port":  {"validate": _is_port,       "normalise": str.strip},
    "socksproxy.address": {"validate": _is_hostlike, "normalise": str.strip},
    "socksproxy.port": {"validate": _is_port,       "normalise": str.strip},
}


def is_whitelisted(key: str) -> bool:
    return key in WHITELIST


def validate(key: str, value: str) -> bool:
    if not isinstance(value, str):
        return False
    spec = WHITELIST.get(key)
    if spec is None:
        return False
    return bool(spec["validate"](value))


def normalise(key: str, value: str) -> str:
    spec = WHITELIST.get(key)
    if spec is None:
        return value
    return spec["normalise"](value)


# ─── Parser ───────────────────────────────────────────────────────────────


_LINE_KV_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9._-]*)\s*=\s*(.*?)\s*(?:[#;].*)?$")
_LINE_SECTION_RE = re.compile(r"^\s*\[([A-Za-z][A-Za-z0-9._-]*)\]\s*(?:[#;].*)?$")


def parse_i2pd_config_text(text: str) -> dict[str, str]:
    """Read i2pd-style INI text into a flat dict of dotted keys.

    Lines under `[section]` produce `section.key`. Top-level lines stay
    as-is. Comments (# or ;) and blank lines are ignored. Repeated keys:
    last value wins.
    """
    if not text:
        return {}
    out: dict[str, str] = {}
    section: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        sec_m = _LINE_SECTION_RE.match(line)
        if sec_m:
            section = sec_m.group(1).lower()
            continue
        kv = _LINE_KV_RE.match(line)
        if not kv:
            continue
        key, value = kv.group(1), kv.group(2)
        full_key = f"{section}.{key}" if section else key
        out[full_key] = value.strip()
    return out


def read_i2pd_config(path: str | os.PathLike) -> dict[str, str]:
    """Return a flat dict of every key in the file, scoped only to the
    whitelist. Missing file → {}."""
    p = Path(path)
    if not p.exists():
        return {}
    raw = parse_i2pd_config_text(p.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if is_whitelisted(k)}


# ─── Writer (preserves untouched lines and comments) ──────────────────────


def _split_dotted_key(full_key: str) -> tuple[str | None, str]:
    """'http.port' → ('http', 'port'). 'bandwidth' → (None, 'bandwidth')."""
    if "." in full_key:
        section, _, key = full_key.partition(".")
        return section, key
    return None, full_key


def _patch_lines(lines: list[str], updates: dict[str, str]) -> list[str]:
    """Apply key=value updates to the given line list, preserving every
    other line. Adds new lines for keys that weren't already present.

    `updates` is keyed by dotted full keys (e.g. 'http.port').
    """
    remaining = dict(updates)  # mutates as we process

    out: list[str] = []
    current_section: str | None = None
    section_index_map: dict[str, int] = {}  # section name -> index of last line in that section

    # Pre-pass: figure out where each section ends so we can append into
    # them later if needed.
    for i, raw in enumerate(lines):
        sec = _LINE_SECTION_RE.match(raw.strip())
        if sec:
            current_section = sec.group(1).lower()
        if current_section is not None:
            section_index_map[current_section] = i

    # First pass: rewrite existing lines.
    current_section = None
    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith(("#", ";")):
            out.append(raw)
            continue
        sec = _LINE_SECTION_RE.match(line.strip())
        if sec:
            current_section = sec.group(1).lower()
            out.append(raw)
            continue
        kv = _LINE_KV_RE.match(line)
        if not kv:
            out.append(raw)
            continue
        key = kv.group(1)
        full_key = f"{current_section}.{key}" if current_section else key
        if full_key in remaining:
            new_value = remaining.pop(full_key)
            # Preserve trailing comment if any.
            comment_m = re.search(r"([#;].*)$", line)
            tail = "  " + comment_m.group(1) if comment_m else ""
            ending = "\n" if raw.endswith("\n") else ""
            out.append(f"{key} = {new_value}{tail}{ending}")
        else:
            out.append(raw)

    # Second pass: append leftovers (keys we wanted to set but couldn't find).
    if remaining:
        # Group leftovers by section.
        sectioned: dict[str | None, list[tuple[str, str]]] = {}
        for full_key, value in remaining.items():
            section, key = _split_dotted_key(full_key)
            sectioned.setdefault(section, []).append((key, value))

        # Top-level leftovers go at the very top of the file (or after
        # initial comments). Sectioned leftovers go inside their section,
        # creating the section if needed.
        if None in sectioned:
            new_top = [f"{k} = {v}\n" for k, v in sectioned.pop(None)]  # type: ignore[misc]
            # Insert just after any leading comment block.
            insert_at = 0
            for i, raw in enumerate(out):
                if raw.strip() == "" or raw.lstrip().startswith(("#", ";")):
                    insert_at = i + 1
                else:
                    break
            out[insert_at:insert_at] = new_top

        for section, items in sectioned.items():
            section_header = f"[{section}]\n"
            insert_after = section_index_map.get(section)  # type: ignore[arg-type]
            block = [f"{k} = {v}\n" for k, v in items]
            if insert_after is None:
                # Section doesn't exist yet — append to end with header.
                if out and not out[-1].endswith("\n"):
                    out[-1] = out[-1] + "\n"
                out.append("\n")
                out.append(section_header)
                out.extend(block)
            else:
                out[insert_after + 1:insert_after + 1] = block

    return out


def write_i2pd_config(path: str | os.PathLike, updates: dict[str, str]) -> None:
    """Apply `updates` (whitelisted keys only) to the file at `path`,
    atomically. Lines and comments not corresponding to updated keys are
    preserved verbatim. Creates the file if it doesn't exist.
    """
    # Sanity-check every input. Caller is responsible for surfacing the
    # rejection but we double-check here so we can never write garbage.
    for k, v in updates.items():
        if not is_whitelisted(k):
            raise ValueError(f"non-whitelisted key: {k}")
        if not validate(k, v):
            raise ValueError(f"invalid value for {k}: {v!r}")

    norm = {k: normalise(k, v) for k, v in updates.items()}

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        existing = p.read_text(encoding="utf-8").splitlines(keepends=True)
    else:
        existing = []

    new_lines = _patch_lines(existing, norm)
    new_text = "".join(new_lines)

    # Atomic write: tempfile in same directory + os.replace.
    fd, tmp_path = tempfile.mkstemp(prefix=".i2pd_conf_", dir=str(p.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new_text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, p)
    except Exception:
        # Best-effort cleanup if rename fails.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ─── Convenience used by the daemon ───────────────────────────────────────


def whitelisted_view(values: dict[str, str]) -> dict[str, str]:
    """Filter a dict down to known-safe keys (used when echoing a stored
    config back to the UI)."""
    return {k: v for k, v in values.items() if is_whitelisted(k)}


def known_keys() -> Iterable[str]:
    return tuple(WHITELIST.keys())
