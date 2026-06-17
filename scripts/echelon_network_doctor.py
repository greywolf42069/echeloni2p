#!/usr/bin/env python3
"""
Echelon Network Doctor — CLI.

Diagnoses why I2P browsing isn't working and prints a copy-pasteable fix.
Zero-config: it probes the local daemon, i2pd, and Yggdrasil and runs the
pure diagnostic engine in scripts/network_doctor.py.

Usage (from repo root, or copy this file next to the daemon in Termux):
    python3 -m scripts.echelon_network_doctor
    python3 -m scripts.echelon_network_doctor --probe-eepsite   # also test a live fetch
    python3 -m scripts.echelon_network_doctor --json            # machine-readable

Env overrides:
    ECHELON_SYNC_HOST/PORT          (default 127.0.0.1:7071)
    ECHELON_I2PD_CONSOLE_HOST/PORT  (default 127.0.0.1:7070)
    ECHELON_I2PD_PROXY_HOST/PORT    (default 127.0.0.1:4444)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import i2pd_stats          # noqa: E402
from scripts import network_doctor as nd  # noqa: E402
from scripts.i2p_fetch import fetch_eepsite, I2pFetchError  # noqa: E402

REG_I2P_B32 = "shx5vqsw7usdaunyzr2qmes2fq37oumybpudrd4jjj4e4vk4uusa.b32.i2p"


def _port_open(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((host, port)) == 0
    except OSError:
        return False


def _daemon_reachable() -> bool:
    host = os.environ.get("ECHELON_SYNC_HOST", "127.0.0.1")
    port = int(os.environ.get("ECHELON_SYNC_PORT", "7071"))
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def _detect_platform() -> str:
    # Termux sets PREFIX to /data/data/com.termux/...
    if "com.termux" in os.environ.get("PREFIX", ""):
        return "termux"
    if sys.platform == "darwin":
        return "macos"
    return "generic"


def _yggdrasil_installed() -> bool:
    return shutil.which("yggdrasil") is not None


def _yggdrasil_running() -> bool:
    try:
        out = subprocess.run(
            ["pgrep", "-f", "yggdrasil"], capture_output=True, timeout=3,
        )
        return out.returncode == 0 and bool(out.stdout.strip())
    except Exception:
        return False


def _probe_eepsite() -> bool:
    host = os.environ.get("ECHELON_I2PD_PROXY_HOST", "127.0.0.1")
    port = int(os.environ.get("ECHELON_I2PD_PROXY_PORT", "4444"))
    try:
        r = fetch_eepsite(REG_I2P_B32, proxy_host=host, proxy_port=port)
        return r.status == 200
    except I2pFetchError:
        return False
    except Exception:
        return False


def gather(probe_eepsite: bool) -> nd.DoctorInputs:
    console_host = os.environ.get("ECHELON_I2PD_CONSOLE_HOST", "127.0.0.1")
    console_port = int(os.environ.get("ECHELON_I2PD_CONSOLE_PORT", "7070"))
    stats = i2pd_stats.fetch_i2pd_stats(console_host, console_port, timeout=4.0)
    return nd.DoctorInputs(
        daemon_reachable=_daemon_reachable(),
        i2pd_stats=stats,
        yggdrasil_installed=_yggdrasil_installed(),
        yggdrasil_running=_yggdrasil_running(),
        eepsite_probe_ok=_probe_eepsite() if probe_eepsite else None,
    )


_ICON = {"pass": "✓", "warn": "!", "fail": "✗", "info": "→"}
_COLOR = {"pass": "\033[32m", "warn": "\033[33m", "fail": "\033[31m", "info": "\033[36m"}
_RESET = "\033[0m"


def _print_human(diag: nd.Diagnosis, color: bool):
    def c(status, text):
        if not color:
            return text
        return f"{_COLOR.get(status, '')}{text}{_RESET}"

    print()
    print("  Echelon Network Doctor")
    print("  " + "─" * 36)
    for chk in diag.checks:
        icon = _ICON.get(chk.status, "·")
        line = f"  [{icon}] {chk.label}"
        print(c(chk.status, line))
        if chk.detail:
            print(f"        {chk.detail}")
    print()
    verdict_color = {"ok": "pass", "degraded": "warn", "down": "fail"}[diag.overall]
    print(c(verdict_color, f"  Overall: {diag.overall.upper()}"))
    if diag.recommendation:
        r = diag.recommendation
        print()
        print(c("info", f"  → {r.title}"))
        for ln in r.body.split("\n"):
            print(f"     {ln}")
        if r.command:
            print()
            print("     Copy & run:")
            print("     " + "-" * 32)
            for ln in r.command.split("\n"):
                print(f"       {ln}")
            print("     " + "-" * 32)
    print()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Echelon Network Doctor")
    ap.add_argument("--probe-eepsite", action="store_true",
                    help="also attempt a live fetch of a known eepsite (slow)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--no-color", action="store_true")
    args = ap.parse_args(argv)

    inp = gather(args.probe_eepsite)
    diag = nd.diagnose(inp, platform=_detect_platform())

    if args.json:
        print(json.dumps(diag.to_dict(), indent=2))
    else:
        _print_human(diag, color=not args.no_color and sys.stdout.isatty())

    return 0 if diag.overall != "down" else 1


if __name__ == "__main__":
    raise SystemExit(main())
