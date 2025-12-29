import { apiClient } from './api/baseApi';
import { setCachedMeLimits, type MeLimitsResponse } from './limitsCache';

export async function fetchAndCacheMeLimits(): Promise<MeLimitsResponse | null> {
  try {
    const resp = await apiClient.get<MeLimitsResponse>('/me/limits');
    const data = resp.data as any;
    if (!data || typeof data !== 'object') return null;
    await setCachedMeLimits(data as MeLimitsResponse);
    try { window.dispatchEvent(new CustomEvent('limits:updated', { detail: data })); } catch {}
    return data as MeLimitsResponse;
  } catch {
    return null;
  }
}

