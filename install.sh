#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Echelon — Desktop Installer (macOS / Linux)
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/greywolf42069/echeloni2p/main/install.sh | bash
#
# What this does:
#   1. Installs i2pd (brew on macOS, apt on Linux)
#   2. Clones the Echelon repo
#   3. Creates a ~/start-echelon.sh launcher
#   4. Starts i2pd + sync daemon
# ─────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Echelon — Desktop Installer      ║"
echo "  ║   I2P Node + Sync Daemon Setup       ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

INSTALL_DIR="$HOME/Echelon"
LAUNCHER="$HOME/start-echelon.sh"

# ── Step 1: Install i2pd ──
echo -e "${YELLOW}[1/4] Installing i2pd...${NC}"
if command -v i2pd &>/dev/null; then
    echo -e "${GREEN}  ✓ i2pd already installed${NC}"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
        brew install i2pd 2>/dev/null
    else
        echo -e "${RED}  ✗ Homebrew not found. Install from https://brew.sh${NC}"
        exit 1
    fi
elif command -v apt &>/dev/null; then
    sudo apt update -qq && sudo apt install -y -qq i2pd
elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm i2pd
elif command -v dnf &>/dev/null; then
    sudo dnf install -y i2pd
else
    echo -e "${RED}  ✗ Could not install i2pd. Install it manually for your OS.${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ i2pd installed${NC}"

# ── Step 2: Check Python ──
echo -e "${YELLOW}[2/4] Checking Python...${NC}"
if command -v python3 &>/dev/null; then
    echo -e "${GREEN}  ✓ python3 found ($(python3 --version 2>&1))${NC}"
else
    echo -e "${RED}  ✗ python3 not found. Install Python 3.8+ for your OS.${NC}"
    exit 1
fi

# ── Step 3: Clone / update repo ──
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}[3/4] Updating existing Echelon install...${NC}"
    cd "$INSTALL_DIR"
    git pull --quiet 2>/dev/null || true
    echo -e "${GREEN}  ✓ Updated to latest${NC}"
else
    echo -e "${YELLOW}[3/4] Cloning Echelon...${NC}"
    git clone --quiet https://github.com/greywolf42069/echeloni2p.git "$INSTALL_DIR" 2>/dev/null || {
            echo -e "${RED}  ✗ Could not clone repo.${NC}"
            exit 1
        }
    echo -e "${GREEN}  ✓ Cloned to $INSTALL_DIR${NC}"
fi

# ── Step 4: Create launcher + boot persistence ──
echo -e "${YELLOW}[4/5] Creating launcher...${NC}"
cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/bin/bash
# Echelon launcher — starts i2pd + sync daemon
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ECHELON_DIR="$HOME/Echelon"
LOGFILE="$HOME/.echelon/echelon.log"
mkdir -p "$HOME/.echelon"

echo -e "${GREEN}Starting i2pd...${NC}"
i2pd --daemon 2>/dev/null || i2pd &
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
echo "  ║   Open Echelon PWA in your browser.  ║"
echo "  ║   Press Ctrl+C to stop.              ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

wait $DAEMON_PID
LAUNCHER_EOF

chmod +x "$LAUNCHER"

# ── Step 5: Boot persistence ──
echo -e "${YELLOW}[5/5] Setting up auto-start on boot...${NC}"
mkdir -p "$HOME/.echelon"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: launchd
    PLIST="$HOME/Library/LaunchAgents/com.echelon.daemon.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.echelon.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd $HOME/Echelon &amp;&amp; python3 scripts/echelon_sync_daemon.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.echelon/echelon.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.echelon/echelon.log</string>
    <key>WorkingDirectory</key>
    <string>$HOME/Echelon</string>
</dict>
</plist>
PLIST_EOF
    # Fix the $HOME expansion in plist (launchd needs literal path)
    sed -i '' "s|\$HOME|$HOME|g" "$PLIST"
    launchctl load "$PLIST" 2>/dev/null || true
    echo -e "${GREEN}  ✓ launchd service installed: $PLIST${NC}"
    echo -e "${GREEN}  ✓ Starts on login, restarts on crash${NC}"

    # Also create an i2pd launchd plist
    I2PD_PLIST="$HOME/Library/LaunchAgents/com.echelon.i2pd.plist"
    I2PD_BIN=$(which i2pd 2>/dev/null || echo "/opt/homebrew/bin/i2pd")
    cat > "$I2PD_PLIST" << I2PD_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.echelon.i2pd</string>
    <key>ProgramArguments</key>
    <array>
        <string>${I2PD_BIN}</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.echelon/i2pd.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.echelon/i2pd.log</string>
</dict>
</plist>
I2PD_EOF
    sed -i '' "s|\$HOME|$HOME|g" "$I2PD_PLIST"
    launchctl load "$I2PD_PLIST" 2>/dev/null || true
    echo -e "${GREEN}  ✓ i2pd launchd service installed${NC}"

else
    # Linux: systemd user service
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SYSTEMD_DIR"

    cat > "$SYSTEMD_DIR/echelon-sync.service" << EOF
[Unit]
Description=Echelon Sync Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$HOME/Echelon
ExecStart=$(which python3) scripts/echelon_sync_daemon.py
Restart=on-failure
RestartSec=5
StandardOutput=append:$HOME/.echelon/echelon.log
StandardError=append:$HOME/.echelon/echelon.log

[Install]
WantedBy=default.target
EOF

    cat > "$SYSTEMD_DIR/i2pd.service" << EOF
[Unit]
Description=I2P Router (i2pd)
After=network.target

[Service]
Type=simple
ExecStart=$(which i2pd)
Restart=on-failure
RestartSec=5
StandardOutput=append:$HOME/.echelon/i2pd.log
StandardError=append:$HOME/.echelon/i2pd.log

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable echelon-sync.service 2>/dev/null || true
    systemctl --user enable i2pd.service 2>/dev/null || true
    systemctl --user start i2pd.service 2>/dev/null || true
    systemctl --user start echelon-sync.service 2>/dev/null || true

    echo -e "${GREEN}  ✓ systemd user services installed${NC}"
    echo -e "${GREEN}  ✓ Starts on login, restarts on crash${NC}"
fi

# ── Start everything now ──
echo ""
echo -e "${YELLOW}Starting services now...${NC}"

pkill i2pd 2>/dev/null || true
sleep 1
i2pd --daemon 2>/dev/null || i2pd &
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
    echo -e "${RED}  ✗ Sync daemon failed. Run manually:${NC}"
    echo "    cd ~/Echelon && python3 scripts/echelon_sync_daemon.py"
    exit 1
fi

echo ""
echo -e "${GREEN}  ✅ Echelon is ready!${NC}"
echo ""
echo "  I2P router:  127.0.0.1:4444"
echo "  I2P console: 127.0.0.1:7070"
echo "  Sync daemon: 127.0.0.1:7071"
echo ""
echo "  → Open http://localhost:5173 or the PWA"
echo "  → I2P takes 5-15 min to fully connect"
echo "  → Auto-start on boot: ✅ Enabled"
echo "  → Restart manually: bash ~/start-echelon.sh"
echo "  → Logs: ~/.echelon/echelon.log"
echo ""
