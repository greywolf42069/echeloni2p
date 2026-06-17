"""
Agent classes for the Echelon simulator.

A Node represents a bonded relay operator. Nodes have:
  - `bond_rtd`: amount of RTD locked as bond (sybil resistance)
  - `delegated_rtd`: external delegation (v0.2+; default 0 in v1)
  - `node_class`: 'termux_mobile' | 'server_residential' (different uptime profiles)
  - `attestation_score`: reserved for v0.2; default 1.0 in v0.1

A Subscriber is just a row in `Network`'s subscriber count by tier; no
behavior modeled per-individual.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from . import params as P


NodeClass = Literal["termux_mobile", "server_residential"]


@dataclass
class Node:
    """A bonded relay node in the Echelon network."""
    node_id: int
    bond_rtd: float
    node_class: NodeClass
    attestation_score: float = 1.0   # design-v2 §3.3 — reserved for v0.2
    delegated_rtd: float = 0.0       # v0.2 delegation; 0 in v1
    profit_margin: float = 0.10      # 10% commission on delegated rewards (v0.2)
    cumulative_earnings_rtd: float = 0.0
    cumulative_uptime_days: int = 0
    cumulative_active_days: int = 0
    bytes_carried_total: float = 0.0
    slashed: bool = False

    def total_stake(self) -> float:
        """Bond + delegated."""
        return self.bond_rtd + self.delegated_rtd

    def sample_uptime(self, rng: np.random.Generator) -> float:
        """Sample today's uptime fraction from this node's class profile.

        Termux/mobile: mean 70%, stddev 15%, clipped to [0, 1].
        Server: mean 97%, stddev 2%, clipped to [0, 1].
        """
        if self.node_class == "termux_mobile":
            mean, std = P.TERMUX_UPTIME_MEAN, P.TERMUX_UPTIME_STDDEV
        else:
            mean, std = P.SERVER_UPTIME_MEAN, P.SERVER_UPTIME_STDDEV
        return float(np.clip(rng.normal(mean, std), 0.0, 1.0))

    def is_active_today(self, uptime_today: float, threshold: float = 0.50) -> bool:
        """A node is "active for emission purposes" if it was up for more than
        the threshold fraction of the day. Off-chain attestation aggregates to
        this binary at epoch boundary.
        """
        return uptime_today >= threshold


def initial_node_population(params: P.Params, rng: np.random.Generator) -> list[Node]:
    """Construct the initial set of relay nodes per scenario params.

    Strategy:
    - `params.fraction_initial_relays_with_min_bond` of nodes start at MIN_BOND.
    - Remainder draw from a Pareto-tail distribution (long tail of larger
      bonds — early adopters and serious operators)
    - `params.fraction_relays_termux_mobile` are mobile, rest are servers.
    """
    n = params.n_relays
    n_min_bond = int(n * params.fraction_initial_relays_with_min_bond)
    n_above_min = n - n_min_bond
    n_mobile = int(n * params.fraction_relays_termux_mobile)

    bonds = np.empty(n, dtype=np.float64)
    bonds[:n_min_bond] = float(P.MIN_BOND_RTD)

    # Remainder follows Pareto with shape=2 ⇒ long-tail; scale calibrated so
    # the average non-min-bond stake is ~5× MIN_BOND. The sum across all such
    # nodes hits roughly initial_total_bonded_rtd minus min-bond contribution.
    if n_above_min > 0:
        target_above_min = max(
            params.initial_total_bonded_rtd - n_min_bond * P.MIN_BOND_RTD,
            0.0,
        )
        # Pareto draws then rescaled to hit target sum.
        raw = rng.pareto(2.0, size=n_above_min) + 1.0
        scale = target_above_min / raw.sum()
        bonds[n_min_bond:] = raw * scale
        # Floor at MIN_BOND (Pareto can produce small values; we wouldn't bond
        # below the on-chain minimum)
        bonds[n_min_bond:] = np.maximum(bonds[n_min_bond:], P.MIN_BOND_RTD)

    rng.shuffle(bonds)

    # Class assignment
    classes: list[NodeClass] = ["termux_mobile"] * n_mobile + ["server_residential"] * (n - n_mobile)
    rng.shuffle(classes)

    return [
        Node(node_id=i, bond_rtd=float(bonds[i]), node_class=classes[i])
        for i in range(n)
    ]
