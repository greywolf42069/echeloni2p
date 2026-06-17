#!/data/data/com.termux/files/usr/bin/bash
# ─────────────────────────────────────────────────────────────
# Echelon — One-Line Termux Installer
#
# Usage (paste into Termux):
#   curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install-termux.sh | bash
#
# What this does:
#   1. Installs i2pd + python + git
#   2. Clones the Echelon repo
#   3. Creates a ~/start-echelon.sh launcher
#   4. Starts i2pd + sync daemon
#
# After this, open the Echelon PWA and it connects automatically.
# ─────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Echelon — Termux Installer       ║"
echo "  ║   I2P Node + Sync Daemon Setup       ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

INSTALL_DIR="$HOME/Echelon"
LAUNCHER="$HOME/start-echelon.sh"

# ── Step 1: Install packages ──
echo -e "${YELLOW}[1/4] Installing packages...${NC}"
pkg update -y -q 2>/dev/null
pkg install -y -q python git i2pd 2>/dev/null
echo -e "${GREEN}  ✓ python, git, i2pd installed${NC}"

# ── Step 2: Clone / update repo ──
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}[2/4] Updating existing Echelon install...${NC}"
    cd "$INSTALL_DIR"
    git pull --quiet 2>/dev/null || true
    echo -e "${GREEN}  ✓ Updated to latest${NC}"
else
    echo -e "${YELLOW}[2/4] Cloning Echelon...${NC}"
    git clone --quiet https://github.com/greywolf42069/echeloni2p.git "$INSTALL_DIR" 2>/dev/null || {
            echo -e "${RED}  ✗ Could not clone repo. Please clone manually:${NC}"
            echo "    git clone https://github.com/greywolf42069/echeloni2p.git ~/Echelon"
            exit 1
        }
    echo -e "${GREEN}  ✓ Cloned to $INSTALL_DIR${NC}"
fi

# ── Step 4: Create launcher + boot persistence ──
echo -e "${YELLOW}[4/5] Creating launcher...${NC}"
cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Echelon launcher — starts i2pd + sync daemon
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ECHELON_DIR="$HOME/Echelon"
LOGFILE="$HOME/.echelon/echelon.log"

mkdir -p "$HOME/.echelon"

# Keep Termux alive in background
termux-wake-lock 2>/dev/null || true

echo -e "${GREEN}Starting i2pd...${NC}"
i2pd --daemon 2>/dev/null
sleep 3

echo -e "${GREEN}Starting Echelon sync daemon on :7071...${NC}"
cd "$ECHELON_DIR"
python3 scripts/echelon_sync_daemon.py >> "$LOGFILE" 2>&1 &
DAEMON_PID=$!

echo "$DAEMON_PID" > "$HOME/.echelon/daemon.pid"

echo -e "${YELLOW}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Echelon is running!                ║"
echo "  ║                                      ║"
echo "  ║   I2P router:  :4444 (HTTP proxy)    ║"
echo "  ║   I2P console: :7070 (web UI)        ║"
echo "  ║   Sync daemon: :7071 (Echelon)       ║"
echo "  ║                                      ║"
echo "  ║   Open the Echelon PWA now.          ║"
echo "  ║   Press Ctrl+C to stop.              ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

wait $DAEMON_PID
LAUNCHER_EOF

chmod +x "$LAUNCHER"
echo -e "${GREEN}  ✓ Created $LAUNCHER${NC}"

# ── Step 5: Boot persistence (Termux:Boot) ──
echo -e "${YELLOW}[5/5] Setting up auto-start on boot...${NC}"
BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/echelon.sh"

mkdir -p "$BOOT_DIR"
cat > "$BOOT_SCRIPT" << 'BOOT_EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Auto-start Echelon on device boot
# Requires Termux:Boot (install from F-Droid)
termux-wake-lock 2>/dev/null

# Wait for network to be available
sleep 10

# Start i2pd
i2pd --daemon 2>/dev/null
sleep 5

# Start sync daemon
cd "$HOME/Echelon"
python3 scripts/echelon_sync_daemon.py >> "$HOME/.echelon/echelon.log" 2>&1 &
BOOT_EOF

chmod +x "$BOOT_SCRIPT"
echo -e "${GREEN}  ✓ Boot script created at $BOOT_SCRIPT${NC}"
echo -e "${YELLOW}  ⚠ Install Termux:Boot from F-Droid to activate auto-start${NC}"

# ── Start everything now ──
echo ""
echo -e "${YELLOW}Starting services now...${NC}"

pkill i2pd 2>/dev/null || true
sleep 1
i2pd --daemon 2>/dev/null
sleep 2

cd "$INSTALL_DIR"
mkdir -p "$HOME/.echelon"
python3 scripts/echelon_sync_daemon.py >> "$HOME/.echelon/echelon.log" 2>&1 &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$HOME/.echelon/daemon.pid"
sleep 1

if kill -0 $DAEMON_PID 2>/dev/null; then
    echo -e "${GREEN}  ✓ Sync daemon running on :7071 (PID $DAEMON_PID)${NC}"
else
    echo -e "${RED}  ✗ Sync daemon failed to start. Run manually:${NC}"
    echo "    cd ~/Echelon && python3 scripts/echelon_sync_daemon.py"
    exit 1
fi

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════╗"
echo "  ║   ✅ Echelon is ready!               ║"
echo "  ║                                      ║"
echo "  ║   I2P router:  127.0.0.1:4444        ║"
echo "  ║   I2P console: 127.0.0.1:7070        ║"
echo "  ║   Sync daemon: 127.0.0.1:7071        ║"
echo "  ║                                      ║"
echo "  ║   → Open the Echelon PWA now         ║"
echo "  ║   → I2P takes 5-15 min to connect    ║"
echo "  ║                                      ║"
echo "  ║   Auto-start: ✅ Enabled             ║"
echo "  ║   (requires Termux:Boot from F-Droid) ║"
echo "  ║                                      ║"
echo "  ║   Restart manually:                  ║"
echo "  ║   bash ~/start-echelon.sh            ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"
