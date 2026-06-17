"""
Echelon Network Doctor — diagnoses why I2P browsing isn't working and
prescribes the exact fix.

The hard problem for users is NOT "is i2pd installed" — it's "i2pd is
running, knows hundreds of routers, and STILL can't load an eepsite
because the NAT is eating tunnel handshakes." A naive up/down check says
"green" while the user stares at a spinner. This module encodes the real
diagnostic logic learned from running i2pd behind symmetric NAT:

  - daemon reachable?
  - i2pd proxy reachable?
  - reseeded / discovering routers?
  - building CLIENT tunnels (the thing NAT actually breaks)?
  - tunnel creation success rate healthy?
  - NAT type hostile (symmetric / firewalled)?
  - Yggdrasil transport available as the escape hatch?

It returns an ordered list of checks (pass/warn/fail) plus a single
prioritized RECOMMENDATION with a copy-pasteable fix. Pure + deterministic
so it's fully unit-tested; the CLI (scripts/echelon_network_doctor.py)
and the daemon /network/doctor endpoint both call diagnose().
"""
from __future__ import annotations

import dataclasses
from typing import List, Optional


# Thresholds learned from real i2pd-behind-NAT observation.
MIN_HEALTHY_ROUTERS = 50          # below this, still reseeding/discovering
MIN_CLIENT_TUNNELS = 3            # 1-2 = NAT is strangling handshakes
LOW_SUCCESS_RATE = 25            # tunnel creation success % below this = struggling
HOSTILE_NAT_MARKERS = ("symmetric", "firewalled")


@dataclasses.dataclass
class Check:
    key: str
    status: str          # "pass" | "warn" | "fail" | "info"
    label: str           # human one-liner
    detail: str = ""     # optional extra context


@dataclasses.dataclass
class Recommendation:
    code: str            # machine code, e.g. "enable_yggdrasil"
    title: str
    body: str
    # Optional copy-paste command the UI shows behind a Copy button.
    command: Optional[str] = None


@dataclasses.dataclass
class Diagnosis:
    overall: str         # "ok" | "degraded" | "down"
    checks: List[Check]
    recommendation: Optional[Recommendation]

    def to_dict(self) -> dict:
        return {
            "overall": self.overall,
            "checks": [dataclasses.asdict(c) for c in self.checks],
            "recommendation": dataclasses.asdict(self.recommendation) if self.recommendation else None,
        }


# ── Inputs ───────────────────────────────────────────────────────────


@dataclasses.dataclass
class DoctorInputs:
    """Everything the doctor needs. The CLI/endpoint gather these; the
    pure diagnose() never does I/O."""
    daemon_reachable: bool
    i2pd_stats: dict            # from i2pd_stats.fetch_i2pd_stats / empty_stats
    yggdrasil_installed: bool
    yggdrasil_running: bool
    # Did a probe of a known-stable eepsite succeed? None = not probed.
    eepsite_probe_ok: Optional[bool] = None
    # Honesty signals (None = unknown / not gathered):
    yggdrasil_peers: Optional[int] = None      # established ygg peer count
    i2pd_meshnet_enabled: Optional[bool] = None  # [meshnets] yggdrasil = true in i2pd.conf
    termux_wake_lock: Optional[bool] = None    # termux-wake-lock held (Android process survival)
    platform_is_termux: bool = False


# ── Fix templates (copy-paste commands) ──────────────────────────────

YGGDRASIL_FIX_MACOS = (
    "# Symmetric/CGNAT detected. Route i2pd over the Yggdrasil mesh:\n"
    "brew install yggdrasil 2>/dev/null || true\n"
    "# add public peers + start it, then in i2pd.conf set:  [meshnets]\\n  yggdrasil = true\n"
    "# Full walkthrough: docs/networking.md §3"
)
YGGDRASIL_FIX_TERMUX = (
    "pkg install yggdrasil -y\n"
    "yggdrasil -genconf > $PREFIX/etc/yggdrasil.conf\n"
    "# add public peers to that file (see docs/mobile-termux.md), then start it,\n"
    "# and set  [meshnets]\\n  yggdrasil = true  in ~/.i2pd/i2pd.conf"
)


# ── The diagnostic engine (pure) ─────────────────────────────────────


def diagnose(inp: DoctorInputs, *, platform: str = "generic") -> Diagnosis:
    checks: List[Check] = []
    rec: Optional[Recommendation] = None

    # 1. Echelon sync daemon
    if not inp.daemon_reachable:
        checks.append(Check("daemon", "fail", "Echelon sync daemon not reachable",
                            "The local helper that talks to i2pd isn't running."))
        return Diagnosis(
            "down", checks,
            Recommendation(
                "start_daemon",
                "Start the Echelon sync daemon",
                "Run the sync daemon in Termux (or your terminal). It bridges the "
                "app to i2pd and serves sanitized eepsites.",
                command="python3 -m echelon_sync_daemon",
            ),
        )
    checks.append(Check("daemon", "pass", "Echelon sync daemon running"))

    stats = inp.i2pd_stats or {}
    running = bool(stats.get("running"))

    # 2. i2pd reachable
    if not running:
        checks.append(Check("i2pd", "fail", "i2pd not reachable",
                            "i2pd isn't running or its web console/proxy is down."))
        return Diagnosis(
            "down", checks,
            Recommendation(
                "start_i2pd",
                "Start i2pd",
                "i2pd is the I2P router that does the anonymous routing. Start it, "
                "then re-run the doctor.",
                command="i2pd --daemon",
            ),
        )
    checks.append(Check("i2pd", "pass", "i2pd reachable",
                        f"version {stats.get('version') or 'unknown'}"))

    routers = int(stats.get("routers", 0) or 0)
    client_tunnels = int(stats.get("tunnelsClient", 0) or 0)
    success = int(stats.get("tunnelCreationSuccessPercent", 0) or 0)
    net_status = (stats.get("networkStatus") or "").lower()
    hostile_nat = any(m in net_status for m in HOSTILE_NAT_MARKERS)

    # 3. Router discovery (reseed/integration)
    if routers < MIN_HEALTHY_ROUTERS:
        checks.append(Check("routers", "warn", f"Only {routers} routers known",
                            "Still reseeding / discovering peers. Give it a few minutes."))
        rec = rec or Recommendation(
            "wait_reseed",
            "Wait for peer discovery",
            f"i2pd knows {routers} routers; it needs to discover more before it can "
            "build tunnels. This is normal on first start — wait 5-15 minutes.",
        )
    else:
        checks.append(Check("routers", "pass", f"{routers} routers known"))

    # 4. NAT type
    if hostile_nat:
        checks.append(Check("nat", "warn", f"Hostile NAT: {stats.get('networkStatus')}",
                            "Symmetric NAT / firewalled — common on cellular + corporate "
                            "networks. I2P's hole-punching may not be enough alone."))
    else:
        checks.append(Check("nat", "pass", f"NAT: {stats.get('networkStatus') or 'OK'}"))

    # 5. Client tunnels — the real health signal
    tunnel_ok = client_tunnels >= MIN_CLIENT_TUNNELS
    if not tunnel_ok:
        checks.append(Check("tunnels", "fail",
                            f"Only {client_tunnels} client tunnel(s) — stalled",
                            "This is the symptom that breaks eepsite loading. Usually NAT."))
    else:
        checks.append(Check("tunnels", "pass", f"{client_tunnels} client tunnels"))

    # 6. Tunnel creation success rate
    if routers >= MIN_HEALTHY_ROUTERS and success and success < LOW_SUCCESS_RATE:
        checks.append(Check("success_rate", "warn",
                            f"Tunnel creation success rate {success}%",
                            "Low — peers aren't completing handshakes (NAT pressure)."))
    elif success:
        checks.append(Check("success_rate", "pass", f"Tunnel creation success rate {success}%"))

    # 7. Eepsite probe (ground truth, if available)
    if inp.eepsite_probe_ok is True:
        checks.append(Check("eepsite", "pass", "Live eepsite reachable",
                            "End-to-end browsing works."))
    elif inp.eepsite_probe_ok is False:
        checks.append(Check("eepsite", "fail", "Could not reach a known eepsite",
                            "Routing isn't completing yet."))

    # 8. Yggdrasil availability
    if inp.yggdrasil_running:
        checks.append(Check("yggdrasil", "pass", "Yggdrasil transport running"))
    elif inp.yggdrasil_installed:
        checks.append(Check("yggdrasil", "info", "Yggdrasil installed but not running"))
    else:
        checks.append(Check("yggdrasil", "info", "Yggdrasil not installed",
                            "The NAT escape hatch — install if tunnels stay stalled."))

    # 8a. Yggdrasil peer count — running with ZERO peers is useless.
    if inp.yggdrasil_running and inp.yggdrasil_peers is not None:
        if inp.yggdrasil_peers <= 0:
            checks.append(Check("yggdrasil_peers", "fail",
                                "Yggdrasil running but has 0 peers",
                                "No peers = no mesh connectivity. Add public peers to "
                                "yggdrasil.conf (see docs/mobile-termux.md) and restart it."))
        else:
            checks.append(Check("yggdrasil_peers", "pass",
                                f"Yggdrasil has {inp.yggdrasil_peers} peer(s)"))

    # 8b. Is i2pd ACTUALLY configured to use the mesh? Running Yggdrasil
    # does nothing if i2pd's [meshnets] yggdrasil isn't enabled.
    if inp.yggdrasil_running and inp.i2pd_meshnet_enabled is False:
        checks.append(Check("meshnet_config", "warn",
                            "Yggdrasil is up but i2pd isn't using it",
                            "Set  [meshnets]\\n  yggdrasil = true  in i2pd.conf and "
                            "restart i2pd, or the mesh transport is ignored."))
    elif inp.yggdrasil_running and inp.i2pd_meshnet_enabled is True:
        checks.append(Check("meshnet_config", "pass", "i2pd is routing over Yggdrasil"))

    # 8c. (Termux/Android only) wake-lock — Android kills background
    # processes aggressively; without a wake-lock i2pd dies on screen-off.
    if inp.platform_is_termux and inp.termux_wake_lock is not None:
        if inp.termux_wake_lock:
            checks.append(Check("wake_lock", "pass", "Termux wake-lock held",
                                "Android won't suspend i2pd on screen-off."))
        else:
            checks.append(Check("wake_lock", "warn", "No Termux wake-lock",
                                "Android may kill i2pd when the screen turns off. "
                                "Run `termux-wake-lock` (and disable battery optimization "
                                "for Termux). Behavior varies by vendor + Android version."))

    # ── Prioritized recommendation ─────────────────────────────────
    # The headline fix: stalled tunnels under hostile NAT → Yggdrasil.
    if not tunnel_ok and routers >= MIN_HEALTHY_ROUTERS:
        if hostile_nat or success < LOW_SUCCESS_RATE:
            if inp.yggdrasil_running:
                # Already on Yggdrasil but still stalled — give it time.
                rec = Recommendation(
                    "wait_yggdrasil",
                    "Yggdrasil is on — give tunnels time to build",
                    "You're routing over Yggdrasil already. Tunnel pools fill over a few "
                    "minutes; if it's still stalled after ~10 min, add more Yggdrasil peers.",
                )
            else:
                fix = YGGDRASIL_FIX_TERMUX if platform == "termux" else YGGDRASIL_FIX_MACOS
                rec = Recommendation(
                    "enable_yggdrasil",
                    "Enable the Yggdrasil transport",
                    "Your i2pd knows plenty of peers but can't complete tunnel handshakes "
                    "because of the NAT. Route i2pd over the Yggdrasil mesh to punch through "
                    "— this is the fix for symmetric / carrier-grade NAT.",
                    command=fix,
                )
        else:
            rec = rec or Recommendation(
                "wait_tunnels",
                "Tunnels are still building",
                "Routers look healthy and NAT looks OK; give tunnel pools a few minutes to fill.",
            )

    # Overall verdict.
    if any(c.status == "fail" for c in checks if c.key in ("daemon", "i2pd")):
        overall = "down"
    elif inp.eepsite_probe_ok is True or (tunnel_ok and not hostile_nat):
        overall = "ok"
    elif tunnel_ok:
        overall = "ok"
    else:
        overall = "degraded"

    return Diagnosis(overall, checks, rec)
