"""
Eepsite HTML sanitizer (Phase L.2) — the deanonymization defense.

THREAT MODEL: a malicious (or merely careless) eepsite embeds a clearnet
resource — <img src="https://evil/pixel.png">, a web font, a tracker
script, an <iframe>, a form posting to clearnet. If the browser webview
renders that raw HTML, the webview loads the clearnet resource DIRECTLY,
over clearnet, revealing the user's real IP. One tracking pixel
deanonymizes the visitor. (Confirmed real: PurpleI2P/i2pd#1857.)

DEFENSE: the daemon sanitizes eepsite HTML server-side BEFORE the webview
ever sees it. Every vector that could cause an outbound request is
neutralized here, and a strict Content-Security-Policy is injected as
defense-in-depth. The webview only renders already-safe HTML.

Belt:       strip / neutralize every resource-loading + script vector.
Suspenders: inject CSP that blocks scripts + all non-proxied network.

Resource policy:
  - In-network resources (relative paths, *.i2p hosts) on img/link-css
    are REWRITTEN to go through the daemon's resource proxy
    (/browse/resource?url=...), so they load IP-safely through i2pd.
  - Clearnet resources are STRIPPED entirely and counted as "blocked".
  - data: URIs on images are allowed (no network).
  - ALL scripts are removed (v0.1: eepsites render no-JS for safety).
  - ALL inline event handlers (on*) are removed.
  - <a> links: in-network rewritten to re-browse through the daemon;
    clearnet links are neutralized (href removed, marked) so a click
    can never navigate the webview to clearnet.

This module is pure (HTML string in → sanitized HTML string + report
out). No I/O, no network. Maximally testable — and it is the most
heavily tested file in the project.
"""
from __future__ import annotations

import dataclasses
import html
import re
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote, urljoin, urlparse

# Tags removed entirely (with their contents for raw-text ones).
DROP_TAGS_WITH_CONTENT = frozenset({"script", "noscript", "template"})
# Tags removed but whose children we keep (unwrap) — none for now; we
# drop these whole because they only load external content.
DROP_TAGS = frozenset({
    "object", "embed", "applet", "base", "iframe", "frame", "frameset",
    "link",  # handled specially (stylesheet rewrite) — see _handle_link
    "audio", "video", "source", "track",
})
# Attributes that carry a URL we must police, per tag.
URL_ATTRS = {
    "img": ("src", "srcset", "longdesc"),
    "a": ("href",),
    "area": ("href",),
    "form": ("action",),
    "use": ("href", "xlink:href"),
    "image": ("href", "xlink:href"),
    "input": ("src", "formaction"),
    "button": ("formaction",),
    "blockquote": ("cite",),
    "q": ("cite",),
    "del": ("cite",),
    "ins": ("cite",),
}
# Defense-in-depth: ANY of these attribute names, on ANY tag, carries a
# URL that could trigger an outbound request. Policed globally so a tag
# we didn't enumerate above (or a novel/again-deprecated attribute)
# can't smuggle a clearnet load. `background` is the classic legacy
# image-loader (body/table/td); `src`/`href`/`action`/`poster`/`data`
# cover the rest.
GLOBAL_URL_ATTRS = frozenset({
    "src", "href", "xlink:href", "action", "formaction", "background",
    "poster", "data", "cite", "ping", "longdesc", "srcset", "lowsrc",
    "dynsrc",
})
# Event-handler attributes (any on*) and other JS-injection vectors are
# stripped wholesale; see _is_event_attr.

_CSS_URL_RE = re.compile(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", re.IGNORECASE)
_I2P_HOST_RE = re.compile(r"^[a-z0-9.-]+\.i2p$", re.IGNORECASE)

# The CSP we inject. No scripts, no plugins, no framing, and crucially
# connect-src 'none' so even if something slipped through it can't phone
# home. img/style/font allowed only from the daemon origin (the resource
# proxy) + data:. We don't know the daemon origin at sanitize time, so we
# use 'self' — the sanitized doc is served from the daemon origin via
# srcdoc-with-base or the /browse endpoint, making 'self' the daemon.
INJECTED_CSP = (
    "default-src 'none'; "
    "img-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; "
    "media-src 'none'; "
    "script-src 'none'; "
    "object-src 'none'; "
    "frame-src 'none'; "
    "connect-src 'none'; "
    "form-action 'none'; "
    "base-uri 'none'"
)


@dataclasses.dataclass
class SanitizeReport:
    blocked_clearnet: int          # clearnet resources stripped
    scripts_removed: int
    handlers_removed: int          # on* attributes stripped
    rewritten_in_network: int      # resources re-pointed at the proxy


def is_i2p_host(host: str) -> bool:
    return bool(_I2P_HOST_RE.match((host or "").strip()))


def classify_url(raw: str, base_url: str) -> Tuple[str, str]:
    """Classify a URL referenced by eepsite content.

    Returns (kind, resolved) where kind ∈:
      - 'data'      : a data: URI (safe, no network)
      - 'in-network': resolves to an .i2p host (relative or explicit)
      - 'clearnet'  : resolves to a non-.i2p host (DANGEROUS)
      - 'empty'     : nothing / fragment-only / javascript: / etc.
    `resolved` is the absolute resolved URL for in-network/clearnet.
    """
    s = (raw or "").strip()
    if not s:
        return ("empty", "")
    low = s.lower()
    if low.startswith("data:"):
        return ("data", s)
    if low.startswith(("javascript:", "vbscript:", "about:", "blob:", "file:")):
        # Dangerous / non-network pseudo-schemes — treat as empty (drop).
        return ("empty", "")
    if s.startswith("#"):
        return ("empty", s)  # pure fragment, no navigation off-page
    # Resolve relative against the base eepsite URL.
    resolved = urljoin(base_url, s)
    host = urlparse(resolved).hostname or ""
    if is_i2p_host(host):
        return ("in-network", resolved)
    return ("clearnet", resolved)


def _resource_proxy_path(absolute_url: str) -> str:
    """Rewrite an in-network resource URL to the daemon resource proxy."""
    return f"/browse/resource?url={quote(absolute_url, safe='')}"


def _browse_path(absolute_url: str) -> str:
    """Rewrite an in-network page link to re-browse through the daemon."""
    return f"/browse?url={quote(absolute_url, safe='')}"


def _is_event_attr(name: str) -> bool:
    return name.lower().startswith("on")


def _sanitize_inline_style(value: str, base_url: str, report: SanitizeReport) -> str:
    """Neutralize url(...) references inside an inline style attribute or
    <style> block. In-network → proxy; clearnet → removed."""
    def repl(m: re.Match) -> str:
        kind, resolved = classify_url(m.group(1), base_url)
        if kind == "in-network":
            report.rewritten_in_network += 1
            return f"url({_resource_proxy_path(resolved)})"
        if kind == "data":
            return m.group(0)
        # clearnet / empty → drop the url() entirely
        report.blocked_clearnet += 1
        return "none"
    # Also strip @import that points to clearnet.
    value = re.sub(
        r"@import\s+(?:url\()?['\"]?([^;'\")]+)['\"]?\)?\s*;?",
        lambda m: _import_repl(m, base_url, report),
        value,
        flags=re.IGNORECASE,
    )
    return _CSS_URL_RE.sub(repl, value)


def _import_repl(m: re.Match, base_url: str, report: SanitizeReport) -> str:
    kind, resolved = classify_url(m.group(1), base_url)
    if kind == "in-network":
        report.rewritten_in_network += 1
        return f"@import url({_resource_proxy_path(resolved)});"
    report.blocked_clearnet += 1
    return ""


class _Sanitizer(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.out: List[str] = []
        self.report = SanitizeReport(0, 0, 0, 0)
        self._skip_depth = 0          # inside a drop-with-content tag
        self._skip_tag: Optional[str] = None
        self._in_style = False
        self._head_seen = False

    # -- helpers -------------------------------------------------------

    def _emit(self, s: str) -> None:
        if self._skip_depth == 0:
            self.out.append(s)

    def _attrs_to_str(self, attrs: List[Tuple[str, Optional[str]]]) -> str:
        parts = []
        for k, v in attrs:
            if v is None:
                parts.append(f" {k}")
            else:
                parts.append(f' {k}="{html.escape(v, quote=True)}"')
        return "".join(parts)

    # -- tag handlers --------------------------------------------------

    def handle_starttag(self, tag: str, attrs):
        self._handle(tag, attrs, self_closing=False)

    def handle_startendtag(self, tag: str, attrs):
        self._handle(tag, attrs, self_closing=True)

    def _handle(self, tag, attrs, self_closing):
        if self._skip_depth > 0:
            # we're inside a dropped subtree; ignore nested starts unless
            # they're the same raw-text tag (handled by parser states)
            return

        if tag in DROP_TAGS_WITH_CONTENT:
            if tag == "script":
                self.report.scripts_removed += 1
            if not self_closing:
                self._skip_depth = 1
                self._skip_tag = tag.lower()  # ensure case-insensitive matching
            return

        if tag == "link":
            self._handle_link(attrs)
            return

        if tag == "meta":
            self._handle_meta(attrs)
            return

        if tag in DROP_TAGS:
            # Drop the whole element. It only exists to load external
            # content (object/embed/iframe/audio/video/etc.).
            self.report.blocked_clearnet += 1
            return

        if tag == "style":
            self._in_style = True
            self._emit("<style>")
            return

        clean = self._clean_attrs(tag, attrs)
        slash = " /" if self_closing else ""
        self._emit(f"<{tag}{self._attrs_to_str(clean)}{slash}>")

    def handle_endtag(self, tag: str):
        if self._skip_depth > 0:
            # Case-insensitive match — prevents <script>...<SCRIPT> from
            # leaving _skip_depth permanently elevated.
            if tag.lower() == self._skip_tag:
                self._skip_depth = 0
                self._skip_tag = None
            return
        if tag in DROP_TAGS_WITH_CONTENT or tag in DROP_TAGS or tag == "link" or tag == "meta":
            return
        if tag == "style":
            self._in_style = False
            self._emit("</style>")
            return
        self._emit(f"</{tag}>")

    def handle_data(self, data: str):
        if self._skip_depth > 0:
            return
        if self._in_style:
            self._emit(_sanitize_inline_style(data, self.base_url, self.report))
        else:
            self._emit(html.escape(data, quote=False))

    def handle_comment(self, data: str):
        # Drop comments entirely (conditional comments can hide markup).
        return

    def handle_entityref(self, name):
        if self._skip_depth == 0:
            self._emit(f"&{name};")

    def handle_charref(self, name):
        if self._skip_depth == 0:
            self._emit(f"&#{name};")

    # -- attribute cleaning -------------------------------------------

    def _clean_attrs(self, tag, attrs):
        out = []
        url_attrs = URL_ATTRS.get(tag, ())
        for name, value in attrs:
            lname = name.lower()
            if _is_event_attr(lname):
                self.report.handlers_removed += 1
                continue
            if lname in ("srcdoc",):
                # nested document — drop
                self.report.handlers_removed += 1
                continue
            if lname == "style" and value:
                out.append((name, _sanitize_inline_style(value, self.base_url, self.report)))
                continue
            if lname in url_attrs or lname in GLOBAL_URL_ATTRS:
                handled = self._clean_url_attr(tag, lname, value)
                if handled is not None:
                    out.append((name, handled))
                continue
            # Generic attribute — keep as-is (already escaped on emit).
            out.append((name, value))
        return out

    def _clean_url_attr(self, tag, attr, value) -> Optional[str]:
        """Return a safe value for a URL attribute, or None to drop it."""
        if value is None:
            return None
        # srcset: multiple comma-separated candidates
        if attr == "srcset":
            kept = []
            for cand in value.split(","):
                url_part = cand.strip().split(" ")[0]
                kind, resolved = classify_url(url_part, self.base_url)
                if kind == "in-network":
                    self.report.rewritten_in_network += 1
                    rest = cand.strip()[len(url_part):]
                    kept.append(f"{_resource_proxy_path(resolved)}{rest}")
                elif kind == "data":
                    kept.append(cand.strip())
                else:
                    self.report.blocked_clearnet += 1
            return ", ".join(kept) if kept else None

        kind, resolved = classify_url(value, self.base_url)

        # <a>/<area> links: navigation, not auto-load.
        if tag in ("a", "area") and attr == "href":
            if kind == "in-network":
                self.report.rewritten_in_network += 1
                return _browse_path(resolved)
            if kind == "empty":
                # Preserve ONLY pure fragments (#section). Everything else
                # classified empty (javascript:, vbscript:, about:, etc.)
                # is dropped so a click can't execute script or navigate
                # to a pseudo-scheme.
                if value.strip().startswith("#"):
                    return value
                self.report.handlers_removed += 1
                return None
            # clearnet link — neutralize so a click can't navigate to clearnet
            self.report.blocked_clearnet += 1
            return None

        # form action
        if tag == "form" and attr == "action":
            if kind == "in-network":
                self.report.rewritten_in_network += 1
                return _browse_path(resolved)
            # clearnet/empty form target — neutralize
            self.report.blocked_clearnet += 1
            return None

        # resource-loading attrs (img src, use href, etc.)
        if kind == "in-network":
            self.report.rewritten_in_network += 1
            return _resource_proxy_path(resolved)
        if kind == "data":
            return value
        # clearnet / empty resource → drop the attribute
        self.report.blocked_clearnet += 1
        return None

    def _handle_link(self, attrs):
        d = {k.lower(): (v or "") for k, v in attrs}
        rel = d.get("rel", "").lower()
        href = d.get("href", "")
        # Only stylesheets are allowed (rewritten); everything else
        # (preload/prefetch/dns-prefetch/preconnect/icon/...) is dropped.
        if "stylesheet" in rel and href:
            kind, resolved = classify_url(href, self.base_url)
            if kind == "in-network":
                self.report.rewritten_in_network += 1
                self._emit(f'<link rel="stylesheet" href="{html.escape(_resource_proxy_path(resolved), quote=True)}">')
                return
            self.report.blocked_clearnet += 1
            return
        # any other link rel → drop (preconnect/dns-prefetch leak DNS)
        if rel:
            self.report.blocked_clearnet += 1

    def _handle_meta(self, attrs):
        d = {k.lower(): (v or "") for k, v in attrs}
        http_equiv = d.get("http-equiv", "").lower()
        # Drop meta refresh (can redirect to clearnet) and any CSP the
        # eepsite tries to set (we inject our own).
        if http_equiv in ("refresh", "content-security-policy"):
            self.report.blocked_clearnet += 1
            return
        # Keep charset / viewport / other benign metas.
        self._emit(f"<meta{self._attrs_to_str(list(attrs))}>")


def sanitize_css(raw_css: str, base_url: str) -> str:
    """Public CSS sanitizer for standalone stylesheet responses served
    through /browse/resource. Neutralizes url()/@import the same way
    inline styles are handled; clearnet refs dropped, in-network refs
    rewritten to the resource proxy."""
    throwaway = SanitizeReport(0, 0, 0, 0)
    return _sanitize_inline_style(raw_css, base_url, throwaway)


def sanitize_html(raw_html: str, base_url: str) -> Tuple[str, SanitizeReport]:
    """Sanitize eepsite HTML for safe in-webview rendering.

    Returns (safe_html, report). The safe_html has our CSP injected and
    every clearnet leak vector neutralized.
    """
    parser = _Sanitizer(base_url)
    parser.feed(raw_html)
    parser.close()
    body = "".join(parser.out)

    # ── Final defense-in-depth scrub ────────────────────────────────
    # Parser-differential / mutation-XSS shapes (e.g. "<scr<script>ipt>")
    # can leave a literal "<script" or a clearnet token sitting in what
    # the parser treated as malformed-tag text. The injected CSP +
    # no-allow-same-origin sandbox already neutralize execution, but we
    # belt it: neutralize any surviving "<script", "javascript:", and
    # bare clearnet "http(s)://host" tokens that aren't .i2p. This runs
    # on the already-escaped body, so it only catches things the
    # structured parse missed.
    body = _final_scrub(body)

    csp_meta = f'<meta http-equiv="Content-Security-Policy" content="{html.escape(INJECTED_CSP, quote=True)}">'
    safe_doc = _inject_into_head(body, csp_meta)
    return safe_doc, parser.report


_SCRIPT_LITERAL_RE = re.compile(r"<\s*/?\s*script", re.IGNORECASE)
_JS_SCHEME_RE = re.compile(r"javascript\s*:", re.IGNORECASE)
_VBS_SCHEME_RE = re.compile(r"vbscript\s*:", re.IGNORECASE)
# A bare http(s) URL whose host is NOT an .i2p destination.
_CLEARNET_TOKEN_RE = re.compile(
    r"https?://(?![a-z0-9.\-]+\.i2p[/\s\"'>)])[a-z0-9.\-]+",
    re.IGNORECASE,
)


def _final_scrub(s: str) -> str:
    """Neutralize residual script literals + clearnet tokens left by
    malformed-markup parsing. Pure string pass over already-escaped
    output. Replaces, never executes."""
    s = _SCRIPT_LITERAL_RE.sub("&lt;script-removed", s)
    s = _JS_SCHEME_RE.sub("blocked:", s)
    s = _VBS_SCHEME_RE.sub("blocked:", s)
    s = _CLEARNET_TOKEN_RE.sub("blocked://clearnet-removed", s)
    return s


def _inject_into_head(doc: str, snippet: str) -> str:
    """Insert `snippet` right after <head> if present, else after <html>,
    else prepend to the document."""
    m = re.search(r"<head[^>]*>", doc, re.IGNORECASE)
    if m:
        i = m.end()
        return doc[:i] + snippet + doc[i:]
    m = re.search(r"<html[^>]*>", doc, re.IGNORECASE)
    if m:
        i = m.end()
        return doc[:i] + f"<head>{snippet}</head>" + doc[i:]
    return f"<head>{snippet}</head>" + doc
