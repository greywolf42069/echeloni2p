#!/usr/bin/env bash
# Echelon — Termux (Android) one-shot setup.
#
# The mobile path. Installs i2pd + Python + the Echelon sync daemon in
# Termux, writes battery/data-friendly config, and (for the common
# cellular/CGNAT case) sets up Yggdrasil so eepsites actually load.
#
# In Termux, paste and press Enter:
#   bash <(curl -fsSL https://echelon.network/setup-termux.sh)
#
# Flags:  --with-yggdrasil   (recommended on cellular data)
set -euo pipefail

WITH_YGG="auto"
for a in "$@"; do [ "$a" = "--with-yggdrasil" ] && WITH_YGG="yes"; [ "$a" = "--no-yggdrasil" ] && WITH_YGG="no"; done

say() { printf "\033[36m▶ %s\033[0m\n" "$1"; }
ok()  { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[33m! %s\033[0m\n" "$1"; }

if [ -z "${PREFIX:-}" ] || [ ! -d "${PREFIX:-/nonexistent}" ]; then
  warn "This script is for Termux on Android. PREFIX not set — are you in Termux?"
fi

I2PD_DATA="$HOME/.i2pd"
ECHELON_HOME="$HOME/.echelon"
mkdir -p "$I2PD_DATA" "$ECHELON_HOME"

# ── 1. Packages ─────────────────────────────────────────────────────
say "Updating packages + installing i2pd, python…"
pkg update -y >/dev/null 2>&1 || true
pkg install -y i2pd python >/dev/null 2>&1
# Keep the CPU awake so tunnels survive screen-off.
pkg install -y termux-api >/dev/null 2>&1 || true
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
ok "i2pd + python installed"

# ── 2. i2pd config: phone-optimized (battery + data + faster tunnels) ─
I2PD_CONF="$I2PD_DATA/i2pd.conf"
cat > "$I2PD_CONF" <<CONF
log = file
logfile = $I2PD_DATA/i2pd.log
loglevel = warn
notransit = true
[http]
enabled = true
address = 127.0.0.1
port = 7070
[httpproxy]
enabled = true
address = 127.0.0.1
port = 4444
inbound.length = 2
outbound.length = 2
inbound.quantity = 5
outbound.quantity = 5
[exploratory]
inbound.length = 2
outbound.length = 2
inbound.quantity = 5
outbound.quantity = 5
[limits]
transittunnels = 0
[reseed]
followredirect = true
CONF
ok "Wrote phone-optimized i2pd.conf (no transit, 2-hop, fast pool)"

# ── 3. Yggdrasil (almost always needed on cellular/CGNAT) ───────────
setup_yggdrasil() {
  say "Installing Yggdrasil (NAT bypass — needed on most cellular networks)…"
  pkg install -y yggdrasil >/dev/null 2>&1 || { warn "yggdrasil pkg unavailable; skipping"; return 1; }
  YGG_CONF="$PREFIX/etc/yggdrasil.conf"
  if [ ! -f "$YGG_CONF" ]; then
    yggdrasil -genconf > "$YGG_CONF"
  fi
  # Inject public peers if none present.
  if ! grep -qE 'tls://|tcp://' "$YGG_CONF"; then
    python3 - "$YGG_CONF" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
peers = ["tls://ygg.mkg20001.io:443","tcp://ygg-nyc.incognet.io:8883","tls://ygg.yt:443"]
block = "Peers: [\n" + "\n".join("  "+x for x in peers) + "\n]"
s = re.sub(r'Peers:\s*\[[^\]]*\]', block, s, count=1, flags=re.DOTALL)
open(p,"w").write(s)
print("added", len(peers), "yggdrasil peers")
PY
  fi
  # Enable the i2pd meshnet transport.
  grep -q "meshnets" "$I2PD_CONF" || printf "\n[meshnets]\nyggdrasil = true\n" >> "$I2PD_CONF"
  # Start yggdrasil (Termux has no root; userspace TUN via the app's VPN
  # service, or run yggdrasil with its built-in userspace networking).
  pkill -f yggdrasil 2>/dev/null || true
  nohup yggdrasil -useconffile "$YGG_CONF" >"$ECHELON_HOME/yggdrasil.log" 2>&1 &
  sleep 3
  ok "Yggdrasil running + i2pd set to route over it"
}

if [ "$WITH_YGG" = "yes" ]; then
  setup_yggdrasil || true
elif [ "$WITH_YGG" = "auto" ]; then
  warn "On cellular data you'll likely need Yggdrasil. If eepsites don't load,"
  warn "re-run:  bash $0 --with-yggdrasil"
fi

# ── 4. Start i2pd ───────────────────────────────────────────────────
pkill -f "i2pd.*$I2PD_DATA" 2>/dev/null || true
say "Starting i2pd…"
nohup i2pd --datadir="$I2PD_DATA" --conf="$I2PD_CONF" >/dev/null 2>&1 &
sleep 3
ok "i2pd running (proxy 127.0.0.1:4444)"

# ── 5. Echelon sync daemon ──────────────────────────────────────────
if [ -f scripts/echelon_sync_daemon.py ]; then
  pkill -f echelon_sync_daemon 2>/dev/null || true
  nohup python3 -m scripts.echelon_sync_daemon >"$ECHELON_HOME/daemon.log" 2>&1 &
  sleep 2
  ok "Echelon sync daemon on 127.0.0.1:7071"
else
  warn "Copy scripts/ into Termux (or run from the repo) to start the sync daemon."
fi

echo
ok "Done. Check health any time with:"
echo "    python3 -m scripts.echelon_network_doctor --probe-eepsite"
echo
echo "Leave Termux running in the background. First eepsite can take a few"
echo "minutes while i2pd joins the network. Open Echelon and browse."
