"""
Network autopilot — maps a Network-Doctor diagnosis to:
  • the current MODE (A_NATIVE .. E_DEGRADED),
  • a machine-readable autofix PLAN separating fixes the daemon can apply
    itself (no root) from actions that need the user (install/sudo),
  • the set of SAFE i2pd config edits apply-safe-config is allowed to make.

Doctrine: "Echelon picks the best tunnel mode automatically and only asks
the user to act when it cannot self-heal." And: no fake magic — if root /
install is required, say so explicitly in requiresUserAction.

Pure module (no I/O). The daemon endpoints wrap it; apply-safe-config is
the only one that writes, and it writes ONLY the keys this module marks
safe, via the existing whitelisted i2pd_config writer.
"""
from __future__ import annotations

import dataclasses
from typing import List

from scripts import network_doctor as nd


# Modes (match docs/network-modes.md).
MODE_NATIVE = "A_NATIVE"
MODE_YGGDRASIL = "B_YGGDRASIL"
MODE_BOOTSTRAP = "C_BOOTSTRAP"
MODE_OFFLINE = "D_OFFLINE"
MODE_DEGRADED = "E_DEGRADED"

# i2pd config edits the daemon may apply ITSELF (no root, all in the
# whitelisted set i2pd_config already validates). These are the "client
# survives a flaky network better" tweaks — never anything that opens a
# port, accepts transit, or needs privileges.
SAFE_CONFIG_FIXES = {
    # key -> (value, human reason)
    "notransit": ("true", "Stop relaying others' traffic — saves battery/data and frees tunnels for your own browsing."),
}


@dataclasses.dataclass
class AutofixPlan:
    mode: str
    reason: str
    safe_auto_fixes: List[str]      # codes the daemon can apply now
    requires_user_action: List[str]  # codes the user must do (install/sudo)

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "reason": self.reason,
            "safeAutoFixes": self.safe_auto_fixes,
            "requiresUserAction": self.requires_user_action,
        }


def classify_mode(diag: nd.Diagnosis, *, yggdrasil_running: bool) -> AutofixPlan:
    """Derive the mode + autofix plan from a Doctor diagnosis."""
    checks = {c.key: c for c in diag.checks}

    def status(key: str) -> str:
        c = checks.get(key)
        return c.status if c else "info"

    daemon_down = status("daemon") == "fail"
    i2pd_down = status("i2pd") == "fail"
    routers_low = status("routers") == "warn"
    nat_hostile = status("nat") == "warn"
    tunnels_stalled = status("tunnels") == "fail"
    eepsite_ok = status("eepsite") == "pass"
    rec = diag.recommendation

    safe_fixes: List[str] = []
    user_actions: List[str] = []

    # ── Hard down ───────────────────────────────────────────────────
    if daemon_down or i2pd_down:
        if daemon_down:
            user_actions.append("start_daemon")
        if i2pd_down:
            user_actions.append("start_i2pd")
        return AutofixPlan(MODE_DEGRADED, "core_services_down", safe_fixes, user_actions)

    # ── Reseeding / discovering ─────────────────────────────────────
    if routers_low:
        # We can nudge reseed reliability ourselves (no root).
        safe_fixes.append("reseed_follow_redirect")
        return AutofixPlan(MODE_BOOTSTRAP, "still_reseeding_low_router_count", safe_fixes, user_actions)

    # ── Healthy ─────────────────────────────────────────────────────
    if eepsite_ok or (not tunnels_stalled and not nat_hostile):
        mode = MODE_YGGDRASIL if yggdrasil_running else MODE_NATIVE
        return AutofixPlan(mode, "tunnels_healthy", safe_fixes, user_actions)

    # ── Stalled tunnels ─────────────────────────────────────────────
    if tunnels_stalled:
        # Always-safe client tweak we can apply now.
        safe_fixes.append("client_i2pd_config")
        if nat_hostile or (rec and rec.code in ("enable_yggdrasil", "wait_yggdrasil")):
            if yggdrasil_running:
                # Already on Yggdrasil but stalled — give it time / more peers.
                return AutofixPlan(MODE_YGGDRASIL, "yggdrasil_on_tunnels_building", safe_fixes, user_actions)
            # Needs Yggdrasil install — that's a user action (install + maybe sudo).
            user_actions.append("install_yggdrasil")
            return AutofixPlan(MODE_DEGRADED, "symmetric_nat_stalled_client_tunnels", safe_fixes, user_actions)
        # Stalled but NAT looks OK — just building.
        return AutofixPlan(MODE_BOOTSTRAP, "tunnels_building", safe_fixes, user_actions)

    # ── Fallback ────────────────────────────────────────────────────
    return AutofixPlan(MODE_DEGRADED, "unknown", safe_fixes, user_actions)


# ── apply-safe-config: the ONLY writer, and only safe keys ──────────

# Map a safeAutoFix code → the concrete whitelisted i2pd_config edits it
# performs. Codes NOT in here are user-actions and are never applied.
SAFE_FIX_CONFIG_EDITS = {
    # Client-friendly: stop transit (battery/data), which also frees tunnel
    # slots for the user's own browsing under a constrained network.
    "client_i2pd_config": {"notransit": "true"},
    # reseed_follow_redirect / reseed accel live in [reseed] which our
    # whitelist doesn't currently expose for writing → treated as advisory
    # only (returned in plan, not auto-written). Kept explicit so we never
    # silently claim to have applied something we didn't.
}

# Codes that, even if requested, must NEVER be auto-applied (need root /
# install / open ports). apply-safe-config refuses these loudly.
USER_ACTION_CODES = frozenset({
    "install_yggdrasil", "start_daemon", "start_i2pd", "reseed_follow_redirect",
})


def applicable_safe_edits(requested_codes: List[str]) -> tuple[dict, List[str], List[str]]:
    """Given requested fix codes, return:
      (config_edits_to_write, applied_codes, refused_codes)
    Only codes with concrete whitelisted edits are applied; anything in
    USER_ACTION_CODES (or unknown) is refused with a reason."""
    edits: dict = {}
    applied: List[str] = []
    refused: List[str] = []
    for code in requested_codes:
        if code in USER_ACTION_CODES:
            refused.append(code)
            continue
        cfg = SAFE_FIX_CONFIG_EDITS.get(code)
        if not cfg:
            refused.append(code)
            continue
        edits.update(cfg)
        applied.append(code)
    return edits, applied, refused
