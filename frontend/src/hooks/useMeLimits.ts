import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/indexedDB';
import { CORE_EVENT_KINDS } from '@shared/types/limits';
import { ME_LIMITS_SETTINGS_KEY, type MeLimitsResponse } from '../services/limitsCache';

export function useMeLimits(): {
  meLimits: MeLimitsResponse | null;
  allowedEventKinds: string[];
  planType: MeLimitsResponse['planType'] | 'free';
} {
  const row = useLiveQuery(() => db.settings.get(ME_LIMITS_SETTINGS_KEY), []);
  const meLimits = useMemo(() => {
    try {
      if (!row?.value) return null;
      return JSON.parse(row.value) as MeLimitsResponse;
    } catch {
      return null;
    }
  }, [row?.value]);

  const allowedEventKinds = meLimits?.allowedEventKinds?.length
    ? meLimits.allowedEventKinds
    : [...CORE_EVENT_KINDS];

  return {
    meLimits,
    allowedEventKinds,
    planType: meLimits?.planType || 'free',
  };
}
