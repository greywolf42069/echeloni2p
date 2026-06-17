# Echelon — Build Roadmap

Tracking document for the work required to take Echelon from "polished UI shell" to "real, fully-functional, tested, dApp-store-ready Solana + I2P meshnet client."

This file is the single source of truth for what's left. Every item has acceptance criteria and a test requirement. Nothing is "done" until tests pass.

**Status legend:**
- ✅ done, tested, in main
- 🟡 implemented, tests pending
- 🔧 in progress
- ⬜ not started

---

## Phase 0 — Already shipped (needs test backfill)

The first round of de-mocking that's already in main. Code is there; tests are not yet.

| ID | Item | Status |
|---|---|---|
| 0.1 | Strip leaked Gemini key, gitignore `.env*`, kill build-time inject | ✅ |
| 0.2 | `useGeminiKey` + `useEchelonConfig` hooks (localStorage) | 🟡 needs tests |
| 0.3 | Settings page: Gemini key UX + Termux endpoint config + Test connections | 🟡 needs tests |
| 0.4 | `hooks/eepsiteStore.ts` IndexedDB persistence | 🟡 needs tests |
| 0.5 | `scripts/echelon_sync_daemon.py` (publish / list / delete / health) | 🟡 needs tests |
| 0.6 | `hooks/syncDaemonClient.ts` | 🟡 needs tests |
| 0.7 | Editor + Hosting page Publish buttons | 🟡 needs tests |
| 0.8 | Browser routes through user's local i2pd HTTP proxy | 🟡 needs tests |
| 0.9 | `useI2pRouterHealth` polls i2pd console | 🟡 needs tests |
| 0.10 | Wasm/NativeConnect rewritten to be honest about Termux | 🟡 needs tests |
| 0.11 | `hooks/solanaActions.ts` real SOL + SPL transfers | 🟡 needs tests |
| 0.12 | App.tsx real wallet balance + recent-tx fetching on connect | 🟡 needs tests |

---

## Phase A — Real i2pd telemetry (no more `Math.random`)

The dashboard, Protect, and meshnet-status surfaces still show fake numbers. i2pd actually publishes its state. Fix.

### A.1 — Daemon: scrape i2pd state ✅
Extended `echelon_sync_daemon.py` with `GET /i2pd/stats`. Implementation: scrapes i2pd's web console at `127.0.0.1:7070` (HTML main page) and returns JSON.

**Module:** `scripts/i2pd_stats.py` (`parse_i2pd_main_page` is pure + tolerant; `fetch_i2pd_stats` does the HTTP GET and returns `running:false` on connection refused / OSError / TimeoutError).

**Tests (pytest, 23 + 3 = 26 total):**
- 10 tests asserting every field extracts correctly from a realistic running fixture (`i2pd_main_running.html`)
- 4 tests asserting fall-back to defaults from a minimal fixture
- 3 tests asserting graceful degradation on garbage HTML
- 2 tests asserting empty / None inputs don't raise
- 4 tests asserting `fetch_i2pd_stats` returns `running:false` on URLError/OSError/TimeoutError + passes through to parser on success
- 3 endpoint tests at `/i2pd/stats` covering reachable / unreachable / CORS

### A.2 — Daemon: i2pd config R/W ✅
`GET /i2pd/config` returns parsed values from `~/.i2pd/i2pd.conf` (filtered to the whitelist + the schema description). `POST /i2pd/config` accepts a `{values: {...}}` payload and writes the file atomically. The whitelist: `bandwidth`, `share`, `notransit`, `floodfill`, `http.address`, `http.port`, `httpproxy.address`, `httpproxy.port`, `socksproxy.address`, `socksproxy.port`. Path overridable with `ECHELON_I2PD_CONFIG`.

**Module:** `scripts/i2pd_config.py`
- `parse_i2pd_config_text` — INI-style parser handling top-level + `[section]` keys, comments, blank lines.
- `read_i2pd_config(path)` — returns whitelisted-only flat dict.
- `write_i2pd_config(path, updates)` — patches the file, preserving comments + ordering, creates new sections / keys when needed, writes atomically (`tempfile.mkstemp` → `os.replace`).
- Validators per key: bandwidth (`L|O|P|X` or numeric KBps), share (0–100), bool keys (`true|false|1|0|yes|no`), ports (1–65535), addresses (host-like, no shell metachars).

**Tests (pytest, 68 module + 8 endpoint = 76 total):**
- 7 parser tests (top-level, section, comments, repeated keys, blank input, etc.)
- 6 whitelist + view tests
- 32 validator tests (parametrised across valid/invalid values per key)
- 5 round-trip tests (preserves comments, creates section, normalises bools)
- 3 rejection tests (non-whitelisted, invalid value, oversize port → file unchanged)
- 2 atomic-write crash safety tests (`os.replace` failure + partial write don't clobber target)
- 8 endpoint tests at `/i2pd/config` covering GET round-trip, POST round-trip, missing file, all rejection paths, file-creation

### A.3 — Client: `useI2pStats` hook ✅
React hook that polls `/i2pd/stats` on the local sync daemon every 5s. Returns `{ stats, loading, error, refresh, lastFetchedAt, config }`. On any error (daemon down, JSON parse, non-2xx) it returns `EMPTY_STATS` with `error` populated. Polling continues so recovery is automatic when the daemon comes back.

**Module:** `hooks/useI2pStats.ts` (`I2pStats` interface + `EMPTY_STATS` constant + `useI2pStats(intervalMs)` hook)

**Tests (vitest, 9):**
- initial render returns EMPTY_STATS, populates after first fetch
- targets the correct configured sync-daemon URL
- network error surfaces the message and falls back to EMPTY_STATS
- non-2xx response surfaces an error
- error is cleared after recovery
- `refresh()` triggers an immediate extra fetch
- re-polls on the configured interval
- unmount cancels in-flight + stops the interval
- partial daemon payloads merge into EMPTY_STATS so the UI doesn't break

### A.4 — Replace simulated meshnet telemetry in App.tsx ✅
Dropped the `setInterval(..., 2000)` block that populated `peerCount`, `dataThroughput`, `latency` from `Math.random()`. Dropped the auto-voucher generator (`relayedSinceLastVoucherRef` + `VOUCHER_THRESHOLD_MB` + `RTD_PER_MB`) — vouchers will now only land in `porVouchers` when the Phase D Proof-of-Relay protocol is online. Dropped the `setInterval(..., 7000)` fake threat log generator — threat entries will land via Phase C's daemon-side adblock filter. `userData.dataRelayed` now mirrors `i2pStats.totalTransitBytes / MiB` honestly, only updating when the daemon reports real numbers.

`MeshnetStatus.tsx` rewritten to consume `I2pStats` directly: shows real bandwidth (B/s, KiB/s, MiB/s autoformatting), router count, network status, floodfills, total received + transit volume, active tunnels with client/transit breakdown. Surfaced on the Protect page only when `stats.running` is true — no card means no fake numbers visible.

**Tests (vitest, 6 + 2 = 8 new):**
- 6 MeshnetStatus tests covering version header, router count, network status, bandwidth formatting, tunnel breakdown, total volume, idle/empty rendering.
- 2 Protect tests covering "MeshnetStatus appears when /i2pd/stats reports running" and "MeshnetStatus stays hidden when daemon is down".

### A.5 — Bandwidth / transit configuration page ✅
New page at `meshnet-config` (linked from Protect): bandwidth class radio (L/O/P/X), share % slider, transit toggle (`notransit` inverted to a positive UX label), floodfill toggle. Reads via `GET /i2pd/config`, saves via `POST /i2pd/config`. Surfaces daemon errors inline with a hint pointing at the Termux quickstart. Restart hint rendered at the bottom (`pkill i2pd && i2pd --daemon`).

**Module:** `hooks/i2pdConfigClient.ts` (`getI2pdConfig`, `setI2pdConfig`, `I2pdConfigError`)
**Page:** `components/pages/MeshnetConfig.tsx`

**Tests (vitest, 6 + 6 = 12):**
- 6 client tests covering GET success / GET network failure / GET non-2xx / POST success / POST 400 with daemon-side error message / POST network failure
- 6 component tests covering populate-from-GET, error card on GET failure, save-with-correct-payload (notransit inversion), save-failure surfacing toast + error card, navigation buttons + Reload, Termux restart hint

---

## Phase B — Outproxy mode

User can opt into running an HTTP and/or SOCKS outproxy. (User-controlled. No nagging in the UI.)

### B.1 — Daemon: outproxy enable/disable ✅
`POST /i2pd/outproxy` accepts `{mode, upstream_host, http_upstream_port, socks_upstream_port, advertise}`. Writes a managed block sandwiched between `# === ECHELON OUTPROXY START ===` / `END ===` markers into `~/.i2pd/tunnels.conf` (overridable with `ECHELON_I2PD_TUNNELS`). User-managed tunnels outside the markers are NEVER touched. Atomic write via `tempfile.mkstemp` + `os.replace`.

**Module:** `scripts/i2pd_tunnels.py` — fully covered by 73 tests. Key safety properties:
- `LOCKED_BIND_HOST = "127.0.0.1"` — i2pd server-tunnel `host` field is rendered from this constant, not user input. The UI cannot move it. Exposing the backend clearnet proxy to LAN/WAN would be the canonical doxx bug; we make it impossible.
- `http_keys_file` / `socks_keys_file` are dataclass `init=False` — even an attacker-controlled POST cannot inject path-traversal via the keys filename.
- `validate_spec()` rejects: `0.0.0.0`, `::`, `*`, shell metachars in host, ports outside 1..65535, modes outside the allowlist.
- `splice_managed_block()` is byte-deterministic — a second identical POST produces a byte-identical file.
- `extract_managed_block()` requires both START and END markers; refuses to operate on a corrupted/partial block.

### B.2 — Daemon: outproxy stats ⬜
*(Deferred — current GET `/i2pd/outproxy` returns the spec only. Live throughput stats per outproxy tunnel require parsing i2pd's `?page=transit_tunnels` HTML, which is fragile. Will revisit when we have a stable parser.)*

### B.3 — Outproxy page in UI ✅
Mode selector (Disabled / HTTP / SOCKS / HTTP+SOCKS) with safe defaults. When enabled, exposes upstream host + port inputs and an Advertise toggle. Bind host field is **disabled** in the DOM — the UI literally cannot change it. Saves through `outproxyClient`. Always-visible warning that i2pd does not perform clearnet egress on its own and the user must run a backend proxy (Privoxy / 3proxy / Squid) bound to loopback.

**Modules:** `hooks/outproxyClient.ts`, `components/pages/OutproxyConfig.tsx`
**Tests (vitest, 6 + 10 = 16):**
- 6 client tests covering GET/POST success + 4 failure paths
- 10 page tests covering: heading + Termux explainer + path display, default Disabled mode hides upstream inputs, GET-failure error card, mode flip reveals/hides relevant ports, locked bind host is `disabled` in the DOM, Save sends right payload + success toast, Save failure surfaces error card + toast, button label flips for Disabled mode, Back/Reload nav

### B.4 — Outproxy bandwidth caps ⬜
*(Deferred — i2pd doesn't expose per-tunnel bandwidth caps in tunnels.conf in a clean way; the global `bandwidth` + `share` settings already controllable from the Meshnet Contribution page apply. Will revisit if a real per-tunnel hook surfaces.)*

---

## Phase C — Real ad/threat filtering

Drop the random `SIMULATED_THREATS_DATA` array. Use real DNS filter lists and a real filtering HTTP proxy.

### C.1 — Daemon: filter list management ✅
`GET /filters/lists`, `POST /filters/lists`, `DELETE /filters/lists/{id}`, `POST /filters/refresh`. Subscriptions persist as JSON under `~/.echelon/filters/subscriptions.json` (overridable via `ECHELON_FILTERS_ROOT`). Cached list bodies + ETags live alongside in `cache/<id>.{txt,etag}`. Refresh is conditional via `If-None-Match`; a 304 response leaves the cache untouched.

**Module:** `scripts/threat_filters.py` (parser, validators, `SubscriptionStore`, `FilterDownloader`, `compile_blocklist`, `is_domain_blocked`).

**Tests (pytest, 58):**
- 7 hosts-file parser tests (real list excerpts, comments, IPv6 prefix, lowercase normalisation, garbage skip, `localhost`/`broadcasthost` filter)
- 6 URL validator tests + 6 domain validator tests
- 7 `is_domain_blocked` tests (exact / subdomain / proper-subdomain-only / case-insensitive / trailing-dot / empty)
- 9 `SubscriptionStore` tests (round-trip, dedup-by-URL, unsafe-URL/empty-name/unknown-format rejection, atomic-write crash safety, corrupt-manifest recovery, cache-cleanup on remove)
- 5 `refresh_subscription` tests (first-fetch, 304 leaves cache, network error, non-200, conditional GET sends ETag)
- 3 `compile_blocklist` tests (union, error subs skipped, empty store)
- 1 `refresh_all` test

### C.2 — Daemon: filtering HTTP proxy ⬜
*(Next sub-sprint. Building a misbehaving HTTP proxy is dangerous — same care we gave the outproxy. Will own its own commit.)*

### C.3 — Daemon: blocked-event stream ✅
In-memory ring buffer (`BlockEventBuffer`, default cap 200) keyed by monotonic `seq`. `GET /filters/events?since=<n>` returns events with seq > n + the head seq + buffer size. Process-wide singleton accessible via `get_global_buffer()` so the (yet-to-be-built) filtering proxy and the API endpoint share the same buffer.

**Module:** `scripts/threat_events.py`

**Tests (pytest, 12 module + 4 endpoint = 16):**
- empty-state, monotonic seq, since-filter, latest-N, capacity drops oldest, head-seq tracking, invalid-cap rejection, **1000 concurrent appends produce unique seqs** (thread-safety stress test), `events_to_dict` serialisation, singleton semantics, 4 endpoint tests covering empty / appended / `since=` filter / invalid `since` graceful fallback to 0.

### C.4 — Threat Intel UI rewire ✅
`ThreatIntelCard.tsx` rewritten to consume `BlockEvent[]` from `useFilterEvents()` (polls `/filters/events` every 5s with monotonic `since=N` cursor). Daemon-unreachable error surfaces in a banner inside the card. Headline counter shows total blocked since daemon startup. Empty-state copy adapts based on whether the daemon is reachable. App.tsx drops the dead `threatLog: Threat[]` state; the AI assistant's `getThreatIntelligence` tool now sees real events.

**Modules:** `hooks/filterEventsClient.ts`, `hooks/useFilterEvents.ts`, `components/ThreatIntelCard.tsx`

**Tests (vitest, 14 client/hook + 10 Protect = 24 net):**
- 7 client tests (per-endpoint URL/payload/error) + 6 hook tests (initial fetch, since-cursor, maxEvents cap, error fallback, recovery, unmount cleanup) + 1 client safety test refusing unsafe sub IDs
- Protect tests rewritten to use URL-based fetch dispatch so multiple hooks can be mocked independently; new coverage for threat-feed-populated and daemon-error-banner cases.

---

## Phase D — v0.2 Proof-of-Relay protocol (sequenced AFTER v0.1 ships)

> **v2.1 amendment** (2026-05-28): Phase D is **v0.2** work, not v0.1. Pump.fun is incompatible with our economics; Raydium permissionless launch happens AFTER product traction. v0.1 ships to Solana dApp Store with USDC subscriptions, no token. Phase D begins once v0.1 has demonstrated traction (≥500 active subs, ≥50 hosted eepsites).
>
> **Design freeze**: see [`docs/economy/design-v2.md`](./docs/economy/design-v2.md) §9 (Raydium launch model) + §11 (v0.1/v0.2 phase plan) + §13 (airdrop + Seeker reward).

### D.0 — Spec freeze ✅
v1 + v2 + v2.1 amendment in `docs/economy/`.

### D.0.5 — Reward simulator ✅
`simulators/echelon-rewards/` shipped. 80 tests green. Constants will be re-derived for v0.2 once final emission curve is locked.

### D.1 — Receipt format library (Rust + TS) ⬜ **(v0.2)**
`programs/echelon-receipts/` Rust crate + `hooks/relayReceipts.ts` TS port. Receipt format per design-v2 §5.1 with strict liveness (5-min clock-skew tolerance, no late countersignatures per §3.1). Domain separator: `b"ECHELON-RELAY-RECEIPT-v1\x00"`.

### D.2 — Daemon: receipt issuer ⬜ **(v0.2)**
`scripts/relay_attestor.py`: subscribes to i2pd transit-tunnel events, identifies upstream peer via NetDB, exchanges countersignatures via Echelon-protocol message inside an I2P stream, persists signed receipts to `~/.echelon/receipts/`. Plausibility cap enforcement before signing.

### D.3 — Anchor program: relay-claim ⬜ **(v0.2)**
`programs/echelon-relay-claim/`. Instructions per design-v2 §11. Mint authority for the 50M emission pool. Constants from D.0.5 simulator.

### D.4 — Devnet integration ⬜ **(v0.2)**
Two daemons on devnet exchange receipts, submit batched claim, RTD minted from emission contract. `scripts/devnet-smoke.sh` runs full loop in CI.

---

## Phase E — RTD token + on-chain economy (v0.1 simplified subset, v0.2 full)

> See `docs/economy/design-v2.md` §9 (Raydium launch) + §11 (phase plan) + §13 (airdrop). 100M cap on Solana. 1M + ~0.25 SOL on Raydium CLMM at v0.2 launch. Foundation funded by USDC subscription revenue in v0.1, by USDC fees + RTD burns in v0.2.

### E.1 — RTD SPL mint + Raydium launch ⬜ **(v0.2)**
100M cap. Distribution per design-v2 §9.1: 1M Raydium LP, 50M emission pool (PDA escrow), 10M retroactive airdrop, 5M foundation ops (vest), 5M cross-chain reserve, 29M public liquidity reserve. Mint authority held by relay-claim program PDA. Freeze authority none. LP timelocked 6mo via Streamflow.

### E.2 — USDC subscription Anchor program ⬜ **(v0.1)**
**simplified v0.1 version**: USDC-only, no RTD lane. `programs/echelon-subscription/`. `subscribe(tier, duration_months)` instruction. SubscriptionPDA stores all airdrop weight inputs (months_paid, tier, started_at, expires_at, total_usdc_paid, renewal_count, is_seeker_holder, total_eepgen_tokens_used, total_template_purchases). Seeker Genesis Token verification at first subscribe sets is_seeker_holder=true + 20% subscription discount.

### E.3 — Services Anchor program ⬜ **(v0.3 — deferred)**
Full multi-service economy with eepsite-host fees, EepGen 50/50 split, outproxy add-ons. Not needed for v0.2 if v0.1 hosting model already works in USDC.

### E.4 — Treasury PDA + emission schedule ⬜ **(v0.2)**
PDA holds the unstaked RTD that funds rewards. Emission curve under multisig governance initially, transitions to RTD-holder governance via on-chain proposal.

### E.5 — Hosted EepGen ⬜ **(v0.1)**
Daemon `/eepgen/complete` proxy endpoint that verifies signed subscription PDA + tracks token quota + forwards to DeepInfra Gemma 3 4B. Plus tier 100K/day, Privacy 1M/day, Operator 5M/day. AI-IDE integrates the Plus path alongside existing BYOK-Gemini path.

### E.6 — Premium template marketplace v0.1 ⬜ **(v0.1)**
17 designed templates, $19 USDC one-time. `programs/echelon-templates/` with `purchase_template_pack()` instruction creating TemplatePackPurchasePDA[wallet]. UI gates premium gallery behind purchase check. TemplatePackPurchasePDA contributes to airdrop weight.

### E.7 — Retroactive airdrop distribution ⬜ **(v0.2)**
`programs/echelon-airdrop/` reads all v0.1 SubscriptionPDAs + TemplatePackPurchasePDAs, computes weight per design-v2 §13.3, distributes 10M RTD pro-rata. Seeker holders get 2x boost. Snapshot frozen 7 days before distribution.

---

## Phase F — Honesty pass (URGENT — v0.1 blocker)

> v2.1 amendment: this phase is **immediately critical** for dApp Store review. Reviewer will reject the app if they see fake `rtdBalance: 1234.56` and `staked: 15000` in the UI.

### F.1 — Single-source-of-truth feature flags ⬜
New file `featureFlags.ts` exporting:
```ts
export const featureFlags = {
  tokenEconomy: false,        // gates Staking, Governance, Bounties, Emissions, Referrals, RTD-balance UI
  airdropTracking: true,      // surface accumulating airdrop weight in v0.1
  hostedEepGen: true,         // Plus tier hosted EepGen (DeepInfra-backed)
  premiumTemplates: true,     // template pack purchase
  outproxyConfig: true,       // already shipped
  threatFilter: true,         // already shipped
} as const;
```
Flag overrides via `localStorage.setItem('echelon.featureFlags.<key>', 'true|false')` for dev-time testing.

### F.2 — Hide nav entries when token economy is off ⬜
App.tsx `pages` config conditionally drops Staking/Governance/Bounties/Emissions/Referrals from the sidebar nav when `featureFlags.tokenEconomy === false`. Each removed page also gets a route-level guard so direct URL access redirects to the dashboard.

### F.3 — Strip fake user data from initial state ⬜
`App.tsx` initial userData currently has hard-coded mock RTD/staked/accruedStakingRewards/dailyEarnings. Replace with `null`/`0` defaults that get populated only from real sources (wallet RPC + subscription PDA reads). When token economy is off, these fields are simply not displayed.

### F.4 — Devnet/Alpha banners ⬜
Pages reading from devnet programs (subscription, templates) get a "Devnet — testnet USDC" banner. Pages with no real backend yet get a "Coming with v0.2" overlay. v0.1 dashboard top-bar carries a small "v0.1 beta" tag.

### F.5 — `data.ts` audit ⬜
Many constants (`LEADERBOARD_DATA`, `EMISSION_CHART_DATA`, `STAKED_SUPPLY_HISTORY_DATA`, `APR_DECAY_DATA`, `BOUNTIES_DATA`, `ACHIEVEMENTS_DATA`, `TRANSACTION_HISTORY_DATA`) are seed/mock. Each one needs to be either:
- (a) Replaced with chain-fetched data when the page is shown (post-token-launch only)
- (b) Marked clearly as illustrative (`~ illustrative` suffix)
- (c) Removed entirely if the consuming UI is feature-flagged off in v0.1.

Tests cover both flag-on and flag-off rendering.

---

## Phase J — I2P browser polish (v0.1 killer feature)

> v2.1 amendment: the polished I2P browser IS the v0.1 product pitch. Solana dApp Store has no other I2P browser. Mobile I2P browser + clearnet bridge + meshnet config + AI eepsite IDE = the Echelon moat.

### J.1 — Multi-tab browser shell ⬜
Refactor `Browser.tsx` to manage a tab array. Each tab has `{id, url, title, history: string[], historyIndex, status}`. New tab button. Close tab. Switch tab. Tabs persist in memory only by default (privacy posture).

### J.2 — Forward/back navigation ⬜
Per-tab history stack. Forward/back buttons drive `historyIndex`. Address bar updates from history. Replace existing single-state `currentUrl`.

### J.3 — Bookmarks (user-editable) ⬜
IndexedDB-backed bookmark store (`hooks/bookmarkStore.ts`). Add/remove/edit. Star button in address bar. Default bookmarks ship from current `I2P_BOOKMARKS` constant + can be deleted by user.

### J.4 — Browsing history (privacy-aware) ⬜
History off by default. Settings toggle to enable. When enabled, IndexedDB-backed (`hooks/historyStore.ts`). One-click "clear all history" button. Timestamp + URL only — no body or screenshot capture.

### J.5 — Smart address bar ⬜
Auto-detects:
- `*.i2p` or known eepsite address → routes through i2pd HTTP proxy (purple UI)
- `https://*` or `http://*` (clearnet) → routes through outproxy if enabled (amber UI), else error page suggesting outproxy
- Search query (no scheme, no dot) → search via `notbob.i2p` (orange UI)
- Multi-word with eepsite hint → suggest top eepsite directories

### J.6 — Visible privacy/routing indicator ⬜
Below address bar, a slim hop-visualizer:
- For eepsite: "your phone → i2pd local → 3 hops → eepsite (3-3 tunnel)"
- For clearnet via bridge: "your phone → i2pd local → 3 hops → exit relay → clearnet"
- For clearnet direct (only if outproxy disabled): bright red "clearnet — not anonymized; enable outproxy to fix"

### J.7 — Per-site JS toggle ⬜
Toggle button in toolbar that injects/removes a `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">` patched into the iframe. Stored per-eepsite in IndexedDB. Default is JS-enabled; users can lock specific sites to no-JS.

### J.8 — Reader mode ⬜
Toolbar button. Strips styles + scripts from rendered iframe content, shows just the article text. Useful for slow eepsites and privacy.

### J.9 — Smart error pages ⬜
Replace bare iframe-blank with rendered error pages:
- DNS resolution failed (no eepsite by that address)
- Tunnel timeout (eepsite offline or i2pd routing failed)
- X-Frame-Options blocked (suggest "Open in new tab")
- Exit relay rate-limited (suggest waiting / different exit relay)
- Outproxy disabled (clearnet attempt with no bridge)

Each error page has a primary action button (retry, configure, etc.) and explainer text.

### J.10 — Eepsite directory homepage ⬜
New tab default: render a curated grid of ~30 known-good eepsites organized by category (search, news, forums, code, art, library). User can pin / unpin entries. Combine with their own published eepsites at the top.

### J.11 — Search bar that delegates to notbob.i2p ⬜
Top-bar search field. Submits to `notbob.i2p/?q=...` via the i2pd HTTP proxy. Results render inline.

### J.12 — Mobile gestures ⬜
Swipe left/right at top of viewport switches tabs. Swipe down at top triggers pull-to-refresh. Long-press tab to close.

### J.13 — Tab persistence policy ⬜
Default: tabs evaporate on app close (privacy). Settings toggle to opt-in to "restore last session." When opt-in, tabs persist in IndexedDB.

---

## Phase G — Test infrastructure (mandatory)

Without this, "done" is meaningless.

### G.1 — Vitest setup ⬜
Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `fake-indexeddb`, `msw` (for fetch mocks). `package.json` script `npm test` runs it.

### G.2 — Tests for Phase 0 hooks ⬜
- `useGeminiKey`: set/clear, persists across hook unmount/remount, cross-tab sync via storage event.
- `useEchelonConfig`: defaults, partial update, reset, cross-tab sync.
- `eepsiteStore`: load empty, putEepsite, deleteEepsite, saveAllEepsites overwrites.
- `syncDaemonClient`: publish ok, publish 4xx surfaces error message, network failure surfaces SyncDaemonError.
- `solanaActions`: `isValidSolanaAddress`, `findMintForSymbol`, `fetchTokenBalances` with mocked Connection, `sendToken` builds correct Transaction structure (decoded back).

### G.3 — Tests for Phase 0 components ⬜
- `Settings`: paste key flow, reveal/hide, clear flow.
- `EepsiteHosting`: publish flow, toggle online/offline calls daemon, delete flow.
- `Browser`: address bar submit builds correct proxy URL, proxy-down state shown when probe fails.
- `Protect`: status dot reflects router health.
- `NativeConnect`: copy buttons set clipboard, status dots reflect probes.

### G.4 — Pytest setup ⬜
`scripts/tests/conftest.py` + `scripts/tests/test_sync_daemon.py`. Run with `pytest scripts/tests/`.

### G.5 — Pytest for daemon ⬜
- `/health` returns 200 with root path.
- `/publish` writes files and round-trips through `/list`.
- `/publish` rejects path-traversal (`..`, absolute paths, weird unicode segments) with 400.
- `/publish` enforces 32 MB cap.
- `/publish` overwrites cleanly (deleted files don't linger).
- CORS: localhost-ish origins allowed, others stripped.
- DELETE removes only the named eepsite.

### G.6 — CI pipeline ⬜
GitHub Actions workflow: install deps, run `tsc --noEmit`, `npm test`, `pytest`, `vite build`. Fails on any warning that we've baselined.

### G.7 — E2E test ⬜
Playwright test that boots the daemon, opens the dev server, mocks i2pd, walks through: create eepsite → edit a file → publish → verify file on disk.

---

## Phase H — Mobile / dApp Store

This is the actual ship target. Requires real Android build, real Mobile Wallet Adapter, real publisher NFTs.

### H.1 — Capacitor Android scaffolding ⬜
`@capacitor/core`, `@capacitor/android`, `@capacitor/cli` added. `npx cap add android`. `android/` directory committed. APK builds via `npx cap build android`.

### H.2 — Mobile Wallet Adapter ⬜
Replace `@solana/wallet-adapter-react-ui`'s `WalletMultiButton` (or augment it) with `@solana-mobile/wallet-adapter-mobile` so the app works inside Saga / Seeker via MWA. Detect Android vs web at runtime; fall back to Phantom/Solflare on web.

### H.3 — Termux-from-Android lifecycle ⬜
On Android, Echelon needs i2pd + sync daemon running. Options: (a) instruct user to keep Termux open in background, (b) spawn the daemon ourselves via `Runtime.exec` from a Capacitor plugin (research-needed: requires Termux's `RUN_COMMAND` permission and the `com.termux:run-command` intent), (c) bundle a self-contained background service.

**Default (a) for v1**, with a "Termux still running?" check screen that re-tests the local probes.

### H.4 — Solana dApp Store CLI publish flow ⬜
`@solana-mobile/dapp-store-cli`. Publisher NFT mint, App NFT mint, Release NFT mint per release. Documented in `docs/release.md`.

### H.5 — APK signing ⬜
Generate keystore. Document at `docs/release.md`. Keystore lives in `keys/` (gitignored).

### H.6 — Capacitor permissions audit ⬜
`AndroidManifest.xml` requests only the permissions Echelon actually uses: INTERNET, plus QUERY_ALL_PACKAGES (for MWA wallet detection). Document each permission.

---

## Phase I — Hardening

### I.1 — Sync daemon auth ⬜
Even though the daemon binds to 127.0.0.1, add a per-device shared secret (random 32-byte token in `~/.echelon/secret`). Browser client reads it from a `/auth/handshake` endpoint that's only callable from same-origin localhost requests, then includes it as a header on subsequent requests. Prevents drive-by from another local app.

### I.2 — Eepsite content size limits ⬜
Per-file 4 MB cap, per-eepsite total 64 MB cap. Enforced both in IDE (warn before save) and daemon (reject publish). Tests for both ends.

### I.3 — Daemon as a systemd / Termux:Boot service ⬜
Document how to make the daemon survive reboots. Provide both a `~/.termux/boot/echelon` script and a systemd unit (for desktop users running Echelon under Linux).

### I.4 — Sync daemon HTTPS option ⬜
For users who want it: an env-var gated HTTPS mode using a self-signed cert. The `useEchelonConfig.useHttps` flag already exists; wire the daemon side.

### I.5 — Logging + observability ⬜
Structured logs to `~/.echelon/logs/sync-daemon.log` with rotation. UI panel that tails the log.

---

## Anti-laziness rules (binding on me)

1. **No "TODO" comments shipped.** Every TODO becomes a row in this file with an ID and acceptance criteria, or it doesn't get committed.
2. **No "simulated" / "mock" / "placeholder" anything in user-facing code without a Devnet/Alpha banner directly attached.**
3. **No commit without tests.** Every PR/commit that touches `hooks/`, `scripts/`, or `components/pages/` includes the corresponding test file changes.
4. **CI must be green.** A red CI build is a release-blocker.
5. **Lying-by-omission counts as a regression.** If a UI shows a number, that number must come from a real source or be visibly labelled `~ illustrative`.
6. **Keep this file in sync with reality.** When an item changes status, update its row in the same commit that changes the code.

---

## Right-now status snapshot (2026-05-28, v2.1 amendment — v0.1 ready for review)

**Strategic pivot**: pump.fun was architecturally incompatible with Echelon's emission economics. Token launch and product launch are now decoupled. v0.1 ships to Solana dApp Store with USDC subscriptions and no token; v0.2 launches RTD on Raydium after v0.1 demonstrates traction.

- Phase G (test infrastructure): ✅ done
- Phase 0 (de-mocking baseline): ✅ shipped + tested
- Phase A (real i2pd telemetry): ✅ done
- Phase B (outproxy mode): ✅ B.1 + B.3 shipped (B.2 + B.4 deferred)
- Phase C (real ad/threat filter): ✅ done
- Phase D.0 + D.0.5 (design + simulator): ✅ done
- Phase F (honesty pass): ✅ F.1-F.5 done
- Phase J (browser polish): ✅ done — multi-tab, smart routing, directory home, smart errors, history UI, JS toggle, tab persistence
- Phase E.2-simplified (USDC subscriptions): ✅ done — real chain transfer, airdrop weight tracking, Subscription page UI
- Phase E.5-simplified (hosted EepGen): ✅ done — daemon /eepgen/complete endpoint with quota tracking + DeepInfra forwarder
- Phase E.6 (premium template marketplace): ✅ done — 6 templates, $19 USDC entitlement gate, Templates page UI
- Phase I.1 (sync daemon auth): ✅ done — opt-in via ECHELON_REQUIRE_AUTH
- Phase I.2 (eepsite size caps): ✅ done — 4 MB/file, 64 MB/site
- Phase K (PWA-perfect): ✅ done — CDN-free build, full icon set + enriched manifest, Workbox service worker, background publish queue, install prompt (iOS + Android), 22-check PWA audit in CI
- Phase H.1-H.7 (Capacitor + MWA + dApp Store): 📝 documented in `docs/release.md` (operator-side scaffold; not committed because requires Android SDK). **Not needed to ship** — the PWA installs on Android/iOS/desktop today.
- Phase I.3-I.5 (Termux:Boot, HTTPS, structured logs): 📝 documented (deferred to v0.2 unless ship-blocking)

**Build is green**: 391 vitest + 419 pytest + 80 simulator = **890 tests passing**. PWA audit: 22/22.

**Next step for the operator**: deploy `dist/` to any HTTPS static host (Vercel / Netlify / Cloudflare Pages / self-host) — the PWA installs on Android, iOS, and desktop with no APK. APK / dApp Store is optional and documented in `docs/release.md` for whenever you want it.

**Then v0.2 (gated on v0.1 traction):** Phase D (Proof-of-Relay) + Phase E.1/E.4 (Raydium launch + emission) + Phase E.7 (retroactive airdrop).
