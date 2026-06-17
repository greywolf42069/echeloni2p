"""
Sensitivity sweep: how does APR change as bond fraction varies?

This is the actionable insight from the simulator. It tells us what
bond-pool size we need at network maturity to hit any given target APR.
The relationship is hyperbolic (APR ∝ 1 / total_bonded), so very
sensitive at small bonds and flat at large ones.

Run with:
    python -m echelon_rewards.sensitivity

Output: outputs/sensitivity_apr_vs_bond.csv
"""
from __future__ import annotations

import csv
from pathlib import Path

from . import params as P
from . import network as N


# Sweep over bond fractions: 0.5% → 50% of total RTD supply.
BOND_FRACTIONS = [0.005, 0.01, 0.025, 0.05, 0.10, 0.20, 0.30, 0.50]

# Fixed scenario otherwise (10K subscribers, 500 relays).
BASE = dict(
    n_relays=500,
    n_subscribers=10_000,
    n_epochs=365,        # year 1 only — emission decays so year-1 APR is the peak
    rtd_price_usd=0.10,
    pumpfun_daily_volume_usd=250_000,
    seed=42,
)


def run_sensitivity():
    rows = []
    for frac in BOND_FRACTIONS:
        bond = int(P.TOTAL_SUPPLY_RTD * frac)
        params = P.Params(initial_total_bonded_rtd=bond, **BASE)
        net = N.Network.from_params(params)
        # Step through year 1; track first-30-days, mid-year, end-of-year APR.
        early_aprs = []
        mid_aprs = []
        late_aprs = []
        for epoch in range(365):
            r = net.step(epoch)
            if epoch < 30:
                early_aprs.append(r.avg_apr_annualized)
            elif 165 <= epoch < 195:
                mid_aprs.append(r.avg_apr_annualized)
            elif epoch >= 335:
                late_aprs.append(r.avg_apr_annualized)
        rows.append({
            "bond_fraction_of_supply": frac,
            "initial_total_bonded_rtd": bond,
            "apr_first_30d_avg": sum(early_aprs) / len(early_aprs),
            "apr_mid_year_30d_avg": sum(mid_aprs) / len(mid_aprs),
            "apr_year_end_30d_avg": sum(late_aprs) / len(late_aprs),
            "treasury_rtd_final": net.treasury_rtd,
            "total_emission_year_1": net.cumulative_emission_rtd,
            "total_fees_year_1_usd": net.cumulative_fees_usd,
        })
    return rows


def main():
    here = Path(__file__).resolve().parent.parent
    outdir = here / "outputs"
    outdir.mkdir(parents=True, exist_ok=True)
    rows = run_sensitivity()
    out = outdir / "sensitivity_apr_vs_bond.csv"
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print("=" * 72)
    print("APR Sensitivity to Initial Bond Fraction")
    print("(10K subscribers, year 1 only, RTD @ $0.10, $250K/day pump.fun volume)")
    print("=" * 72)
    print(
        f"{'Bond %':>8} | {'Bonded RTD':>14} | "
        f"{'Day 1-30 APR':>13} | {'Mid-yr APR':>11} | {'End-yr APR':>11}"
    )
    print("-" * 72)
    for r in rows:
        print(
            f"{r['bond_fraction_of_supply']*100:>7.1f}% | "
            f"{r['initial_total_bonded_rtd']:>14,} | "
            f"{r['apr_first_30d_avg']*100:>11.1f}% | "
            f"{r['apr_mid_year_30d_avg']*100:>9.1f}% | "
            f"{r['apr_year_end_30d_avg']*100:>9.1f}%"
        )
    print()
    print(f"CSV written to: {out}")


if __name__ == "__main__":
    main()
