/**
 * Initial Sync Hook - Triggers cache refresh from server on page load
 *
 * For authenticated users with empty IndexedDB, this fetches data from
 * the server to populate the local database. The useLiveQuery hooks will
 * then automatically update the UI when the data arrives.
 */

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api/baseApi';

/**
 * Hook to trigger initial cache refresh from server on page load.
 *
 * Usage:
 *   const { syncing } = useInitialSync();
 *   // Show loading state if syncing && data is empty
 */
export function useInitialSync() {
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const syncTriggered = useRef(false);

    useEffect(() => {
        // Only run once per component mount
        if (syncTriggered.current) return;
        syncTriggered.current = true;

        // Only sync for authenticated users
        if (!apiClient.isAuthenticated()) {
            return;
        }

        // Only sync if online
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return;
        }

        const doSync = async () => {
            setSyncing(true);
            setError(null);
            try {
                const { refreshCache } = await import('../services/cacheService');
                await refreshCache();
            } catch (e) {
                console.warn('[useInitialSync] Cache refresh failed:', e);
                setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                setSyncing(false);
            }
        };

        doSync();
    }, []);

    return { syncing, error };
}
