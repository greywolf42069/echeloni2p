# Echelon Threat Model

Echelon is a **privacy survival layer for crypto-native users on hostile
networks** — not an I2P skin, not a wallet app. We build assuming every
network is malicious, every eepsite is hostile, every phone is
battery-starved, and the user is not a network engineer.

This document names the adversaries and the controls. Each control maps to
an enforced test in `scripts/tests/test_security_invariants.py` (and the
sanitizer/fetch suites). See `docs/security-invariants.md` for the
control→test table and `docs/non-goals.md` for what we explicitly do NOT
defend.

---

## Adversary 1 — Local device

ISP-grade malware, malicious browser extensions, a compromised wallet, a
hostile Android WebView, clipboard stealers, other apps on the device.

| Control | Mechanism | Enforced |
|---|---|---|
| Daemon binds loopback only | `127.0.0.1` bind, never `0.0.0.0` | daemon constants |
| No unauthenticated LAN exposure | `ECHELON_REQUIRE_AUTH=1` per-device token gate | `test_auth*.py` |
| Deny arbitrary local file reads | eepsite path is `.i2p`-only; publish path is sanitised + sandboxed under the eepsite root | `test_security_invariants`, `test_sync_daemon` |
| No open-proxy behaviour | eepsite fetch refuses non-`.i2p` hosts; threat-proxy refuses CONNECT/HTTPS | `test_security_invariants`, `test_threat_proxy` |
| Strict URL normalization | `normalize_eepsite_url` lower-cases, strips scheme/port, validates `.i2p` TLD | `test_i2p_fetch`, `test_security_invariants` |
| Reject clearnet redirects | redirect `Location` re-validated as `.i2p` or refused | `test_i2p_integration` |
| Reject non-I2P origins | `.i2p`-only host gate (SSRF defense) | `test_security_invariants` |
| No wallet secrets in daemon logs | daemon never receives wallet secrets; only pubkeys + signatures | by design |
| Wallet ownership = signature, not claim | ed25519 challenge signature for paid features | `test_eepgen_auth` |

## Adversary 2 — Network

The ISP, carrier, campus/coffee-shop Wi-Fi, hotel NAT, a malicious I2P
first-hop peer, a malicious Yggdrasil peer, a passive link observer.

| Control | Mechanism | Enforced |
|---|---|---|
| Works under hostile NAT | i2pd-over-Yggdrasil mode (Network Doctor autopilot) | live-verified; `test_network_doctor` |
| No clearnet fallback for eepsites | eepsite fetch is `.i2p`-only, full stop | `test_security_invariants` |
| Addressbook-bootstrap trap avoided | b32 addresses fetchable without addressbook | `test_i2p_live` |
| Website-fingerprinting defense | Tamaraw-style cell padding + length bucketing + constant rate | `test_traffic_regularization` |
| WF defense opt-in → adaptive | `wf=1` Privacy tier now; adaptive default for paranoid mode | `docs/anonymity-value-add.md` |
| First-hop sees only ciphertext | I2P garlic routing (inherited); Yggdrasil carries i2pd ciphertext | I2P/Yggdrasil design |

## Adversary 3 — Content (hostile eepsite)

An eepsite operator who controls the HTML/CSS/headers and wants to
deanonymize the visitor (clearnet beacon) or run code.

| Control | Mechanism | Enforced |
|---|---|---|
| Script stripping | `<script>/<noscript>/<template>` removed with contents | `test_security_invariants` |
| Event-handler stripping | all `on*` attributes removed | `test_security_invariants` |
| Global URL-attribute sweep | every URL-bearing attr on ANY tag policed (incl. legacy `background`, `input[type=image]`, `formaction`) | `test_security_invariants` |
| CSS URL stripping | `url()`/`@import` sanitised in inline + `<style>` + standalone CSS | `test_html_sanitizer` |
| CSP injection | strict `script-src 'none'; connect-src 'none'` meta + header | `test_security_invariants` |
| Form action policing | clearnet form actions neutralised | `test_security_invariants` |
| No clearnet resource loads | clearnet resources stripped; in-network rewritten to proxy | `test_security_invariants` |
| Proxy rewriting for in-network | resources re-fetched through the daemon | `test_html_sanitizer` |
| Adversarial corpus, forever | ~80-payload mXSS/encoding/malformed suite | `test_sanitizer_validation` |
| Malformed-HTML final scrub | residual `<script`/scheme/clearnet tokens neutralised | `test_security_invariants` |

---

## Test posture

- **Deterministic harness** — fake i2pd replays captured real wire behavior.
- **Live network test** — gated behind `ECHELON_I2P_LIVE=1`, asserts the
  invariants on real eepsite content.
- **Hostile corpus** — adversarial sanitizer payloads, expanded forever.
- **CI green is the floor.** No privacy claim ships without a test or an
  explicit "design-only" mark in `docs/anonymity-value-add.md`.

A found bypass is the system working — add the vector, fix the layer, keep
the bar rising.
