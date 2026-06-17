/**
 * This file acts as a re-exporter.
 * Workaround for module loading ambiguity where extension-less imports
 * may resolve to .tsx over .ts in this environment.
 *
 * v2.1 audit: dropped re-exports for the deleted illustrative-only
 * constants (NOTIFICATIONS_DATA, SIMULATED_NOTIFICATIONS,
 * TOKEN_BALANCES_DATA, TRANSACTION_HISTORY_DATA, EEPSITE_HOSTING_DATA).
 * Anything still consumed by token-gated UI lives in data.ts as
 * `@illustrative` constants.
 */
import {
    LEADERBOARD_DATA,
    EMISSION_CHART_DATA,
    REFERRAL_DATA,
    WORKFLOW_DATA,
    TOTAL_RTD_SUPPLY,
    TOTAL_STAKED_RTD,
    STAKED_SUPPLY_HISTORY_DATA,
    SUBSCRIPTION_TIERS,
} from './data.ts';
import { WORKFLOW_TEMPLATES } from './workflowTemplates.ts';

export {
    LEADERBOARD_DATA,
    EMISSION_CHART_DATA,
    REFERRAL_DATA,
    WORKFLOW_DATA,
    WORKFLOW_TEMPLATES,
    TOTAL_RTD_SUPPLY,
    TOTAL_STAKED_RTD,
    STAKED_SUPPLY_HISTORY_DATA,
    SUBSCRIPTION_TIERS,
};
