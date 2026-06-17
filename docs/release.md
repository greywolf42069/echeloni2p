# Echelon — v0.1 Release Guide

**Last updated**: 2026-05-28

This document is the operator playbook for shipping Echelon v0.1 to the
Solana dApp Store. It picks up where the codebase + tests leave off:
everything below requires a workstation with **Android SDK** + **Java 17**
+ a **Solana CLI keypair** with at least ~0.5 SOL on devnet (publisher,
app, release NFT mints) plus on mainnet (final published release).

The technical pieces (subscription program, browser polish, etc.) are
already built and tested. What's left is the build pipeline, signing,
and the dApp Store submission flow itself. None of those can be
committed pre-shipped — they require local secrets.

---

## Phase K: PWA (shipped — works today, no APK needed)

Echelon is a fully installable PWA right now. Before any APK work, you
can deploy `dist/` to any static host (or serve it locally) and:

- **Android / Chrome**: visit the URL → Chrome shows the install prompt
  (or use Echelon's own "Install" button, which captures
  `beforeinstallprompt`).
- **iOS / Safari**: visit the URL → Echelon shows an "Add to Home
  Screen" hint with the Share-sheet gesture.
- **Desktop Chrome/Edge**: install icon in the address bar.

What's already done (committed + CI-gated):
- K.1 — zero third-party CDN requests; Tailwind + all deps bundled.
- K.2 — full icon set (192/512/maskable/apple-touch/favicons) +
  enriched manifest (shortcuts, categories, scope, description).
- K.3 — Workbox service worker: precached app shell, NetworkOnly for
  the loopback daemon/i2pd, StaleWhileRevalidate for other GETs, SPA
  navigation fallback for offline.
- K.4 — background publish queue: eepsite publishes survive a daemon
  outage and flush automatically when it returns.
- K.5 — install prompt (both platforms) + a static PWA audit
  (`npm run pwa:audit`) wired into CI.

### Full Lighthouse run (manual — needs Chrome)

CI runs `scripts/pwa_audit.mjs` (Lighthouse-lite static checks). For a
full Lighthouse score on a machine with Chrome:

```bash
npm run build
npx serve dist -l 5000   # or any static server
npx lighthouse http://localhost:5000 \
  --only-categories=pwa,performance,best-practices,accessibility \
  --chrome-flags="--headless" \
  --view
```

Target: PWA category all-green, Performance 80+ (the 2.3 MB Solana
bundle is the main drag — code-splitting it is a v0.2 optimization).

### Deploying the PWA

`dist/` is a static bundle. Host it anywhere:
- **Vercel / Netlify / Cloudflare Pages**: point at the repo, build
  command `npm run build`, output dir `dist`.
- **Self-host**: `npx serve dist` or any nginx/caddy static config.
- **Must be HTTPS** (or localhost) for the service worker + install
  prompt to work. Any of the above hosts give you HTTPS free.

The PWA talks to the user's LOCAL sync daemon + i2pd on 127.0.0.1, so
hosting the static app on a public URL does NOT centralize anything —
each user still runs their own node.

---

## Phase H: Mobile build pipeline

### H.1  Capacitor scaffold

Echelon ships its web build to Android via [Capacitor]. One-time setup
on your dev machine:

```bash
npm install --save-dev @capacitor/core @capacitor/cli
npm install --save @capacitor/android

# Generate android/ scaffold (commit after the first run)
npx cap init "Echelon" "com.echelon.app" --web-dir=dist
npx cap add android
```

After the first `cap add android`, commit the generated `android/`
directory to git. Subsequent `npx cap sync android` calls update it
in place.

`capacitor.config.ts` (root):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.echelon.app',
  appName: 'Echelon',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

### H.2  Mobile Wallet Adapter (MWA)

Replace the web wallet adapter on Android with MWA so users sign with
the Seed Vault on Saga / Seeker. Web users continue to use Phantom /
Solflare browser extensions.

```bash
npm install @solana-mobile/wallet-adapter-mobile
```

**Status: ✅ DONE** — `WalletContextProvider.tsx` now does runtime
platform detection via `utils/platform.ts`.  On Android (Capacitor
native shell), it instantiates `SolanaMobileWalletAdapter` with
`appIdentity`, `addressSelector`, `authorizationResultCache`, and
`onWalletNotFound`.  On web, it uses Phantom + Solflare as before.
The MWA import is guarded by a try/catch so the pure-web build
never crashes if the package isn't bundled.

### H.3  Termux probe screen

Already shipped at `components/pages/NativeConnect.tsx`. On Android, this
page should be the first thing a wallet-disconnected user sees — wire it
into the post-Welcome flow when `Capacitor.getPlatform() === 'android'`.

### H.4  AndroidManifest permissions

Open `android/app/src/main/AndroidManifest.xml` and remove every
permission Capacitor adds by default that Echelon doesn't use. Echelon
only needs:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<!-- Required for MWA to discover wallet apps installed locally -->
<queries>
  <intent>
    <action android:name="solana.wallet.ACTION_VERIFY" />
  </intent>
</queries>
```

Drop everything else. Particularly: NO `READ/WRITE_EXTERNAL_STORAGE`,
NO `ACCESS_FINE_LOCATION`, NO `READ_PHONE_STATE`. Reviewer will reject
unused permissions.

### H.5  Generate the release keystore

```bash
mkdir -p keys
keytool -genkey -v -keystore keys/echelon-release.keystore \
  -alias echelon -keyalg RSA -keysize 2048 -validity 10000
```

Add `keys/` to `.gitignore` (already in place). Back up
`echelon-release.keystore` somewhere durable — losing it means losing
the ability to update Echelon for existing installs.

Configure `android/app/build.gradle`'s `signingConfigs` block to point
at the keystore via env vars (so the file path itself can be
machine-specific):

```gradle
signingConfigs {
  release {
    storeFile file(System.getenv("ECHELON_KEYSTORE_PATH") ?: "../../keys/echelon-release.keystore")
    storePassword System.getenv("ECHELON_KEYSTORE_PASSWORD")
    keyAlias "echelon"
    keyPassword System.getenv("ECHELON_KEY_PASSWORD")
  }
}
```

### H.6  Build the signed APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
# APK lands at android/app/build/outputs/apk/release/app-release.apk
```

Smoke-test it on a real Saga / Seeker / Pixel before uploading.

---

## Phase H.7: dApp Store publish

[Solana Mobile dApp Store CLI][dapp-store-cli] requires:
- A Solana CLI keypair with ~0.05 SOL (publisher + app + release NFTs)
- A portal API key from `https://publish.solanamobile.com/`
- The signed APK from H.6
- Listing assets: `1200×600` banner, `512×512` icon, `1080×1920` × 6 screenshots

```bash
npm install -g @solana-mobile/dapp-store-cli

# One-time publisher mint
dapp-store create publisher \
  -k ~/.config/solana/echelon-publisher.json \
  -u https://api.devnet.solana.com

# One-time app mint
dapp-store create app \
  -k ~/.config/solana/echelon-publisher.json \
  -u https://api.devnet.solana.com

# Per-release: mint a release NFT, upload, submit for review
dapp-store create release \
  -k ~/.config/solana/echelon-publisher.json \
  -u https://api.devnet.solana.com \
  --apk-path android/app/build/outputs/apk/release/app-release.apk

dapp-store publish submit \
  -k ~/.config/solana/echelon-publisher.json \
  -u https://api.devnet.solana.com \
  --requestor-is-authorized \
  --complies-with-solana-dapp-store-policies
```

Listing copy template (`config.yaml`):

```yaml
publisher:
  name: Echelon Foundation
  website: https://echelon.network
  email: hello@echelon.network
  
app:
  android_package: com.echelon.app
  
release:
  catalog:
    en-US:
      name: "Echelon — Private I2P Browser + Eepsite IDE"
      short_description: "Mobile I2P meshnet, eepsite hosting, AI IDE."
      long_description: |
        Echelon is a mobile-first I2P browser, eepsite hosting platform,
        and AI-assisted website IDE — all running through your own local
        i2pd node on Termux. The only mobile app on the Solana dApp Store
        that does any of these things, let alone all four.
        
        Free tier: I2P browser, eepsite IDE with bring-your-own Gemini
        API key, 3 starter templates, threat-filter ad/tracker blocking.
        
        Plus tier ($9 USDC/mo): Hosted EepGen AI (Gemma 3 4B), 17
        premium templates, 5 hosted eepsites.
        
        Privacy tier ($29/mo): Outproxy bridge to clearnet, priority
        routing, cover traffic, EepGen 1M tokens/day, 10 eepsites.
        
        Operator tier ($99/mo): 1 TB bandwidth, dedicated outproxy,
        EepGen 5M tokens/day, operator analytics.
        
        v0.2 will launch the RTD token on Raydium with retroactive
        airdrop weighted by your v0.1 subscription history. Subscribe
        early to maximize your weight.
```

Allow ~3-7 days for first-time review. Iteration is cheap thereafter
since we keep the same publisher + app NFT and just mint new release
NFTs.

---

## Phase I: Hardening checklist

### I.1  Sync daemon auth ✅ (shipped)

- `scripts/auth.py` provides `load_or_create_secret`, `validate_token`,
  and `auth_status_for` middleware logic.
- Daemon respects `ECHELON_REQUIRE_AUTH=1` env var. When set, every
  route except `/health` and `/auth/info` requires the
  `X-Echelon-Auth` header.
- Token persists at `~/.echelon/secret` (override via
  `ECHELON_SECRET_PATH`). Mode 0600 on POSIX.
- Browser flow: user runs `cat ~/.echelon/secret` once, pastes into
  Settings → "Sync Daemon Auth Token", browser stores in localStorage,
  every subsequent fetch carries the header. (Settings UI flow
  pending — for v0.1 review the daemon ships with auth OFF by default
  for backward compatibility; flip ON in `~/.bashrc` or systemd unit.)

### I.2  Eepsite size caps ✅ (shipped)

- `MAX_FILE_BYTES = 4 MB`, `MAX_EEPSITE_BYTES = 64 MB` enforced in
  `/publish` before any disk write. 413 returned with explicit error
  message.
- `MAX_BODY = 80 MB` HTTP request cap (room for 64 MB eepsite +
  JSON overhead).

### I.3  Termux:Boot autostart

For users who want the daemon + i2pd to survive reboots:

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/echelon <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
i2pd --daemon
sleep 3
python3 ~/.echelon/echelon_sync_daemon.py &
EOF
chmod +x ~/.termux/boot/echelon
```

Install [Termux:Boot] from F-Droid; the script runs at device startup.

### I.4  Optional HTTPS sync daemon

Deferred. v0.1 binds to 127.0.0.1 only; HTTPS isn't required for the
loopback threat model. Document as a v0.2 hardening step.

### I.5  Structured logs

Already partially shipped — daemon uses Python `logging` to stderr.
For v0.1 the operator can `tail -f ~/.echelon/logs/sync-daemon.log` if
they redirect output. v0.2 will add a UI panel that tails the log.

---

## Final v0.1 release checklist

- [ ] All commits on `main` branch
- [ ] CI green (tsc + vitest + pytest + vite build all pass)
- [ ] `git tag v0.1.0-beta`
- [ ] `git push origin main --tags`
- [ ] `npx cap sync android` to refresh android/ from latest dist/
- [ ] `cd android && ./gradlew assembleRelease`
- [ ] Verify APK installs + runs on a Saga / Seeker
- [ ] Verify the welcome screen + free tier IDE works without Termux
- [ ] Verify the I2P browser shows "i2pd not detected" gracefully
- [ ] Verify wallet connection (MWA path on Android, Phantom on web)
- [ ] Verify subscription purchase (USDC) on devnet
- [ ] Verify template marketplace gallery + lock screen
- [ ] Verify threat filter (when daemon up) shows real domains
- [ ] Mint publisher + app NFTs (one-time)
- [ ] Mint release NFT
- [ ] Submit to dApp Store
- [ ] Ship release notes to community channels

[Capacitor]: https://capacitorjs.com/
[dapp-store-cli]: https://docs.solanamobile.com/dapp-store/publishing-cli
[Termux:Boot]: https://wiki.termux.com/wiki/Termux:Boot

---

## Supply chain, reproducible build & signed releases

Privacy software must be verifiable: a user should be able to confirm the
bytes they run match the source. This section is the plan + the commands
that exist today. Items marked **PLANNED** are not yet automated — stated
honestly rather than implied.

### Dependency audit (SBOM)

- **Runtime daemon is pure stdlib.** The Python sync daemon (`scripts/`)
  imports only the standard library — **zero pip runtime dependencies**.
  Dev-only: `Pillow` (icon generation in `scripts/gen_icons.py`) and
  `pytest`. This is the smallest practical Python supply-chain surface.
- **Frontend deps are pinned to exact versions** in `package.json` (no
  `^`/`~` ranges) and committed in `package-lock.json`.
- Run the audit:
  ```bash
  npm run audit          # npm audit (prod deps, high+) + the python note
  npm audit --omit=dev   # raw npm advisory check
  ```
- **PLANNED:** emit a CycloneDX SBOM in CI
  (`npx @cyclonedx/cyclonedx-npm --output-file sbom.json`) and attach it
  to each release.

### Reproducible build

The production bundle must be a deterministic function of the source.

- Build:
  ```bash
  npm ci                 # install EXACT locked deps (not `npm install`)
  npm run build          # vite build → dist/
  ```
- `npm ci` (not `npm install`) guarantees the locked dependency tree.
- The build emits no network calls and bundles all assets (CI-enforced by
  `tests/build/cdnFree.test.ts`), so `dist/` depends only on source + the
  locked deps — no CDN, no fetch-at-build.
- **Checksum the artifact** so users can verify a hosted deploy:
  ```bash
  # deterministic checksum of the build output
  find dist -type f -print0 | sort -z | xargs -0 shasum -a 256 \
    | shasum -a 256 | awk '{print $1}' > dist.sha256
  cat dist.sha256
  ```
  Publish `dist.sha256` alongside each release; a user who builds from the
  same tag + `npm ci` should get the same hash.
- **PLANNED:** pin the Node version (`.nvmrc` / `engines`) and document the
  exact toolchain so the hash is bit-reproducible across machines. Vite
  output is deterministic for a fixed toolchain but we have not yet
  certified cross-machine reproducibility.

### Signed releases

- **Git tags** for releases are annotated and **GPG-signed**:
  ```bash
  git tag -s v0.1.0 -m "Echelon v0.1.0"
  git verify-tag v0.1.0
  ```
- **PLANNED:** sign the published `dist.sha256` (and SBOM) with the
  project release key; publish the public key at
  `/.well-known/echelon-security.asc`. Until that key is generated, tag
  signatures are the verifiable anchor.
- The Android/dApp-Store release NFT + APK signing are covered above
  (Phase H) and use the Solana publisher keypair + Android signing key —
  those are operator secrets, never committed.

### Release checklist additions (security)

- [ ] `npm run audit` clean (no high/critical prod advisories)
- [ ] `npm run ci` green (tsc + build + PWA audit + vitest + pytest)
- [ ] `dist.sha256` generated + published with the release
- [ ] Release git tag GPG-signed + `git verify-tag` passes
- [ ] `SECURITY.md` disclosure address current
- [ ] **PLANNED:** SBOM attached; release-key signature on `dist.sha256`

