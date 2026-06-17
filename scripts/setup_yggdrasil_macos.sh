#!/usr/bin/env bash
# Echelon — macOS one-shot setup.
#
# Installs + starts i2pd, optionally Yggdrasil (for hostile NAT), and the
# Echelon sync daemon. Idempotent: safe to re-run. Paste into Terminal
# and press Enter.
#
#   bash <(curl -fsSL https://echelon.network/setup-macos.sh)
# or, from a checkout:
#   bash scripts/setup_yggdrasil_macos.sh
#
# Flags:
#   --with-yggdrasil   force the Yggdrasil NAT-bypass path
#   --no-yggdrasil     skip it even if NAT looks hostile
set -euo pipefail

WITH_YGG="auto"
for a in "$@"; do
  case "$a" in
    --with-yggdrasil) WITH_YGG="yes" ;;
    --no-yggdrasil)   WITH_YGG="no" ;;
  esac
done

ECHELON_HOME="${ECHELON_HOME:-$HOME/.echelon}"
I2PD_DATA="${I2PD_DATA:-$HOME/.i2pd}"
mkdir -p "$ECHELON_HOME" "$I2PD_DATA"

say() { printf "\033[36m▶ %s\033[0m\n" "$1"; }
ok()  { printf "\033[32m✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[33m! %s\033[0m\n" "$1"; }

# ── 1. Homebrew ─────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew not found. Install from https://brew.sh first, then re-run."
  exit 1
fi

# ── 2. i2pd ─────────────────────────────────────────────────────────
if ! command -v i2pd >/dev/null 2>&1 && [ ! -x /usr/local/opt/i2pd/bin/i2pd ] && [ ! -x /opt/homebrew/opt/i2pd/bin/i2pd ]; then
  say "Installing i2pd…"
  brew install i2pd
fi
I2PD_BIN="$(command -v i2pd || echo /usr/local/opt/i2pd/bin/i2pd)"
[ -x "$I2PD_BIN" ] || I2PD_BIN=/opt/homebrew/opt/i2pd/bin/i2pd
ok "i2pd: $I2PD_BIN"

# ── 3. i2pd config (client-friendly defaults) ───────────────────────
I2PD_CONF="$I2PD_DATA/i2pd.conf"
if [ ! -f "$I2PD_CONF" ]; then
  say "Writing client-friendly i2pd.conf…"
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
[reseed]
followredirect = true
CONF
fi

# ── 4. Yggdrasil (NAT bypass) ───────────────────────────────────────
maybe_yggdrasil() {
  if [ "$WITH_YGG" = "no" ]; then return; fi
  if [ "$WITH_YGG" = "auto" ]; then
    warn "If eepsites won't load after ~15 min (symmetric/CGNAT), re-run with --with-yggdrasil"
    return
  fi
  say "Installing + configuring Yggdrasil (NAT bypass)…"
  brew install yggdrasil 2>/dev/null || true
  # Add public peers + enable in i2pd. Requires sudo for the TUN device.
  warn "Yggdrasil needs admin rights for its network interface."
  if ! grep -q "meshnets" "$I2PD_CONF"; then
    printf "\n[meshnets]\nyggdrasil = true\n" >> "$I2PD_CONF"
  fi
  echo "  → Add public peers to /etc/yggdrasil.conf (see docs/networking.md §3)"
  echo "  → sudo brew services start yggdrasil"
}
maybe_yggdrasil

# ── 5. Start i2pd ───────────────────────────────────────────────────
if ! pgrep -f "i2pd.*$I2PD_DATA" >/dev/null 2>&1; then
  say "Starting i2pd…"
  nohup "$I2PD_BIN" --datadir="$I2PD_DATA" --conf="$I2PD_CONF" >/dev/null 2>&1 &
  sleep 3
fi
ok "i2pd running (HTTP proxy 127.0.0.1:4444, console 127.0.0.1:7070)"

# ── 6. Echelon sync daemon ──────────────────────────────────────────
if [ -f scripts/echelon_sync_daemon.py ]; then
  say "Starting Echelon sync daemon…"
  pkill -f echelon_sync_daemon 2>/dev/null || true
  nohup python3 -m scripts.echelon_sync_daemon >"$ECHELON_HOME/daemon.log" 2>&1 &
  sleep 2
  ok "Sync daemon on 127.0.0.1:7071"
else
  warn "Run this from the Echelon repo root to also start the sync daemon."
fi

echo
ok "Setup complete. Run the doctor to check health:"
echo "    python3 -m scripts.echelon_network_doctor --probe-eepsite"
echo
echo "Then open Echelon and browse. First eepsite load can take 5–15 min"
echo "while i2pd integrates into the network."
