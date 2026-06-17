"""
Security invariants — the enforcement suite.

Every control named in docs/security-invariants.md maps to a named test
here. If a refactor weakens a control, a test goes red. This is the
"build like every network is malicious, every eepsite is hostile" bar
expressed as code.

Grouped by adversary (local device / network / content), mirroring the
threat model.
"""
from __future__ import annotations

import re

import pytest

from scripts.i2p_fetch import normalize_eepsite_url, I2pFetchError, is_i2p_host
from scripts.html_sanitizer import sanitize_html

BASE = "http://example.i2p/page/"


def san(html: str) -> str:
    return sanitize_html(html, BASE)[0]


# ════════════════════════════════════════════════════════════════════
#  NETWORK ADVERSARY — no clearnet egress on the eepsite path (SSRF)
# ════════════════════════════════════════════════════════════════════

class TestSSRFAndEgressInvariants:
    """The eepsite fetch path must NEVER reach anything that isn't an
    .i2p destination — no localhost, no private IPs, no cloud metadata,
    no file://, no clearnet. The .i2p-only host gate enforces this; these
    tests lock it so a refactor can't silently widen it."""

    SSRF_VECTORS = [
        "127.0.0.1/x",
        "localhost/x",
        "0.0.0.0/x",
        "10.0.0.1/x",
        "172.16.0.1/x",
        "192.168.1.1/x",
        "169.254.169.254/latest/meta-data/",   # cloud metadata (AWS/GCP)
        "100.64.0.1/x",                          # CGNAT range
        "[::1]/x",                               # IPv6 loopback
        "[fd00::1]/x",                           # IPv6 ULA
        "file:///etc/passwd",
        "http://127.0.0.1:7070/",                # the daemon's own console
        "http://127.0.0.1:4444/",                # i2pd proxy
        "metadata.google.internal/x",
        "evil.com",
        "https://evil.com/exfil",
        "//evil.com/x",
        "ftp://evil.com/x",
        "gopher://127.0.0.1:6379/x",             # SSRF-to-redis classic
        # ── Nasty URL-parser corpus (the "crime scene with standards") ──
        "http://127.0.0.1%2f.evil.i2p/",         # percent-encoded slash in host
        "http://evil.com@target.i2p/",           # userinfo: clearnet user @ i2p host
        "http://target.i2p@127.0.0.1/",          # userinfo: i2p "user" @ loopback host
        "http://target.i2p%00.evil.com/",        # null-byte host truncation
        "http://target.i2p%0d%0aHost:%20evil.com/",  # CRLF header injection
        "http://target.i2p\\@evil.com/",         # backslash confusion
        "http://[::ffff:127.0.0.1]/",            # IPv4-mapped IPv6 loopback
        "ⓔⓧⓐⓜⓟⓛⓔ.i2p",                          # unicode circled letters (not .i2p TLD)
        "http://exam\u0440le.i2p/",              # cyrillic homoglyph in host
        "http://target.i2p.evil.com/",           # i2p as subdomain of clearnet
        "javascript:alert(1)",                   # script scheme
        "data:text/html,<script>x</script>",     # data scheme
    ]

    @pytest.mark.parametrize("vec", SSRF_VECTORS)
    def test_non_i2p_host_rejected(self, vec):
        with pytest.raises(I2pFetchError) as exc:
            normalize_eepsite_url(vec)
        assert exc.value.reason == "bad-host"

    def test_port_is_stripped_not_a_bypass(self):
        # explicit port on a real .i2p host is allowed but normalized away
        # (the proxy connects to i2pd, not the host:port directly).
        assert normalize_eepsite_url("http://target.i2p:4444/") == "http://target.i2p/"
        assert normalize_eepsite_url("http://target.i2p:1234/x") == "http://target.i2p/x"

    def test_encoded_path_slashes_stay_in_path(self):
        # %2f%2fevil.com in the PATH can't change the host — host is still .i2p
        out = normalize_eepsite_url("http://target.i2p/%2f%2fevil.com")
        assert out.startswith("http://target.i2p/")

    def test_punycode_i2p_tld_allowed_but_bounded(self):
        # an xn-- label under the .i2p TLD is a real i2p host; the point is
        # it can NEVER resolve outside .i2p.
        out = normalize_eepsite_url("http://xn--e28h.i2p/")
        assert out.endswith(".i2p/") and "evil" not in out

    def test_only_dot_i2p_passes(self):
        assert normalize_eepsite_url("example.i2p") == "http://example.i2p/"
        assert normalize_eepsite_url("abcd1234.b32.i2p").endswith(".i2p/")

    def test_i2p_lookalike_rejected(self):
        # host that merely CONTAINS .i2p but isn't an .i2p TLD
        for sneaky in ("example.i2p.evil.com", "evil.com/x.i2p", "evil.com#.i2p"):
            with pytest.raises(I2pFetchError):
                normalize_eepsite_url(sneaky)

    def test_is_i2p_host_strict(self):
        assert is_i2p_host("a.i2p")
        assert is_i2p_host("x.b32.i2p")
        assert not is_i2p_host("a.i2p.evil.com")
        assert not is_i2p_host("127.0.0.1")
        assert not is_i2p_host("localhost")


# ════════════════════════════════════════════════════════════════════
#  CONTENT ADVERSARY — hostile eepsite cannot deanonymize via render
# ════════════════════════════════════════════════════════════════════

class TestContentAdversaryInvariants:
    def test_script_stripped(self):
        assert "<script" not in san('<script>x()</script>').lower()

    def test_event_handler_stripped(self):
        out = san('<div onclick="x()" onmouseover="y()">z</div>').lower()
        assert "onclick" not in out and "onmouseover" not in out

    def test_clearnet_image_never_loaded(self):
        out = san('<img src="https://evil.com/p.png">')
        assert "evil.com" not in out

    def test_clearnet_css_link_stripped(self):
        assert "evil.com" not in san('<link rel=stylesheet href="https://evil.com/s.css">')

    def test_clearnet_css_url_stripped(self):
        assert "evil.com" not in san('<div style="background:url(https://evil.com/b.png)">x</div>')
        assert "evil.com" not in san('<style>@import "https://evil.com/x.css"</style>')

    def test_form_action_clearnet_stripped(self):
        assert "evil.com" not in san('<form action="https://evil.com/x"><input></form>')

    def test_iframe_stripped(self):
        out = san('<iframe src="https://evil.com"></iframe>').lower()
        assert "<iframe" not in out and "evil.com" not in out

    def test_meta_refresh_stripped(self):
        assert "evil.com" not in san('<meta http-equiv="refresh" content="0;url=https://evil.com">')

    def test_svg_script_payload_stripped(self):
        out = san('<svg><script>x()</script></svg>').lower()
        assert "<script" not in out

    def test_legacy_url_attrs_swept(self):
        # input[type=image], body/table background, button formaction
        for vec in [
            '<input type="image" src="https://evil.com/x">',
            '<body background="https://evil.com/x">z</body>',
            '<table background="https://evil.com/x"><tr><td>z</td></tr></table>',
            '<button formaction="https://evil.com/x">z</button>',
        ]:
            assert "evil.com" not in san(vec), vec

    def test_malformed_html_final_scrub_catches_residue(self):
        # parser-differential / broken-nested cases must not leak <script
        # or clearnet tokens into the final output.
        for vec in [
            '<scr<script>ipt>alert(1)</script>',
            '<img src="https://evil.com/p.png',          # unterminated
            '<<<>>><img src=https://evil.com/x>',
        ]:
            out = san(vec).lower()
            assert "<script" not in out, vec
            assert "evil.com" not in out, vec

    def test_in_network_resources_rewritten_to_proxy(self):
        out = san('<img src="/logo.png">')
        assert "/browse/resource?url=" in out
        assert "evil.com" not in out

    def test_csp_always_injected(self):
        out = san("<p>hi</p>")
        assert "Content-Security-Policy" in out
        assert "script-src" in out and "connect-src" in out


# ════════════════════════════════════════════════════════════════════
#  GLOBAL: the no-clearnet / no-script invariants over an adversarial mix
# ════════════════════════════════════════════════════════════════════

class TestGlobalInvariants:
    KITCHEN_SINK = (
        '<script>fetch("https://evil.com")</script>'
        '<img src="https://evil.com/p.png">'
        '<link rel=preconnect href="https://evil.com">'
        '<iframe src="https://evil.com"></iframe>'
        '<form action="https://evil.com"><input></form>'
        '<div style="background:url(https://evil.com/b)">x</div>'
        '<img src="/ok.png" onerror="fetch(\'https://evil.com\')">'
        '<a href="https://evil.com">click</a>'
        '<p>legitimate</p>'
    )

    def test_no_clearnet_survives(self):
        out = san(self.KITCHEN_SINK).lower()
        leaks = [m.group(0) for m in re.finditer(r"https?://([a-z0-9.\-]+)", out)
                 if not m.group(1).endswith(".i2p")]
        assert leaks == [], leaks

    def test_no_script_survives(self):
        out = san(self.KITCHEN_SINK).lower()
        assert "<script" not in out
        assert "javascript:" not in out
        assert not re.search(r"\son[a-z]+\s*=", out)

    def test_legit_content_survives(self):
        assert "legitimate" in san(self.KITCHEN_SINK)
