"""
Echelon reward + emission simulator.

Public API (importable):
    from echelon_rewards import Params, Node, Network, run_scenario

Math foundations:
    - Reward saturation: Diaz, "Reward Sharing for Mixnets" (Univ. Edinburgh, 2022).
      https://www.research.ed.ac.uk/en/publications/reward-sharing-for-mixnets
    - Reference Python implementation: nymtech/rewardsharing-simulator
      (Apache-2.0). We do NOT copy their code; we re-implement the same
      mathematical model parameterized for Echelon's specifics
      (see docs/economy/design-v2.md for the spec this simulates).
"""
from .params import Params, EpochResult
from .model import (
    saturation_reward,
    emission_for_epoch,
    distribute_fees,
    burn_rate,
)
from .agents import Node
from .network import Network, run_scenario

__all__ = [
    "Params",
    "EpochResult",
    "saturation_reward",
    "emission_for_epoch",
    "distribute_fees",
    "burn_rate",
    "Node",
    "Network",
    "run_scenario",
]
