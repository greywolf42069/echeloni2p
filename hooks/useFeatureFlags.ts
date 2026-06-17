import { useEffect, useState } from 'react';
import {
    type FeatureFlags,
    getFeatureFlags,
    subscribeFeatureFlags,
} from '../featureFlags.ts';

/**
 * React hook returning the current feature flag snapshot. Re-renders
 * whenever flags change (in-tab via CustomEvent, cross-tab via storage).
 *
 * Usage:
 *   const flags = useFeatureFlags();
 *   if (!flags.tokenEconomy) return <ComingWithV02 />;
 */
export function useFeatureFlags(): Readonly<FeatureFlags> {
    const [flags, setFlags] = useState<Readonly<FeatureFlags>>(() => getFeatureFlags());
    useEffect(() => {
        // Re-snapshot on mount in case an override changed between
        // the initial useState and the effect running.
        setFlags(getFeatureFlags());
        return subscribeFeatureFlags(setFlags);
    }, []);
    return flags;
}
