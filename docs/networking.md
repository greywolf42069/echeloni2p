# Echelon — Networking & NAT Troubleshooting

**Audience**: Echelon operators running i2pd on a phone (Termux) or a
home machine behind a typical consumer router. Most of you are on a
cellular carrier or a home NAT — both of which make I2P's first
connection slow or, on the worst networks (carrier-grade NAT, symmetric
NAT), nearly impossible *without help*. This guide is the help.

> **TL;DR for the impatient:** if eepsites won't load and Echelon's
> Meshnet status sits at "Firewalled / Symmetric NAT" with ~1 tunnel
> for more than ~15 minutes, you are behind a NAT that I2P can't punch
> through on its own. Install **Yggdrasil** (a tiny encrypted UDP
> overlay) and tell i2pd to ride over it. Jump to
> [§3 The Yggdrasil fix](#3-the-yggdrasil-fix-symmetric--carrier-grade-nat).

---

## 1. How I2P connectivity actually works (why it can be slow)

i2pd has to do three things before you can load an eepsite:

1. **Reseed** — download an initial list of routers over HTTPS. Fast
   (seconds), happens once.
2. **Integrate** — connect to those routers, discover more, and build
   *tunnels* (encrypted multi-hop paths). This is the slow part.
3. **Look up + reach** the eepsite's destination through your tunnels.

Steps 2–3 require your i2pd to make **two-way** connections with other
routers. That's where NAT bites.

### The NAT problem in plain terms

- **Full-cone / open NAT** (some home routers, wired): I2P works fine,
  integrates in a few minutes.
- **Restricted / port-restricted NAT** (most home Wi-Fi): works, but
  slower to integrate — be patient ~5–15 min.
- **Symmetric NAT** (many corporate networks, some routers): your
  router gives every outbound connection a *different* external port,
  so peers can't send replies back to a predictable address. I2P's
  hole-punching (SSU2 + introducers) helps but often isn't enough.
- **Carrier-Grade NAT / CGNAT** (almost all cellular data, lots of
  apartment/fiber ISPs): you're behind your carrier's NAT *and* your
  own. Inbound is essentially impossible. **This is most phone users.**

On the bottom two, i2pd can make *outbound* connections but can't
complete the *return path* for tunnel building, so it plateaus at ~1
working tunnel and eepsite lookups silently fail.

---

## 2. First, try the no-extra-software fixes

These help on restricted-NAT and sometimes symmetric. In Termux:

```bash
# Give it TIME. Cold-start integration on a phone can take 15+ minutes.
# Watch the router count climb in Echelon's Meshnet status; it should
# pass several hundred and then tunnels start establishing.

# Run i2pd in client-friendly mode: don't accept transit traffic
# (saves your battery + data) and use shorter, more-numerous tunnels
# so a working one forms sooner under a flaky NAT.
```

Echelon's **Meshnet Config** page sets the safe ones for you. The key
i2pd.conf settings for a phone client:

```ini
notransit = true          # don't relay others' traffic (battery/data)
[httpproxy]
inbound.length = 2        # 2 hops instead of 3 = faster build, slightly
outbound.length = 2       #   less anonymity (fine for casual browsing)
inbound.quantity = 5      # build 5 tunnels so at least one succeeds
outbound.quantity = 5
[exploratory]
inbound.length = 2
outbound.length = 2
inbound.quantity = 5
outbound.quantity = 5
[reseed]
followredirect = true     # some reseed mirrors 30x-redirect
```

If after ~15 minutes Echelon still shows "Symmetric NAT" and won't load
`reg.i2p` / `notbob.i2p`, you're in the hard case → §3.

---

## 3. The Yggdrasil fix (symmetric / carrier-grade NAT)

**This is the loophole.** [Yggdrasil](https://yggdrasil-network.github.io)
is a tiny encrypted IPv6 mesh overlay that runs over UDP and does its
*own* NAT traversal to a set of public peers. Once you're on the
Yggdrasil mesh, i2pd can route its peer connections **over Yggdrasil**
instead of directly — and Yggdrasil's UDP path punches through
symmetric/CGNAT where raw I2P can't.

Think of it as: I2P-over-Yggdrasil, the same way you'd tunnel a
protocol that hates NAT through one that's built to survive it.

### 3a. Install Yggdrasil

**Termux (Android):**
```bash
pkg install yggdrasil
```

**Desktop (macOS):** download the `.pkg` from the
[releases page](https://github.com/yggdrasil-network/yggdrasil-go/releases)
and install, or `brew install yggdrasil`.

**Desktop (Linux):** your distro's package, or the `.deb`/binary from
releases.

### 3b. Give Yggdrasil public peers

A fresh Yggdrasil has **no peers** and therefore no connectivity. Add a
few public ones to its config (`Peers: [ ... ]`). Pick 4–6 from the
[official public peers list](https://github.com/yggdrasil-network/public-peers)
that are geographically near you. Example block:

```hjson
Peers: [
  tls://ygg.mkg20001.io:443
  tcp://ygg-nyc.incognet.io:8883
  tls://ygg.yt:443
]
```

On Termux the config is `$PREFIX/etc/yggdrasil.conf` (generate one with
`yggdrasil -genconf > $PREFIX/etc/yggdrasil.conf` first). On desktop
it's `/etc/yggdrasil.conf`.

### 3c. Tell i2pd to ride over Yggdrasil

In `i2pd.conf`:

```ini
[meshnets]
yggdrasil = true
```

That's the switch. i2pd will advertise + use its Yggdrasil address for
peer transport, which sidesteps the NAT entirely.

### 3d. Restart both, in order

```bash
# Termux:
yggdrasil -useconffile $PREFIX/etc/yggdrasil.conf &   # or the service
i2pd --datadir=$HOME/.i2pd --conf=$HOME/.i2pd/i2pd.conf

# Within a few minutes you should see Echelon's Meshnet status improve
# and eepsites start to load.
```

> **Why this works and a plain VPN doesn't:** a normal VPN just moves
> your egress to another IP — it doesn't help i2pd *find and reach I2P
> peers*. Yggdrasil gives i2pd a NAT-immune transport to ride on, so
> the I2P tunnel handshakes that were failing now complete. It's the
> difference between "change my exit door" and "build a hallway that
> ignores the locked door."

---

## 4. Verifying it worked

In Echelon → **Protect** / **Meshnet status**, you want to see:
- Router count in the hundreds (peer discovery healthy)
- **More than 1** established client tunnel (the symptom of the fix)
- Network status leaving "Firewalled - Symmetric NAT" or, even if it
  still says that, eepsites actually loading

Quick CLI check (desktop / Termux):
```bash
# i2pd web console — established client tunnels should be > 1
curl -s http://127.0.0.1:7070/?page=i2p_tunnels | grep -c established

# Try a real eepsite through the proxy (b32 = no addressbook needed):
curl -x http://127.0.0.1:4444 http://reg.i2p/ | head
```

---

## 5. Quick reference: which fix for which network

| Your situation | Symptom | Fix |
|---|---|---|
| Home Wi-Fi, wired | Loads in <5 min | Nothing — just wait |
| Home Wi-Fi, slow router | "Restricted", 5–15 min | §2 client-mode config + patience |
| Corporate / school | "Symmetric NAT", stuck | §3 Yggdrasil |
| **Cellular data (most phones)** | "Symmetric NAT" / CGNAT, stuck | **§3 Yggdrasil** |
| Apartment/fiber CGNAT | Stuck at 1 tunnel | §3 Yggdrasil |

Most Echelon mobile users are on cellular and will need §3. Echelon's
setup flow should surface the Yggdrasil step automatically when it
detects a stuck symmetric-NAT state (see Termux quickstart).

---

*Verified on macOS arm64 + i2pd 2.60.0 + Yggdrasil 0.5.13 behind
symmetric NAT during Echelon development. Result: raw i2pd integrated
to 600+ known routers and 32 client tunnels but eepsite lookups were
unreliable until the Yggdrasil overlay was enabled
(`[meshnets] yggdrasil = true`); after that, fetching the live reg.i2p
eepsite end-to-end through the full Echelon pipeline succeeded and the
sanitizer's no-clearnet / no-script invariants held on real network
content (`scripts/tests/test_i2p_live.py`, 4/4 passing live). Numbers +
exact peer lists will drift; check the linked official lists.*
