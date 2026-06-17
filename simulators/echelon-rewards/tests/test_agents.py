"""Tests for echelon_rewards.agents — node initialization + uptime sampling."""
from __future__ import annotations

import numpy as np
import pytest

from echelon_rewards import agents as A
from echelon_rewards import params as P


def _params(seed: int = 42, **overrides):
    p = P.Params(seed=seed)
    for k, v in overrides.items():
        setattr(p, k, v)
    return p


class TestNode:
    def test_total_stake_is_bond_plus_delegated(self):
        n = A.Node(node_id=0, bond_rtd=100, node_class="termux_mobile", delegated_rtd=50)
        assert n.total_stake() == 150

    def test_attestation_score_defaults_to_one(self):
        n = A.Node(node_id=0, bond_rtd=100, node_class="termux_mobile")
        assert n.attestation_score == 1.0

    def test_termux_uptime_lower_than_server(self):
        rng = np.random.default_rng(42)
        termux = A.Node(0, 100, "termux_mobile")
        server = A.Node(1, 100, "server_residential")
        # Sample many times; mean should reflect the class's profile
        termux_samples = [termux.sample_uptime(rng) for _ in range(1000)]
        server_samples = [server.sample_uptime(rng) for _ in range(1000)]
        assert np.mean(termux_samples) < np.mean(server_samples)
        # Sanity: termux mean within ±5% of P.TERMUX_UPTIME_MEAN
        assert abs(np.mean(termux_samples) - P.TERMUX_UPTIME_MEAN) < 0.05
        # Server is much tighter
        assert abs(np.mean(server_samples) - P.SERVER_UPTIME_MEAN) < 0.02

    def test_uptime_clipped_to_unit_interval(self):
        rng = np.random.default_rng(42)
        n = A.Node(0, 100, "termux_mobile")
        for _ in range(10_000):
            u = n.sample_uptime(rng)
            assert 0.0 <= u <= 1.0

    def test_is_active_threshold(self):
        n = A.Node(0, 100, "termux_mobile")
        assert n.is_active_today(0.51)
        assert not n.is_active_today(0.49)


class TestInitialNodePopulation:
    def test_n_nodes_matches_param(self):
        params = _params(n_relays=500)
        rng = np.random.default_rng(42)
        nodes = A.initial_node_population(params, rng)
        assert len(nodes) == 500

    def test_no_node_below_min_bond(self):
        params = _params(n_relays=200, initial_total_bonded_rtd=200_000)
        rng = np.random.default_rng(42)
        nodes = A.initial_node_population(params, rng)
        for node in nodes:
            assert node.bond_rtd >= P.MIN_BOND_RTD, (
                f"node {node.node_id} has bond {node.bond_rtd}, below min {P.MIN_BOND_RTD}"
            )

    def test_class_split_respects_param(self):
        params = _params(n_relays=1000, fraction_relays_termux_mobile=0.65)
        rng = np.random.default_rng(42)
        nodes = A.initial_node_population(params, rng)
        n_mobile = sum(1 for n in nodes if n.node_class == "termux_mobile")
        # Allow ±2% tolerance from rounding/shuffling
        assert abs(n_mobile / 1000 - 0.65) < 0.02

    def test_total_bonded_close_to_target(self):
        target = 5_000_000
        params = _params(n_relays=1000, initial_total_bonded_rtd=target)
        rng = np.random.default_rng(42)
        nodes = A.initial_node_population(params, rng)
        total = sum(n.bond_rtd for n in nodes)
        # The Pareto-tail rescaling should hit target ±10%. Because we floor
        # at MIN_BOND we may land above target if many Pareto draws were
        # rescaled below MIN_BOND.
        assert 0.9 * target <= total <= 1.5 * target

    def test_deterministic_given_seed(self):
        # Same seed → same bond distribution
        params = _params(n_relays=100, seed=999)
        n1 = A.initial_node_population(params, np.random.default_rng(999))
        n2 = A.initial_node_population(params, np.random.default_rng(999))
        bonds_1 = sorted(n.bond_rtd for n in n1)
        bonds_2 = sorted(n.bond_rtd for n in n2)
        assert bonds_1 == bonds_2

    def test_min_bond_fraction_at_min(self):
        params = _params(
            n_relays=1000,
            fraction_initial_relays_with_min_bond=0.70,
            initial_total_bonded_rtd=1_000_000,
        )
        rng = np.random.default_rng(42)
        nodes = A.initial_node_population(params, rng)
        n_at_min = sum(1 for n in nodes if n.bond_rtd == P.MIN_BOND_RTD)
        # Roughly 70% of nodes start at the minimum bond
        assert 650 <= n_at_min <= 750
