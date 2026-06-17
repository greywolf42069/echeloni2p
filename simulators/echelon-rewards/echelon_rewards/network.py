"""
Network state evolution over time.

The Network class holds:
- The list of bonded Nodes
- Treasury balances (RTD + USDC)
- Cumulative emission, fees, burns
- Subscriber counts per tier

Each `step()` advances one epoch (1 day) and:
1. Computes today's bandwidth demand from subscribers
2. Distributes bandwidth fees per design-v2 §9.3
3. Mints emission per the decay schedule
4. Computes per-node reward share via saturation function
5. Applies 50% RTD burn to treasury inflow
6. Updates per-node earnings + uptime
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import params as P
from . import model as M
from .agents import Node, initial_node_population


@dataclass
class Network:
    params: P.Params
    rng: np.random.Generator
    nodes: list[Node] = field(default_factory=list)

    # Treasury balances
    treasury_rtd: float = 0.0
    treasury_usd: float = 0.0      # USDC + USD-equivalent of OCT
    cumulative_burned_rtd: float = 0.0
    cumulative_emission_rtd: float = 0.0
    cumulative_fees_usd: float = 0.0

    history: list = field(default_factory=list)

    @classmethod
    def from_params(cls, params: P.Params) -> "Network":
        rng = np.random.default_rng(params.seed)
        nodes = initial_node_population(params, rng)
        return cls(params=params, rng=rng, nodes=nodes)

    # ─── Per-epoch bookkeeping ─────────────────────────────────────────

    def total_bonded(self) -> float:
        return sum(n.total_stake() for n in self.nodes if not n.slashed)

    def n_active(self) -> int:
        return sum(1 for n in self.nodes if not n.slashed)

    # ─── Demand model ──────────────────────────────────────────────────

    def daily_bandwidth_gb(self) -> float:
        """Total bandwidth demand in GB/day across all subscribers."""
        total = 0.0
        for tier, frac in P.TIER_MIX.items():
            n_tier = self.params.n_subscribers * frac
            gb_per_user = self.params.daily_bandwidth_gb_per_subscriber.get(tier, 0)
            total += n_tier * gb_per_user
        return total

    def daily_bandwidth_revenue_usd(self) -> float:
        """Wholesale bandwidth revenue paid by subscribers' subscriptions or PAYG.

        For tier subscribers: fees come from the subscription-tier-monthly-price
        prorated by day. For free tier: zero direct revenue.

        We use *retail* pricing here because that's what subscribers pay.
        The 5%/95% split happens inside distribute_fees().
        """
        total = 0.0
        for tier, frac in P.TIER_MIX.items():
            n_tier = self.params.n_subscribers * frac
            monthly_cents = P.TIER_PRICE_USD_CENTS_PER_MONTH.get(tier, 0)
            daily_usd_per_user = (monthly_cents / 100.0) / 30.0
            total += n_tier * daily_usd_per_user
        return total

    # ─── Daily step ────────────────────────────────────────────────────

    def step(self, epoch: int) -> P.EpochResult:
        """Advance the network state by one epoch."""
        # 1. Today's emission
        emission_today = M.emission_for_epoch(epoch)
        self.cumulative_emission_rtd += emission_today

        # 2. Today's bandwidth demand + revenue
        bandwidth_gb = self.daily_bandwidth_gb()
        bandwidth_revenue_usd = self.daily_bandwidth_revenue_usd()
        self.cumulative_fees_usd += bandwidth_revenue_usd

        # 3. Split bandwidth fees per §9.3
        fee_split = M.distribute_fees(bandwidth_revenue_usd, "bandwidth")
        # Fee split is in USD; for treasury booking we keep it as USD.
        self.treasury_usd += fee_split.treasury

        # 3b. Pump.fun creator fees in RTD (only after Day 0)
        pumpfun_fee_usd = (
            self.params.pumpfun_daily_volume_usd * P.PUMPFUN_CREATOR_FEE
        ) if epoch > 0 else 0.0
        # Treasury earns this in RTD-equivalent (creator fees come out of trades)
        pumpfun_fee_rtd = pumpfun_fee_usd / max(self.params.rtd_price_usd, 1e-12)
        if pumpfun_fee_rtd > 0:
            kept, burned = M.burn_rate(pumpfun_fee_rtd)
            self.treasury_rtd += kept
            self.cumulative_burned_rtd += burned

        # 4. Distribute relay rewards (emission + fee_split.relays)
        # The RTD-denominated relay pool today:
        #   emission_today + fee_split.relays converted to RTD
        relay_fee_share_rtd = (
            fee_split.relays / max(self.params.rtd_price_usd, 1e-12)
        )
        relay_pool_rtd = emission_today + relay_fee_share_rtd

        # Each node's share via saturation_reward, weighted by performance
        # (= today's uptime). Skip slashed.
        active_nodes = [n for n in self.nodes if not n.slashed]
        total_stake = self.total_bonded()
        if total_stake <= 0 or not active_nodes:
            shares = []
        else:
            shares = []
            for node in active_nodes:
                uptime = node.sample_uptime(self.rng)
                share = M.saturation_reward(
                    pledge=node.bond_rtd,
                    delegated=node.delegated_rtd,
                    total_stake=total_stake,
                    performance=uptime,
                )
                shares.append((node, share, uptime))

        # Normalize shares so they sum to 1, then distribute relay_pool_rtd
        total_share = sum(s for _, s, _ in shares)
        if total_share > 0:
            for node, share, uptime in shares:
                norm_share = share / total_share
                reward = relay_pool_rtd * norm_share
                node.cumulative_earnings_rtd += reward
                node.cumulative_uptime_days += int(round(uptime))
                if uptime >= 0.50:
                    node.cumulative_active_days += 1

        # Bytes carried bookkeeping (for sustainability invariant later)
        if shares and bandwidth_gb > 0:
            for node, share, uptime in shares:
                norm_share = share / total_share if total_share > 0 else 0
                node.bytes_carried_total += bandwidth_gb * (1024 ** 3) * norm_share

        # 5. Compute APR snapshot
        operator_earnings_rtd = sum(n.cumulative_earnings_rtd for n in self.nodes)
        operator_earnings_usd = operator_earnings_rtd * self.params.rtd_price_usd

        # APR = annualized rate of operator-earnings-as-yield-on-bond
        # Calculation: annualized = (today's earnings × 365 / total_stake)
        todays_earnings_rtd = relay_pool_rtd
        if total_stake > 0:
            avg_apr = (todays_earnings_rtd * 365.0) / total_stake
        else:
            avg_apr = 0.0

        # 6. Sustainability invariant: are fees ≥ operator emission costs?
        # Operator costs ≈ what they'd be paid to break even on bandwidth
        # provision (= wholesale rate × bytes carried).
        operator_cost_today_usd = (
            bandwidth_gb * P.WHOLESALE_BANDWIDTH_USD_CENTS_PER_GB / 100.0
        )
        sustainability_ok = (epoch >= 365) and (fee_split.relays >= operator_cost_today_usd)

        result = P.EpochResult(
            epoch=epoch,
            total_bonded_rtd=total_stake,
            total_emission_this_epoch=emission_today,
            total_fees_this_epoch_usd=bandwidth_revenue_usd + pumpfun_fee_usd,
            total_burned_rtd_this_epoch=(
                M.burn_rate(pumpfun_fee_rtd)[1] if pumpfun_fee_rtd > 0 else 0.0
            ),
            treasury_balance_rtd=self.treasury_rtd,
            treasury_balance_usd=self.treasury_usd,
            operator_earnings_total_rtd=operator_earnings_rtd,
            operator_earnings_total_usd=operator_earnings_usd,
            avg_apr_annualized=avg_apr,
            sustainability_invariant=sustainability_ok,
            n_active_relays=self.n_active(),
        )
        if self.params.record_full_history:
            self.history.append(result)
        return result


def run_scenario(params: P.Params) -> Network:
    """Top-level: build network and step through n_epochs."""
    net = Network.from_params(params)
    for epoch in range(params.n_epochs):
        net.step(epoch)
    return net
