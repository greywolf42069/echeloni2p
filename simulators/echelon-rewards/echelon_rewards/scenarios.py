"""
Pre-defined scenarios + the CLI runner that emits constants + report.

Scenarios:
- baseline_1k:   1,000 subscribers, 100 relays
- baseline_10k:  10,000 subscribers, 500 relays
- baseline_100k: 100,000 subscribers, 5,000 relays

Outputs land under `outputs/`:
- `outputs/constants.json`          → the program constants the Anchor uses
- `outputs/report_<scenario>.json`  → per-scenario summary
- `outputs/timeseries_<scenario>.csv` (full epoch history if record_full_history)
"""
from __future__ import annotations

import csv
import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

from . import params as P
from . import model as M
from . import network as N


# ─── Scenarios ───────────────────────────────────────────────────────────


SCENARIOS = {
    "baseline_1k": P.Params(
        n_relays=100, n_subscribers=1_000,
        n_epochs=2 * 365 + 30,        # 2 years + a buffer
        initial_total_bonded_rtd=200_000,
        seed=42,
    ),
    "baseline_10k": P.Params(
        n_relays=500, n_subscribers=10_000,
        n_epochs=2 * 365 + 30,
        initial_total_bonded_rtd=1_500_000,
        seed=42,
    ),
    "baseline_100k": P.Params(
        n_relays=5_000, n_subscribers=100_000,
        n_epochs=2 * 365 + 30,
        initial_total_bonded_rtd=15_000_000,
        seed=42,
    ),
}


# ─── Constants — the simulator's primary deliverable ─────────────────────


def derive_program_constants() -> dict:
    """Compute the on-chain program constants from the model + scenario sims.

    These values get embedded into the Rust Anchor program. The simulator
    is the source of truth for them.
    """
    cap_per_rtd_per_epoch = M.max_bytes_per_rtd_per_epoch()

    # Saturation point: target ~1000 active relays at network maturity.
    # With 100M total supply, ~10% bonded gives us 10M / 1000 = 10K RTD/node
    # at saturation. We multiply by β=1.0 (= just the share).
    target_relays_at_maturity = 1_000
    expected_total_bonded_at_maturity = P.TOTAL_SUPPLY_RTD * 0.10  # 10M
    saturation_point_rtd = M.saturation_point(
        total_stake=expected_total_bonded_at_maturity,
        n_target_nodes=target_relays_at_maturity,
    )

    return {
        "version": 1,
        "MIN_BOND_RTD": P.MIN_BOND_RTD,
        "MAX_BYTES_PER_RECEIPT": P.INITIAL_MAX_BYTES_PER_RECEIPT,
        "MAX_BYTES_PER_RTD_PER_EPOCH": cap_per_rtd_per_epoch,
        "SATURATION_POINT_RTD": int(saturation_point_rtd),
        "EMISSION_POOL_RTD": P.EMISSION_POOL_RTD,
        "EMISSION_WINDOW_DAYS": P.EMISSION_WINDOW_DAYS,
        "SATURATION_ALPHA": P.SATURATION_ALPHA,
        "SATURATION_BETA": P.SATURATION_BETA,
        "TREASURY_RTD_BURN_RATE": P.TREASURY_RTD_BURN_RATE,
        "SLASHER_REWARD_FRACTION": P.SLASHER_REWARD_FRACTION,
        "CROSS_CHECK_DISCREPANCY_THRESHOLD": P.CROSS_CHECK_DISCREPANCY_THRESHOLD,
        "RTD_DISCOUNT": P.RTD_DISCOUNT,
        "OCT_DISCOUNT": P.OCT_DISCOUNT,
        "USDC_BASELINE": P.USDC_BASELINE,
        "BANDWIDTH_FEE_TO_TREASURY": P.BANDWIDTH_FEE_TO_TREASURY,
        "BANDWIDTH_FEE_TO_RELAYS": P.BANDWIDTH_FEE_TO_RELAYS,
        "HOSTING_FEE_TO_TREASURY": P.HOSTING_FEE_TO_TREASURY,
        "HOSTING_FEE_TO_HOSTS": P.HOSTING_FEE_TO_HOSTS,
    }


# ─── Per-scenario report ─────────────────────────────────────────────────


def summarize_scenario(name: str, net: N.Network) -> dict:
    """Boil down a completed simulation to a comparable summary."""
    history = net.history
    if not history:
        return {"name": name, "error": "no history"}

    # APR averages
    year_1_aprs = [r.avg_apr_annualized for r in history if r.epoch < 365]
    year_2_aprs = [r.avg_apr_annualized for r in history if 365 <= r.epoch < 2 * 365]

    # Sustainability check: how many year-2 epochs did the invariant hold?
    year_2_epochs = [r for r in history if 365 <= r.epoch < 2 * 365]
    sustained_count = sum(1 for r in year_2_epochs if r.sustainability_invariant)

    final = history[-1]
    return {
        "name": name,
        "params": {
            "n_relays": net.params.n_relays,
            "n_subscribers": net.params.n_subscribers,
            "n_epochs": net.params.n_epochs,
            "initial_total_bonded_rtd": net.params.initial_total_bonded_rtd,
            "rtd_price_usd": net.params.rtd_price_usd,
            "seed": net.params.seed,
        },
        "results": {
            "total_emission_rtd": net.cumulative_emission_rtd,
            "total_burned_rtd": net.cumulative_burned_rtd,
            "total_fees_usd": net.cumulative_fees_usd,
            "treasury_rtd_final": net.treasury_rtd,
            "treasury_usd_final": net.treasury_usd,
            "operator_earnings_total_rtd": sum(n.cumulative_earnings_rtd for n in net.nodes),
            "avg_apr_year_1": (
                sum(year_1_aprs) / len(year_1_aprs) if year_1_aprs else 0.0
            ),
            "avg_apr_year_2": (
                sum(year_2_aprs) / len(year_2_aprs) if year_2_aprs else 0.0
            ),
            "sustainability_year_2_pct": (
                sustained_count / len(year_2_epochs) if year_2_epochs else 0.0
            ),
            "n_active_relays_final": final.n_active_relays,
            "final_total_bonded_rtd": final.total_bonded_rtd,
        },
    }


# ─── CSV timeseries dump ─────────────────────────────────────────────────


def write_timeseries(net: N.Network, path: Path) -> None:
    if not net.history:
        return
    fieldnames = list(asdict(net.history[0]).keys())
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in net.history:
            writer.writerow(asdict(row))


# ─── CLI entry ───────────────────────────────────────────────────────────


def run_all(output_dir: Path) -> dict:
    """Run all scenarios + emit all artifacts. Returns a summary dict."""
    output_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "constants": derive_program_constants(),
        "scenarios": [],
    }

    for name, params in SCENARIOS.items():
        net = N.run_scenario(params)
        s = summarize_scenario(name, net)
        summary["scenarios"].append(s)
        # Write per-scenario timeseries CSV
        write_timeseries(net, output_dir / f"timeseries_{name}.csv")
        with (output_dir / f"report_{name}.json").open("w") as f:
            json.dump(s, f, indent=2)

    # Emit the constants
    with (output_dir / "constants.json").open("w") as f:
        json.dump(summary["constants"], f, indent=2)

    # Emit a top-level summary
    with (output_dir / "summary.json").open("w") as f:
        json.dump(summary, f, indent=2)

    return summary


def main():
    """python -m echelon_rewards.scenarios"""
    here = Path(__file__).resolve().parent.parent
    out = here / "outputs"
    summary = run_all(out)
    print_human_summary(summary)


def print_human_summary(summary: dict) -> None:
    """Print a readable summary of the run results."""
    print("=" * 70)
    print("Echelon Rewards Simulator — Run Summary")
    print("=" * 70)
    print()
    print("Derived program constants:")
    for k, v in summary["constants"].items():
        if isinstance(v, float):
            print(f"  {k:40s} = {v:.6f}")
        else:
            print(f"  {k:40s} = {v}")
    print()
    print("Scenarios:")
    print()
    for s in summary["scenarios"]:
        p = s["params"]
        r = s["results"]
        print(f"  ── {s['name']} (n={p['n_subscribers']} subscribers, {p['n_relays']} relays) ──")
        print(f"     Year-1 APR (avg):              {r['avg_apr_year_1']:.2%}")
        print(f"     Year-2 APR (avg):              {r['avg_apr_year_2']:.2%}")
        print(f"     Sustainability invariant Y2:   {r['sustainability_year_2_pct']:.1%} of epochs")
        print(f"     Total emission RTD:            {r['total_emission_rtd']:,.0f}")
        print(f"     Total burned RTD:              {r['total_burned_rtd']:,.0f}")
        print(f"     Total fees (USD):              ${r['total_fees_usd']:,.0f}")
        print(f"     Treasury RTD (final):          {r['treasury_rtd_final']:,.0f}")
        print(f"     Treasury USD (final):          ${r['treasury_usd_final']:,.0f}")
        print(f"     Operator earnings RTD (total): {r['operator_earnings_total_rtd']:,.0f}")
        print()


if __name__ == "__main__":
    main()
