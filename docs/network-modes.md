# Echelon Network Modes

Users don't care about I2P. They care that it works on coffee-shop Wi-Fi,
hotel NAT, campus networks, and whatever their cellular carrier is doing.
Echelon's job is to **pick the best tunnel mode automatically** and only
ask the user to act when it genuinely can't self-heal.

The Network Doctor (`scripts/network_doctor.py`, the in-app **Network
Doctor** screen, and `python3 -m scripts.echelon_network_doctor`) detects
the current situation and recommends the mode.

## The modes

| Mode | When | How it works | Status |
|---|---|---|---|
| **A — Native i2pd** | Open/restricted NAT (most home Wi-Fi) | i2pd connects to peers directly; standard SSU2/NTCP2 transports | ✅ shipped |
| **B — i2pd over Yggdrasil** | Symmetric NAT / CGNAT (most cellular, corporate, some fiber) | i2pd routes peer connections over the Yggdrasil UDP mesh, which does its own NAT traversal | ✅ shipped + verified live |
| **C — Relay-assisted bootstrap** | Cold start / few known routers | Reseed + lower threshold + 2-hop tunnels so a working tunnel forms faster | ✅ shipped (the phone config defaults) |
| **D — Offline / cached mirror** | No connectivity, or daemon down | Serve the user's own published eepsites + the SW-cached app shell read-only | ◻ planned (PWA offline shell exists; eepsite cache is v0.2) |
| **E — Degraded read-only** | i2pd up but tunnels stalled | Let the user read cached/queued content + see the Doctor's fix; don't pretend it's working | ✅ the Doctor surfaces this honestly |

## How the Doctor decides (the real logic)

From `scripts/network_doctor.py::diagnose()`:

1. Daemon reachable? No → **start daemon** (Mode E, can't route).
2. i2pd reachable? No → **start i2pd**.
3. Routers < 50 → still discovering → **wait** (Mode C in progress).
4. NAT hostile (symmetric/firewalled)? Flag it.
5. **Client tunnels < 3** → the real "stalled" signal (this is what NAT
   breaks). Combined with hostile NAT or low tunnel-success-rate →
   recommend **Mode B (Yggdrasil)** with a copy-paste command.
   - Already on Yggdrasil but still stalled → **wait** (pools fill).
   - Good NAT but stalled → just **wait** (don't push Yggdrasil needlessly).
6. Optional live eepsite probe = ground truth; if it loads, you're **OK**
   regardless of the NAT label.

The key insight encoded here: a naive "is i2pd up?" check says green while
the user stares at a spinner. The Doctor checks **client tunnel health +
NAT type + (optionally) a real fetch**, which is what actually predicts
whether browsing works.

## Why not just bundle a VPN?

A plain VPN moves your egress IP; it does **not** help i2pd discover and
reach I2P peers, which is the actual failure under symmetric NAT. Yggdrasil
gives i2pd a NAT-immune transport to ride — "build a hallway that ignores
the locked door," not "use a different door." See
[networking.md](./networking.md) for the full reasoning + setup.

## Verified

Mode B (i2pd-over-Yggdrasil) was proven on real hardware during
development: macOS arm64 behind symmetric NAT, raw i2pd couldn't reliably
load eepsites; with Yggdrasil enabled, the live `reg.i2p` homepage fetched
end-to-end through the full Echelon pipeline and the sanitizer invariants
held (`scripts/tests/test_i2p_live.py`).
