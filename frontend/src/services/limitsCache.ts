import { db } from '../db/indexedDB';

import type {
  PlanType as SharedPlanType,
  MeLimits as SharedMeLimits,
  MeLimitsResponse as SharedMeLimitsResponse,
  MeLimitsUsage as SharedMeLimitsUsage,
} from '@shared/types/limits';

export type PlanType = SharedPlanType;
export type MeLimits = SharedMeLimits;
export type MeLimitsUsage = SharedMeLimitsUsage;
export type MeLimitsResponse = SharedMeLimitsResponse;

export const ME_LIMITS_SETTINGS_KEY = 'me_limits_v1';

export async function getCachedMeLimits(): Promise<MeLimitsResponse | null> {
  try {
    const row = await db.settings.get(ME_LIMITS_SETTINGS_KEY);
    if (!row?.value) return null;
    return JSON.parse(row.value) as MeLimitsResponse;
  } catch {
    return null;
  }
}

export async function setCachedMeLimits(value: MeLimitsResponse): Promise<void> {
  const now = new Date().toISOString();
  await db.settings.put({
    key: ME_LIMITS_SETTINGS_KEY,
    value: JSON.stringify(value),
    createdAt: now,
    updatedAt: now
  });
}

export async function clearCachedMeLimits(): Promise<void> {
  try {
    await db.settings.delete(ME_LIMITS_SETTINGS_KEY);
  } catch {}
}
