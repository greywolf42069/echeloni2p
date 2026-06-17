# Security Policy

Echelon is privacy software. A vulnerability here can deanonymize a user,
not just crash an app. We take reports seriously and we don't shoot the
messenger.

## Reporting a vulnerability

**Do not open a public issue for security bugs.** Use private disclosure:

- **GitHub Security Advisories** — the preferred channel: open a draft
  advisory at the repository's *Security → Advisories → Report a
  vulnerability* tab (private to maintainers).
- **Email** — `security@echelon.network` (PGP key published at
  `/.well-known/echelon-security.asc` on the project site once live;
  until then, request the key in your first message).

Please include: affected component, reproduction steps or PoC, the impact
you believe it has, and any suggested fix. If you found a sanitizer bypass
or an SSRF vector, a single failing input is enough — we'll turn it into a
regression test.

### Response targets (best-effort, small team)

- Acknowledge within **72 hours**.
- Triage + severity assessment within **7 days**.
- Coordinated fix + disclosure timeline agreed with the reporter.
- Credit in the advisory + release notes unless you prefer to stay
  anonymous.

## Scope

In scope (the things that can hurt a user):

- **Deanonymization** — any way a hostile eepsite, network observer, or
  page causes a clearnet request, leaks the user's IP, or breaks the
  sanitizer's no-clearnet/no-script invariants (`docs/security-invariants.md`).
- **SSRF / egress** — reaching anything that isn't an `.i2p` destination
  through `/browse` or `/browse/resource`.
- **Local daemon attack surface** — CSRF/cross-origin writes to the
  loopback daemon, auth bypass, path traversal in publish, config-write
  abuse.
- **WF defense correctness** — breaking the bucket-invariance property in
  `traffic_regularization`.
- **Supply chain** — a malicious or typosquatted dependency.

Out of scope (see `docs/non-goals.md` for the full list):

- Global-passive-adversary traffic confirmation (not solvable by I2P/Tor
  either).
- A compromised endpoint / rooted device / malicious OS.
- Unsafe user wallet behavior (signing malicious txns, leaking seed).
- I2P or i2pd core vulnerabilities — report those upstream to the I2P
  project (we'll help coordinate if it affects Echelon users).
- Yggdrasil core vulnerabilities — report upstream to the Yggdrasil project.

## Our security posture (what we do on our side)

- **Every privacy claim maps to a test** — `docs/security-invariants.md`.
  Claims are exactly one of: SHIPPED+TESTED, LIVE-VERIFIED, DESIGN-ONLY,
  or NON-GOAL. There is no "we sounded confident" category.
- **Adversarial corpora, expanded forever** — hostile-HTML sanitizer
  suite + the SSRF/URL-parser corpus. A new bypass becomes a permanent
  regression test.
- **Loopback-only daemon** with CSRF/cross-origin write protection and an
  optional per-device auth token.
- **Pure-stdlib runtime daemon** — the Python sync daemon imports only the
  standard library (no pip dependencies at runtime), shrinking the
  supply-chain surface. See `docs/release.md` for the SBOM/audit section.

## Disclosure philosophy

We practice coordinated disclosure. We will not threaten or pursue
good-faith researchers acting under this policy. If a fix is complex, we'll
keep you informed rather than going dark.
