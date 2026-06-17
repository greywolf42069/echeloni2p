# Running Echelon on Android (Termux)

Echelon's privacy features need a local I2P router (i2pd) + the Echelon
sync daemon running on your phone. On Android that's [Termux](https://termux.dev).
This is the mobile setup, written for the common case: **you're on cellular
data, behind carrier-grade NAT, and the naive setup won't load eepsites.**

## TL;DR

1. Install [Termux from F-Droid](https://f-droid.org/packages/com.termux/)
   (NOT the Play Store version — it's outdated).
2. In Termux, paste this and press Enter:
   ```bash
   bash <(curl -fsSL https://echelon.network/setup-termux.sh) --with-yggdrasil
   ```
   (Or run `scripts/setup_termux_i2pd.sh` from a checkout.)
3. Open Echelon → **Protect → Network Doctor** and tap **Deep test**.
   Green = you're browsing the invisible internet from your phone.

The `--with-yggdrasil` flag is recommended on cellular — see why below.

## What the script does

`scripts/setup_termux_i2pd.sh`:
- `pkg install i2pd python` (+ `termux-api` for a wake-lock so tunnels
  survive screen-off).
- Writes a **phone-optimized** `~/.i2pd/i2pd.conf`: no transit traffic
  (saves battery + data), 2-hop tunnels with a 5-tunnel pool (faster to get
  a working one under flaky mobile networks).
- With `--with-yggdrasil`: installs Yggdrasil, generates its config, adds
  public peers, sets `[meshnets] yggdrasil = true` in i2pd, and starts it.
- Starts i2pd + the Echelon sync daemon.

## Why cellular needs Yggdrasil

Your carrier puts you behind **carrier-grade NAT (CGNAT)** — you share one
public IP with thousands of other subscribers, and inbound connections are
impossible. I2P needs two-way connections to build tunnels; under CGNAT its
hole-punching usually isn't enough and tunnel building stalls (you'll see
"Symmetric NAT" + eepsites that never load in the Network Doctor).

[Yggdrasil](https://yggdrasil-network.github.io) is a tiny encrypted UDP
mesh that does its own NAT traversal to public peers. i2pd routes its peer
connections over it, punching through CGNAT. This was **verified working**
during development behind symmetric NAT (see
[networking.md](./networking.md)).

## Keeping it running

- Termux must stay alive in the background. Disable battery optimization for
  Termux in Android settings, or it'll be killed.
- The script grabs a `termux-wake-lock` so the CPU doesn't sleep mid-tunnel.
- For auto-start on boot, install **Termux:Boot** (F-Droid) and drop a
  startup script in `~/.termux/boot/` (see `docs/release.md` §I.3).

## Honest caveat: Android behavior varies — a lot

We do not pretend userspace Yggdrasil + i2pd "just works" on every phone.
**It does not.** Android is a hostile, fragmented environment:

- **Vendor battery policies differ wildly.** Samsung, Xiaomi/MIUI, Huawei,
  OnePlus etc. each have aggressive, non-standard background-process killers
  on top of stock Android. "Disable battery optimization" lives in a
  different menu on every skin, and some vendors kill the process anyway.
- **Android version matters.** Background-execution limits tightened in
  Android 8, 9, 11, 12, 13+. Newer versions are stricter; what survives
  screen-off on Android 10 may die on Android 14.
- **Userspace Yggdrasil (no TUN) may be limited.** A full Yggdrasil node
  normally wants a TUN interface, which needs either root or Android's
  VPNService API. In plain Termux without root you may get reduced
  functionality or need the VPNService path. Some devices need root.
- **Wake-lock is necessary but not sufficient.** `termux-wake-lock` keeps
  the CPU awake but does not exempt you from every vendor killer.

The Network Doctor now checks for this explicitly: **Yggdrasil peer count >
0**, **i2pd `[meshnets] yggdrasil` actually enabled**, and (on Termux)
**wake-lock held** — so when Android silently breaks something, the Doctor
tells you which thing, instead of a green light that lies. If your phone
fights you, that's expected; the long-term fix is the planned Android-native
VPNService daemon (so Termux isn't required at all).


## Battery + data reality

- i2pd in client mode (no transit) is light, but it does keep connections
  open. Expect modest battery use, comparable to a messaging app staying
  connected.
- First network integration uses a few MB (reseed + router info). Steady
  browsing is normal web data plus tunnel overhead.

## If it still won't work

Run the Doctor for a specific diagnosis + fix:
```bash
python3 -m scripts.echelon_network_doctor --probe-eepsite
```
It tells you exactly which layer is failing and gives a copy-paste fix.
Full troubleshooting matrix: [networking.md](./networking.md) and
[troubleshooting-i2p.md](./troubleshooting-i2p.md).
