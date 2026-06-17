// It's better practice to import these from a central data source
// if they were truly dynamic, but for this simulation, importing from data is fine.
import { TOTAL_STAKED_RTD, TOTAL_RTD_SUPPLY } from './data.ts';

/**
 * Calculates the current dynamic Annual Percentage Rate (APR) for staking.
 * The APR is inversely proportional to the percentage of the total supply currently staked.
 * This model incentivizes staking when network participation is low and stabilizes
 * as the network becomes more secure.
 *
 * The formula is derived to target an ~80% APR when the staked percentage is ~57%,
 * reflecting the current state of the mock data.
 * C = APR * StakedPercentage => 80 * 0.57245 = 45.796
 * We use this constant to calculate APR for any stake percentage.
 *
 * @param {number} totalStaked - The total amount of RTD currently staked across the network.
 * @param {number} totalSupply - The total supply of RTD.
 * @returns {number} The calculated current APR as a percentage (e.g., 80.5).
 */
export const calculateCurrentApr = (totalStaked: number, totalSupply: number): number => {
    if (totalSupply <= 0 || totalStaked <= 0) {
        return 0; // Avoid division by zero and handle edge cases
    }

    const stakedPercentage = totalStaked / totalSupply;
    
    // Constant derived from the target APR of 80% at 57.245% staked.
    const C = 45.796;

    const currentApr = C / stakedPercentage;

    // Cap the APR at a reasonable maximum to avoid extreme values if staking is very low.
    // And set a floor so it doesn't go to zero if everyone stakes.
    return Math.max(5, Math.min(currentApr, 2000)); 
};

/**
 * Pre-calculated APR based on initial data for convenience.
 * This allows other components to have an initial value without recalculating.
 */
export const INITIAL_APR = calculateCurrentApr(TOTAL_STAKED_RTD, TOTAL_RTD_SUPPLY);
