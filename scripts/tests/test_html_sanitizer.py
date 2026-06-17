"""
HTML sanitizer tests — the deanonymization defense.

This is the most security-critical module in Echelon, so it gets the
heaviest coverage. The golden rule under test: NO clearnet URL may
survive into the sanitized output in any attribute, style, or tag that
could cause the webview to make an outbound request.
"""
from __future__ import annotations

import re

import pytest

from scripts.html_sanitizer import (
    INJECTED_CSP,
    classify_url,
    is_i2p_host,
    sanitize_html,
)

BASE = "http://example.i2p/page/"


def sanitize(html: str):
    return sanitize_html(html, BASE)


def assert_no_clearnet(out: str):
    """The core invariant: no http(s):// clearnet origin anywhere in the
    output. (Proxy paths are relative /browse... so they never carry a
    scheme; in-network rewrites are scheme-less proxy paths.)"""
    # Any absolute http(s) URL in output is a leak UNLESS it's inside the
    # injected CSP meta (which references 'self'/'none' only, no URLs).
    urls = re.findall(r"https?://[^\s\"'>)]+", out)
    # Filter out anything that's purely inside the CSP directive (there
    # shouldn't be any URLs there at all).
    assert urls == [], f"clearnet URL(s) leaked into output: {urls}"


# ── classify_url ────────────────────────────────────────────────────


class TestClassify:
    def test_data_uri(self):
        assert classify_url("data:image/png;base64,AAAA", BASE)[0] == "data"

    def test_relative_is_in_network(self):
        kind, resolved = classify_url("/img/logo.png", BASE)
        assert kind == "in-network"
        assert resolved == "http://example.i2p/img/logo.png"

    def test_relative_dotpath_in_network(self):
        kind, resolved = classify_url("../a.css", BASE)
        assert kind == "in-network"
        assert resolved == "http://example.i2p/a.css"

    def test_explicit_i2p_host_in_network(self):
        kind, resolved = classify_url("http://other.i2p/x", BASE)
        assert kind == "in-network"
        assert resolved == "http://other.i2p/x"

    def test_b32_i2p_in_network(self):
        kind, _ = classify_url("http://abcd1234.b32.i2p/", BASE)
        assert kind == "in-network"

    def test_clearnet_host(self):
        kind, resolved = classify_url("https://evil.com/pixel.png", BASE)
        assert kind == "clearnet"
        assert resolved == "https://evil.com/pixel.png"

    def test_protocol_relative_clearnet(self):
        # //evil.com/x resolves to http://evil.com/x → clearnet
        kind, _ = classify_url("//evil.com/x", BASE)
        assert kind == "clearnet"

    def test_javascript_uri_is_empty(self):
        assert classify_url("javascript:alert(1)", BASE)[0] == "empty"

    def test_fragment_is_empty(self):
        assert classify_url("#section", BASE)[0] == "empty"

    def test_empty(self):
        assert classify_url("", BASE)[0] == "empty"

    def test_is_i2p_host(self):
        assert is_i2p_host("example.i2p")
        assert is_i2p_host("abcd.b32.i2p")
        assert not is_i2p_host("example.com")
        assert not is_i2p_host("example.i2p.evil.com")


# ── Script / JS vectors ─────────────────────────────────────────────


class TestScripts:
    def test_script_tag_removed_with_content(self):
        out, rep = sanitize("<p>hi</p><script>steal()</script><p>bye</p>")
        assert "steal" not in out
        assert "<script" not in out
        assert rep.scripts_removed == 1
        assert "hi" in out and "bye" in out

    def test_inline_event_handler_removed(self):
        out, rep = sanitize('<img src="/a.png" onerror="fetch(\'https://evil/\')">')
        assert "onerror" not in out
        assert "evil" not in out
        assert rep.handlers_removed == 1

    def test_onclick_removed(self):
        out, rep = sanitize('<div onclick="leak()">x</div>')
        assert "onclick" not in out
        assert rep.handlers_removed == 1

    def test_javascript_href_neutralized(self):
        out, _ = sanitize('<a href="javascript:steal()">click</a>')
        assert "javascript:" not in out
        assert "steal" not in out

    def test_noscript_removed(self):
        out, _ = sanitize('<noscript><img src="https://evil/p.png"></noscript>')
        assert "evil" not in out


# ── Clearnet resource leaks (the core threat) ───────────────────────


class TestClearnetLeaks:
    def test_clearnet_img_stripped(self):
        out, rep = sanitize('<img src="https://evil.com/pixel.png">')
        assert_no_clearnet(out)
        assert "evil.com" not in out
        assert rep.blocked_clearnet >= 1

    def test_clearnet_img_attr_dropped_but_tag_kept(self):
        out, _ = sanitize('<img src="https://evil.com/p.png" alt="hi">')
        # img tag may remain (alt preserved) but with NO clearnet src
        assert "evil.com" not in out
        assert "alt" in out

    def test_protocol_relative_img_stripped(self):
        out, _ = sanitize('<img src="//evil.com/p.png">')
        assert_no_clearnet(out)
        assert "evil.com" not in out

    def test_clearnet_stylesheet_link_dropped(self):
        out, rep = sanitize('<link rel="stylesheet" href="https://evil.com/s.css">')
        assert "evil.com" not in out
        assert rep.blocked_clearnet >= 1

    def test_preconnect_dropped(self):
        out, _ = sanitize('<link rel="preconnect" href="https://evil.com">')
        assert "evil.com" not in out

    def test_dns_prefetch_dropped(self):
        out, _ = sanitize('<link rel="dns-prefetch" href="//evil.com">')
        assert "evil.com" not in out

    def test_iframe_dropped(self):
        out, rep = sanitize('<iframe src="https://evil.com/frame"></iframe>')
        assert "evil.com" not in out
        assert "<iframe" not in out

    def test_object_embed_dropped(self):
        out, _ = sanitize('<object data="https://evil.com/x"></object><embed src="https://evil.com/y">')
        assert "evil.com" not in out
        assert "<object" not in out and "<embed" not in out

    def test_video_audio_dropped(self):
        out, _ = sanitize('<video src="https://evil.com/v.mp4"></video>')
        assert "evil.com" not in out

    def test_clearnet_in_inline_style_url_stripped(self):
        out, _ = sanitize('<div style="background:url(https://evil.com/bg.png)">x</div>')
        assert "evil.com" not in out

    def test_clearnet_in_style_block_stripped(self):
        out, _ = sanitize('<style>body{background:url("https://evil.com/bg.png")}</style>')
        assert "evil.com" not in out

    def test_css_import_clearnet_stripped(self):
        out, _ = sanitize('<style>@import url(https://evil.com/x.css);</style>')
        assert "evil.com" not in out

    def test_meta_refresh_dropped(self):
        out, _ = sanitize('<meta http-equiv="refresh" content="0;url=https://evil.com">')
        assert "evil.com" not in out

    def test_form_action_clearnet_neutralized(self):
        out, _ = sanitize('<form action="https://evil.com/submit"><input></form>')
        assert "evil.com" not in out

    def test_srcset_clearnet_candidates_stripped(self):
        out, _ = sanitize('<img srcset="https://evil.com/1x.png 1x, https://evil.com/2x.png 2x">')
        assert "evil.com" not in out

    def test_base_tag_dropped(self):
        # A <base href="https://evil"> would re-anchor all relative URLs
        # to clearnet — must be dropped.
        out, _ = sanitize('<base href="https://evil.com/"><img src="/a.png">')
        assert "evil.com" not in out

    def test_svg_use_xlink_clearnet_stripped(self):
        out, _ = sanitize('<svg><use xlink:href="https://evil.com/s.svg#i"></use></svg>')
        assert "evil.com" not in out

    def test_comment_with_clearnet_dropped(self):
        out, _ = sanitize('<!-- <img src="https://evil.com/p.png"> --><p>hi</p>')
        assert "evil.com" not in out
        assert "hi" in out


# ── In-network resources are rewritten to the proxy ─────────────────


class TestInNetworkRewrite:
    def test_relative_img_rewritten_to_proxy(self):
        out, rep = sanitize('<img src="/img/logo.png">')
        assert "/browse/resource?url=" in out
        assert "http%3A%2F%2Fexample.i2p%2Fimg%2Flogo.png" in out
        assert rep.rewritten_in_network == 1
        assert_no_clearnet(out)

    def test_relative_stylesheet_rewritten(self):
        out, rep = sanitize('<link rel="stylesheet" href="style.css">')
        assert "/browse/resource?url=" in out
        assert rep.rewritten_in_network == 1

    def test_in_network_anchor_rewritten_to_browse(self):
        out, rep = sanitize('<a href="/other-page">link</a>')
        assert "/browse?url=" in out
        assert rep.rewritten_in_network == 1

    def test_explicit_i2p_anchor_rewritten(self):
        out, _ = sanitize('<a href="http://other.i2p/x">link</a>')
        assert "/browse?url=" in out
        assert "other.i2p" in out  # the encoded target

    def test_fragment_anchor_preserved(self):
        out, _ = sanitize('<a href="#section">jump</a>')
        assert 'href="#section"' in out

    def test_in_network_style_url_rewritten(self):
        out, rep = sanitize('<div style="background:url(/bg.png)">x</div>')
        assert "/browse/resource?url=" in out
        assert rep.rewritten_in_network == 1

    def test_data_uri_image_preserved(self):
        data = "data:image/png;base64,iVBORw0KGgo="
        out, _ = sanitize(f'<img src="{data}">')
        assert data in out


# ── CSP injection ───────────────────────────────────────────────────


class TestCSP:
    def test_csp_injected_into_head(self):
        out, _ = sanitize("<html><head><title>x</title></head><body>hi</body></html>")
        assert "Content-Security-Policy" in out
        # CSP value is HTML-attribute-escaped (' → &#x27;); the browser
        # decodes it before parsing the policy. Assert on the directive
        # keywords which survive escaping.
        assert "script-src" in out
        assert "connect-src" in out
        assert "none" in out

    def test_csp_injected_when_no_head(self):
        out, _ = sanitize("<body>hi</body>")
        assert "Content-Security-Policy" in out

    def test_csp_injected_into_bare_fragment(self):
        out, _ = sanitize("<p>just a fragment</p>")
        assert "Content-Security-Policy" in out

    def test_eepsite_cannot_override_our_csp(self):
        # An eepsite trying to set a permissive CSP must be dropped.
        out, _ = sanitize(
            '<head><meta http-equiv="Content-Security-Policy" content="default-src *"><title>x</title></head>'
        )
        assert "default-src *" not in out
        # Our strict CSP is present (directive keyword survives escaping)
        assert "connect-src" in out

    def test_injected_csp_constant_is_strict(self):
        assert "script-src 'none'" in INJECTED_CSP
        assert "connect-src 'none'" in INJECTED_CSP
        assert "default-src 'none'" in INJECTED_CSP


# ── Benign content is preserved ─────────────────────────────────────


class TestBenignPreserved:
    def test_text_and_structure_kept(self):
        out, _ = sanitize("<h1>Title</h1><p>Some <strong>bold</strong> text.</p>")
        assert "Title" in out
        assert "<strong>bold</strong>" in out

    def test_alt_and_title_attrs_kept(self):
        out, _ = sanitize('<img src="/a.png" alt="logo" title="our logo">')
        assert 'alt="logo"' in out
        assert 'title="our logo"' in out

    def test_class_and_id_kept(self):
        out, _ = sanitize('<div class="hero" id="top">x</div>')
        assert 'class="hero"' in out
        assert 'id="top"' in out

    def test_charset_meta_kept(self):
        out, _ = sanitize('<head><meta charset="utf-8"></head>')
        assert "charset" in out

    def test_text_is_html_escaped(self):
        out, _ = sanitize("<p>5 < 10 & 3 > 2</p>")
        assert "&lt;" in out and "&gt;" in out and "&amp;" in out

    def test_report_counts_accurate(self):
        out, rep = sanitize(
            '<script>a</script>'
            '<img src="https://evil.com/p.png">'
            '<img src="/ok.png">'
            '<div onclick="x">y</div>'
        )
        assert rep.scripts_removed == 1
        assert rep.blocked_clearnet >= 1
        assert rep.rewritten_in_network == 1
        assert rep.handlers_removed == 1


# ── Adversarial / malformed input doesn't crash ─────────────────────


class TestAdversarial:
    def test_unclosed_tags(self):
        out, _ = sanitize("<div><p><img src=/a.png><span>")
        assert_no_clearnet(out)

    def test_mixed_case_tags_and_attrs(self):
        out, _ = sanitize('<IMG SRC="https://EVIL.com/p.png" OnError="x">')
        assert "EVIL.com" not in out.upper().replace("EVIL.COM", "EVIL.com") or "evil" not in out.lower()

    def test_whitespace_in_url(self):
        out, _ = sanitize('<img src="  https://evil.com/p.png  ">')
        assert "evil.com" not in out

    def test_empty_input(self):
        out, _ = sanitize("")
        assert "Content-Security-Policy" in out

    def test_deeply_nested(self):
        out, _ = sanitize("<div>" * 50 + "<img src='https://evil.com/p.png'>" + "</div>" * 50)
        assert "evil.com" not in out

    def test_garbage_input(self):
        out, _ = sanitize("<<<>>><img src=<>><script")
        # must not raise; clearnet-free by construction
        assert_no_clearnet(out)
