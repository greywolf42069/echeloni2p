# Troubleshooting I2P in Echelon

Fast answers, keyed by symptom. For the "why," see
[networking.md](./networking.md); for the mode picker, see
[network-modes.md](./network-modes.md). The fastest path is always the
**Network Doctor** (in-app under Protect, or
`python3 -m scripts.echelon_network_doctor --probe-eepsite`).

---

### "i2pd not detected" / Network Doctor says i2pd down

i2pd isn't running or its console (`127.0.0.1:7070`) isn't reachable.
```bash
i2pd --daemon            # or re-run the setup script
```

### Eepsites spin forever and never load

Almost always tunnel building stalled under NAT. Check the Doctor:
- **Routers < 50** → still discovering peers; wait 5–15 min (first start).
- **"Symmetric NAT" + client tunnels stuck at 1–2** → the NAT is eating
  tunnel handshakes. **Fix: Yggdrasil** ([networking.md §3](./networking.md)).
  On mobile: re-run `setup_termux_i2pd.sh --with-yggdrasil`.

### "Host not found" for a hostname like notbob.i2p

i2pd resolves hostnames via an **addressbook subscription** it hasn't
fetched yet. Two fixes:
- Use the site's **b32 address** instead (works without an addressbook).
- Or add subscriptions and wait for them to sync.

Note: i2pd returns this as an HTTP **500** "Proxy error: Host not found"
(not a 404) — Echelon classifies it correctly as a DNS/address failure and
shows the smart "address not found" error page.

### Loads on Wi-Fi but not on cellular

Classic CGNAT. Cellular = carrier-grade NAT. Enable Yggdrasil
([mobile-termux.md](./mobile-termux.md)).

### Everything's "green" but a specific eepsite won't load

That eepsite may be offline, or its leaseset hasn't propagated. Try:
- The Doctor's **Deep test** (fetches a known-good eepsite) — if that works,
  the problem is the specific site, not you.
- A different eepsite from the directory homepage.

### Publishing an eepsite fails

- Daemon unreachable → Echelon queues the publish and retries automatically
  (you'll see "N pending publishes"). Start the daemon; it flushes.
- File too big → per-file cap 4 MB, per-site 64 MB.

### Tunnels were fine, then died after the screen turned off (Android)

Android killed Termux or slept the CPU. Disable battery optimization for
Termux and ensure the wake-lock is held (the setup script does this; or run
`termux-wake-lock`).

### Wallet won't connect

Unrelated to I2P. The wallet path uses your browser wallet (Phantom/Solflare
on web, Mobile Wallet Adapter on Android) + your chosen Solana RPC. Check
that, not i2pd.

---

If the Doctor's recommendation doesn't resolve it, capture
`python3 -m scripts.echelon_network_doctor --json` output and the tail of
`~/.i2pd/i2pd.log` and file an issue.
