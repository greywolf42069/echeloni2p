"""
Threat / ad filter list management for Echelon.

Subscribes to upstream blocklists (StevenBlack hosts file, etc.), keeps
them on disk, refreshes them with ETag caching so we don't re-download
unchanged, and compiles them into a single in-memory domain set for
the filtering proxy to consult.

Storage layout, all under ECHELON_FILTERS_ROOT (default ~/.echelon/filters):

    subscriptions.json     # list of subscribed sources + metadata
    cache/<id>.txt         # last successfully-downloaded list body
    cache/<id>.etag        # ETag header for next conditional GET

Decisions are made by `is_domain_blocked()`, which does proper
subdomain matching: 'doubleclick.net' in the list also blocks
'ads.doubleclick.net' but NOT 'mydoubleclick.net' (must be the same
domain or a proper sub-domain).
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import urllib.error
import urllib.request
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

# ─── Defaults / well-known list URLs ─────────────────────────────────────

DEFAULT_FILTERS_ROOT = Path.home() / ".echelon" / "filters"

# Curated short-list of well-known hosts-file blocklists that ship safe
# defaults if the user hasn't subscribed to anything yet. URLs locked
# down — only HTTPS, only well-known maintainers.
WELL_KNOWN_LISTS: list[dict[str, str]] = [
    {
        "id": "stevenblack",
        "name": "StevenBlack/hosts (unified ads + malware)",
        "url": "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
        "format": "hosts",
    },
    {
        "id": "phishing-army",
        "name": "Phishing Army (phishing-only blocklist)",
        "url": "https://phishing.army/download/phishing_army_blocklist.txt",
        "format": "hosts",
    },
]


# ─── URL validation ──────────────────────────────────────────────────────


_URL_RE = re.compile(r"^https?://[A-Za-z0-9._-]{1,253}(?::\d{1,5})?(/[^\s]*)?$", re.I)


def is_safe_list_url(url: str) -> bool:
    """Accept only well-formed http/https URLs without spaces / shell metas."""
    if not isinstance(url, str) or not url:
        return False
    return bool(_URL_RE.match(url))


_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")


def is_safe_domain(domain: str) -> bool:
    if not isinstance(domain, str):
        return False
    d = domain.strip().lower()
    if not d or len(d) > 253:
        return False
    return bool(_DOMAIN_RE.match(d))


# ─── Hosts-file parser ───────────────────────────────────────────────────


_HOSTS_LINE_RE = re.compile(
    r"^\s*(?:(?:0\.0\.0\.0|127\.0\.0\.1|::|::1)\s+)?([A-Za-z0-9._-]+)\s*(?:#.*)?$"
)


def parse_hosts_file(text: str) -> set[str]:
    """Parse a hosts-file (or one-domain-per-line) blocklist.

    Recognises lines like:
        0.0.0.0 ads.example.com
        127.0.0.1 trackers.foo.net
        evil.example.com   # plain one-per-line works too
        # comment lines and blanks are ignored

    Returns a deduplicated set of valid domains. Garbage lines are
    silently skipped — never raises.
    """
    out: set[str] = set()
    if not text:
        return out
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _HOSTS_LINE_RE.match(line)
        if not m:
            continue
        candidate = m.group(1).lower()
        # 'localhost' / 'broadcasthost' / IP addresses caught by the IP rule
        # in some hosts files — drop anything that isn't a real domain.
        if candidate in {"localhost", "broadcasthost", "local", "0.0.0.0", "127.0.0.1"}:
            continue
        if is_safe_domain(candidate):
            out.add(candidate)
    return out


# ─── Subscription model ──────────────────────────────────────────────────


@dataclass
class Subscription:
    id: str
    name: str
    url: str
    fmt: str = "hosts"
    etag: str | None = None
    last_refresh: float = 0.0     # unix ts of last successful download/parse
    last_status: str = "never"    # 'never' | 'ok' | 'not-modified' | 'error: <msg>'
    entry_count: int = 0


def _new_subscription(name: str, url: str, fmt: str = "hosts") -> Subscription:
    return Subscription(id=uuid.uuid4().hex[:12], name=name.strip(), url=url.strip(), fmt=fmt)


# ─── Subscription store on disk ──────────────────────────────────────────


class SubscriptionStore:
    """Persist + load a list of Subscription dicts under FILTERS_ROOT."""

    def __init__(self, root: Path | None = None):
        self.root = Path(root or os.environ.get("ECHELON_FILTERS_ROOT", DEFAULT_FILTERS_ROOT))
        self.cache_dir = self.root / "cache"
        self._subs: list[Subscription] = []
        self._loaded = False

    @property
    def manifest_path(self) -> Path:
        return self.root / "subscriptions.json"

    def load(self) -> list[Subscription]:
        if self._loaded:
            return list(self._subs)
        if not self.manifest_path.exists():
            self._subs = []
            self._loaded = True
            return []
        try:
            raw = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._subs = []
            self._loaded = True
            return []
        self._subs = [Subscription(**row) for row in raw if isinstance(row, dict)]
        self._loaded = True
        return list(self._subs)

    def all(self) -> list[Subscription]:
        return self.load()

    def find(self, sub_id: str) -> Subscription | None:
        for s in self.load():
            if s.id == sub_id:
                return s
        return None

    def add(self, name: str, url: str, fmt: str = "hosts") -> Subscription:
        if not is_safe_list_url(url):
            raise ValueError(f"unsafe list url: {url!r}")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name required")
        if fmt not in ("hosts",):  # only one format for now; extend later
            raise ValueError(f"unsupported format: {fmt!r}")
        # Reject duplicates by URL.
        for existing in self.load():
            if existing.url == url.strip():
                return existing
        sub = _new_subscription(name=name, url=url, fmt=fmt)
        self._subs.append(sub)
        self._persist()
        return sub

    def remove(self, sub_id: str) -> bool:
        before = len(self.load())
        self._subs = [s for s in self._subs if s.id != sub_id]
        if len(self._subs) == before:
            return False
        # Drop cached body + etag.
        for ext in ("txt", "etag"):
            p = self.cache_dir / f"{sub_id}.{ext}"
            try:
                p.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                pass
        self._persist()
        return True

    def update(self, sub: Subscription) -> None:
        self.load()
        for i, s in enumerate(self._subs):
            if s.id == sub.id:
                self._subs[i] = sub
                break
        else:
            self._subs.append(sub)
        self._persist()

    def cached_body_path(self, sub_id: str) -> Path:
        return self.cache_dir / f"{sub_id}.txt"

    def cached_etag_path(self, sub_id: str) -> Path:
        return self.cache_dir / f"{sub_id}.etag"

    def _persist(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # Atomic write of the manifest.
        fd, tmp = tempfile.mkstemp(prefix=".subs_", dir=str(self.root))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump([asdict(s) for s in self._subs], f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.manifest_path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise


# ─── Downloader (with ETag) ──────────────────────────────────────────────


class FilterDownloader:
    """Pluggable wrapper around urllib.request — overridable in tests."""

    timeout: float = 30.0
    max_bytes: int = 64 * 1024 * 1024  # 64 MB safety bound

    def fetch(self, url: str, etag: str | None) -> tuple[int, bytes, str | None]:
        """Return (status, body_bytes, new_etag). status == 304 ⇒ body unchanged."""
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", "Echelon-FilterUpdater/1.0")
        if etag:
            req.add_header("If-None-Match", etag)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                new_etag = resp.headers.get("ETag")
                body = resp.read(self.max_bytes + 1)
                if len(body) > self.max_bytes:
                    raise ValueError("filter list exceeds size limit")
                return status, body, new_etag
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return 304, b"", etag
            raise


def refresh_subscription(
    sub: Subscription,
    store: SubscriptionStore,
    downloader: FilterDownloader | None = None,
    now: float | None = None,
) -> Subscription:
    """Download (or skip via 304), parse, persist. Returns the updated sub."""
    import time as _time
    downloader = downloader or FilterDownloader()
    now = now if now is not None else _time.time()
    try:
        status, body, new_etag = downloader.fetch(sub.url, sub.etag)
    except (urllib.error.URLError, OSError, ValueError) as e:
        sub.last_status = f"error: {e}"
        store.update(sub)
        return sub

    if status == 304:
        sub.last_status = "not-modified"
        sub.last_refresh = now
        store.update(sub)
        return sub

    if status != 200:
        sub.last_status = f"error: HTTP {status}"
        store.update(sub)
        return sub

    text = body.decode("utf-8", errors="replace")
    domains = parse_hosts_file(text) if sub.fmt == "hosts" else set()

    # Persist body + etag for the next conditional GET.
    store.cache_dir.mkdir(parents=True, exist_ok=True)
    store.cached_body_path(sub.id).write_text(text, encoding="utf-8")
    if new_etag:
        store.cached_etag_path(sub.id).write_text(new_etag, encoding="utf-8")
        sub.etag = new_etag

    sub.last_refresh = now
    sub.last_status = "ok"
    sub.entry_count = len(domains)
    store.update(sub)
    return sub


def refresh_all(store: SubscriptionStore, downloader: FilterDownloader | None = None) -> list[Subscription]:
    return [refresh_subscription(sub, store, downloader) for sub in store.all()]


# ─── Compile + decide ────────────────────────────────────────────────────


def compile_blocklist(store: SubscriptionStore) -> set[str]:
    """Union of every cached subscription's domain set."""
    out: set[str] = set()
    for sub in store.all():
        if sub.last_status not in ("ok", "not-modified"):
            continue
        body_path = store.cached_body_path(sub.id)
        if not body_path.exists():
            continue
        try:
            text = body_path.read_text(encoding="utf-8")
        except OSError:
            continue
        if sub.fmt == "hosts":
            out.update(parse_hosts_file(text))
    return out


def is_domain_blocked(domain: str, blocklist: Iterable[str]) -> bool:
    """True iff `domain` is exactly in the blocklist or is a sub-domain
    of one. 'mydoubleclick.net' is NOT blocked when only 'doubleclick.net'
    is present — must be a proper sub-domain."""
    if not isinstance(domain, str):
        return False
    d = domain.strip().lower().rstrip(".")
    if not d:
        return False
    block_set = blocklist if isinstance(blocklist, (set, frozenset)) else set(blocklist)
    if d in block_set:
        return True
    # Walk up the labels: a.b.c.d -> b.c.d -> c.d
    parts = d.split(".")
    for i in range(1, len(parts)):
        suffix = ".".join(parts[i:])
        if suffix in block_set:
            return True
    return False
