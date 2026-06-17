# Security Invariants → Tests

Every invariant Echelon claims is mapped to a named, enforced test. If a
refactor weakens an invariant, a test goes red. This table is the contract.

## SSRF / egress (network adversary)

| Invariant | Test |
|---|---|
| localhost rejected on eepsite path | `test_security_invariants::TestSSRFAndEgressInvariants::test_non_i2p_host_rejected[127.0.0.1/x]` |
| private IPv4 (10/172.16/192.168) rejected | same param test, those vectors |
| CGNAT range (100.64/10) rejected | same |
| cloud metadata (169.254.169.254, metadata.google.internal) rejected | same |
| IPv6 loopback/ULA rejected | same |
| `file://` rejected | same |
| the daemon's own console/proxy ports rejected | same (`http://127.0.0.1:7070`, `:4444`) |
| `gopher://`/`ftp://` SSRF schemes rejected | same |
| `.i2p`-lookalike hostnames rejected | `test_i2p_lookalike_rejected` |
| only `*.i2p` / `*.b32.i2p` passes | `test_only_dot_i2p_passes`, `test_is_i2p_host_strict` |
| clearnet redirect never followed | `test_i2p_integration::test_redirect_to_clearnet_rejected` |
| redirect loop bounded | `test_i2p_integration::test_redirect_loop_bounded` |

## Content sanitization (content adversary)

| Invariant | Test |
|---|---|
| `<script>` stripped | `test_security_invariants::...::test_script_stripped` |
| event handlers (`on*`) stripped | `test_event_handler_stripped` |
| clearnet `<img>` never loaded | `test_clearnet_image_never_loaded` |
| clearnet CSS `<link>` stripped | `test_clearnet_css_link_stripped` |
| clearnet CSS `url()`/`@import` stripped | `test_clearnet_css_url_stripped` |
| clearnet form action stripped | `test_form_action_clearnet_stripped` |
| `<iframe>` stripped | `test_iframe_stripped` |
| `<meta refresh>` stripped | `test_meta_refresh_stripped` |
| SVG `<script>` stripped | `test_svg_script_payload_stripped` |
| legacy URL attrs swept (`input[type=image]`, `body/table background`, `button formaction`) | `test_legacy_url_attrs_swept` |
| malformed-HTML final scrub catches residue | `test_malformed_html_final_scrub_catches_residue` |
| in-network resources rewritten to proxy | `test_in_network_resources_rewritten_to_proxy` |
| CSP always injected | `test_csp_always_injected` |
| no clearnet survives adversarial mix | `TestGlobalInvariants::test_no_clearnet_survives` |
| no script survives adversarial mix | `test_no_script_survives` |
| legit content survives | `test_legit_content_survives` |
| ~80-payload adversarial corpus holds invariants | `test_sanitizer_validation.py` (whole file) |

## Auth / identity (local device adversary)

| Invariant | Test |
|---|---|
| daemon write routes gated by token when `ECHELON_REQUIRE_AUTH=1` | `test_auth_endpoint.py` |
| CORS Allow-Headers includes `X-Echelon-Auth` | `test_write_guard.py::test_preflight_allows_auth_header` |
| token validated constant-time | `test_auth::TestValidateToken` |
| wallet ownership = ed25519 signature, not a claim | `test_eepgen_auth::TestVerifyWalletSignature` |
| forged-wallet claim rejected | `test_eepgen_auth::test_forged_wallet_claim_rejected` |
| publish path-traversal rejected | `test_sync_daemon` (path-traversal vectors) |
| eepsite size caps enforced | `test_publish_size_caps.py` |

## Build / supply chain

| Invariant | Test |
|---|---|
| zero third-party CDN requests in production build | `tests/build/cdnFree.test.ts` |
| service worker precaches shell, never loopback ports | `tests/build/serviceWorker.test.ts` |
| PWA manifest installability | `tests/build/manifest.test.ts` |

## WF / traffic-shape (network adversary)

| Invariant | Test |
|---|---|
| observable shape is a function only of the anonymity-set bucket | `test_traffic_regularization::TestAnonymitySetInvariance` |
| timing carries no length info | `test_timing_carries_no_length_info` |
| same-bucket sites indistinguishable to simulated adversary | `TestSimulatedAdversary::test_adversary_cannot_separate_same_bucket_sites` |
| pad/unpad round-trips exactly | `TestPadUnpadRoundTrip` |

## Running the invariant suite

```bash
python3 -m pytest scripts/tests/test_security_invariants.py -v
# full hardening surface:
python3 -m pytest scripts/tests/test_security_invariants.py \
  scripts/tests/test_sanitizer_validation.py \
  scripts/tests/test_i2p_integration.py \
  scripts/tests/test_eepgen_auth.py -q
```
