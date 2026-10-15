import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../../src/contexts/AuthContext';
import { authApi, type UserProfile } from '../../../src/services/api/authApi';
import { apiClient } from '../../../src/services/api/baseApi';
import { OFFLINE_IDENTITY_KEY } from '../../../src/services/api/authOfflineIdentity';
import { db } from '../../../src/db/indexedDB';

vi.mock('../../../src/services/limitsService', () => ({ fetchAndCacheMeLimits: vi.fn().mockResolvedValue(null) }));
const profile: UserProfile = {
  id: 'parent-a', email: 'parent@example.test', first_name: 'Parent', last_name: null,
  role: 'USER', email_verified: true, created_at: '2026-01-01', updated_at: '2026-01-02',
};
const jwt = (id = profile.id, expiry = Date.now() / 1000 + 600) =>
  `header.${btoa(JSON.stringify({ userId: id, exp: expiry }))}.signature`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function seed(id = profile.id, expiry = Date.now() / 1000 + 600, cached = true) {
  apiClient.setToken(jwt(id, expiry));
  localStorage.setItem('refresh_token', `refresh-${id}`);
  if (cached) localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: profile.id, profile }));
}
let latest: ReturnType<typeof useAuth>;
function Probe() {
  latest = useAuth();
  return <div>
    <span data-testid="identity">{latest.user?.id ?? 'none'}</span>
    <span data-testid="loading">{String(latest.isLoading)}</span>
    <span data-testid="authenticated">{String(latest.isAuthenticated)}</span>
    <span data-testid="recovery">{latest.recoveryMessage}</span>
  </div>;
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  apiClient.clearSession();
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  await db.clearAllData();
  await db.matchState.put({
    matchId: 'pending-match', status: 'LIVE', timerMs: 1000, lastUpdatedAt: Date.now(),
    createdAt: '2026-01-01', createdByUserId: profile.id, isDeleted: false, synced: false,
  });
  vi.spyOn(db, 'clearAllData');
  fetchMock = vi.fn().mockResolvedValue(json({ success: true, data: profile }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  apiClient.clearSession();
  await db.clearAllData();
});
async function expectPendingPreserved(token: string | null) {
  expect(authApi.getAccessToken()).toBe(token);
  expect(localStorage.getItem('refresh_token')).not.toBeNull();
  expect(db.clearAllData).not.toHaveBeenCalled();
  expect(await db.matchState.get('pending-match')).toMatchObject({ synced: false, createdByUserId: profile.id });
}

describe('cold open local readiness', () => {
  it('uses the confirmed persisted profile immediately when offline', async () => {
    seed();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const token = authApi.getAccessToken();
    mount();
    expect(latest.user).toEqual(profile);
    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await expectPendingPreserved(token);
  });

  it('is ready before a hanging online background profile resolves', async () => {
    seed();
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const token = authApi.getAccessToken();
    mount();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(latest.isAuthenticated).toBe(true);
    await expectPendingPreserved(token);
    await act(async () => { pending.resolve(json({ success: true, data: { ...profile, first_name: 'Updated' } })); });
    await waitFor(() => expect(latest.user?.first_name).toBe('Updated'));
  });

  it.each(['transport', 'timeout', 500, 503, 429])('retains cached identity and pending records on profile %s', async failure => {
    seed();
    const token = authApi.getAccessToken();
    if (failure === 'transport') fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    else if (failure === 'timeout') fetchMock.mockRejectedValue(new DOMException('Timed out', 'AbortError'));
    else fetchMock.mockResolvedValue(json({ error: 'Try again' }, Number(failure)));
    mount();
    await act(async () => {});
    expect(latest.user).toEqual(profile);
    expect(latest.isAuthenticated).toBe(true);
    expect(latest.isLoading).toBe(false);
    await expectPendingPreserved(token);
  });

  it.each(['absent', 'mismatched'])('requires connected recovery with %s cache while retaining credentials/data', async scenario => {
    seed(scenario === 'mismatched' ? 'parent-b' : profile.id, undefined, scenario !== 'absent');
    const token = authApi.getAccessToken();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mount();
    expect(latest.user).toBeNull();
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.isLoading).toBe(false);
    expect(latest.recoveryMessage).toContain('Connect once');
    await expectPendingPreserved(token);
  });

  it('finishes loading without a cache after an online transport failure and recovers on online event', async () => {
    seed(profile.id, undefined, false);
    fetchMock.mockRejectedValueOnce(new TypeError('Network down'));
    const token = authApi.getAccessToken();
    mount();
    await waitFor(() => expect(latest.isLoading).toBe(false));
    expect(latest.user).toBeNull();
    expect(latest.recoveryMessage).toContain('Connect once');
    await expectPendingPreserved(token);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(latest.isAuthenticated).toBe(true));
    expect(latest.recoveryMessage).toBeNull();
    expect(authApi.getCachedProfile()).toEqual(profile);
    await expectPendingPreserved(token);
  });

  it('bounds loading with no cache when the online fetch never resolves', async () => {
    seed(profile.id, undefined, false);
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));
    mount();
    expect(latest.isLoading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.recoveryMessage).toContain('Connect once');
    expect(db.clearAllData).not.toHaveBeenCalled();
  });

  it('finishes recoverable loading when headers arrive but the profile response body stalls', async () => {
    seed(profile.id, undefined, false);
    vi.useFakeTimers();
    vi.spyOn(Response.prototype, 'json').mockImplementationOnce(() => new Promise(() => {}));
    mount();
    expect(latest.isLoading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.recoveryMessage).toContain('Connect once');
    expect(authApi.getAccessToken()).not.toBeNull();
    expect(localStorage.getItem('refresh_token')).not.toBeNull();
    expect(db.clearAllData).not.toHaveBeenCalled();
  });
});

describe('coupled expiry, recovery and rejection transitions', () => {
  it.each(['transport', 500, 429])('initial 401 then refresh %s preserves ready local identity', async failure => {
    seed();
    const token = authApi.getAccessToken();
    fetchMock.mockResolvedValueOnce(json({ error: 'Token expired' }, 401));
    if (failure === 'transport') fetchMock.mockRejectedValueOnce(new TypeError('No signal'));
    else fetchMock.mockResolvedValueOnce(json({ error: 'Try later' }, Number(failure)));
    mount();
    await act(async () => {});
    expect(latest.isAuthenticated).toBe(true);
    expect(latest.user).toEqual(profile);
    await expectPendingPreserved(token);
  });

  it.each([401, 403])('initial 401 then definitive refresh %s clears records/identity', async status => {
    seed();
    fetchMock.mockResolvedValueOnce(json({ error: 'Token expired' }, 401))
      .mockResolvedValueOnce(json({ error: 'Invalid credentials' }, status));
    mount();
    await waitFor(() => expect(latest.isAuthenticated).toBe(false));
    expect(latest.user).toBeNull();
    expect(authApi.getAccessToken()).toBeNull();
    expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    await waitFor(async () => expect(await db.matchState.get('pending-match')).toBeUndefined());
  });

  it('cached local readiness never bypasses a definitive profile 403', async () => {
    seed();
    fetchMock.mockResolvedValue(json({ error: 'Account disabled' }, 403));
    mount();
    expect(latest.isAuthenticated).toBe(true);
    await waitFor(() => expect(latest.isAuthenticated).toBe(false));
    expect(db.clearAllData).toHaveBeenCalledTimes(1);
    expect(authApi.getCachedProfile()).toBeNull();
  });

  it('expired credentials while offline use bounded timers then revalidate on recovery', async () => {
    seed(profile.id, Date.now() / 1000 - 10);
    const token = authApi.getAccessToken();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.useFakeTimers();
    const rendered = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latest.isAuthenticated).toBe(true);
    expect(authApi.getAccessToken()).toBe(token);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2);
    const recovered = jwt(profile.id, Date.now() / 1000 + 600);
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh') ?
      json({ access_token: recovered, refresh_token: 'recovered-refresh' }) : json({ success: true, data: profile })));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await vi.waitFor(() => expect(authApi.getAccessToken()).toBe(recovered));
    expect(latest.isAuthenticated).toBe(true);
    expect(db.clearAllData).not.toHaveBeenCalled();
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    expect(await db.matchState.get('pending-match')).toMatchObject({ synced: false });
  });

  it('expiry during an in-flight refresh followed by lost signal keeps identity/tokens and retries on recovery', async () => {
    seed(profile.id, Date.now() / 1000 + 5);
    const token = authApi.getAccessToken();
    const pending = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.endsWith('/auth/refresh') ? pending.promise :
      Promise.resolve(json({ success: true, data: profile })));
    vi.useFakeTimers();
    mount();
    await act(async () => {});
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/refresh'))).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); pending.reject(new TypeError('Lost signal')); });
    expect(latest.isAuthenticated).toBe(true);
    expect(authApi.getAccessToken()).toBe(token);
    expect(db.clearAllData).not.toHaveBeenCalled();
    const count = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetchMock).toHaveBeenCalledTimes(count);
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh') ?
      json({ access_token: jwt(), refresh_token: 'recovered' }) : json({ success: true, data: profile })));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await vi.waitFor(() => expect(localStorage.getItem('refresh_token')).toBe('recovered'));
    expect(latest.isAuthenticated).toBe(true);
  });

  it('retries transient proactive refresh on a bounded interval even when the online flag remains true', async () => {
    seed(profile.id, Date.now() / 1000 - 1);
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(json({ error: 'Temporarily unavailable' }, 503));
    mount();
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latest.isAuthenticated).toBe(true);
    expect(db.clearAllData).not.toHaveBeenCalled();
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/refresh') ?
      json({ access_token: jwt(), refresh_token: 'retry-recovered' }) : json({ success: true, data: profile })));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(localStorage.getItem('refresh_token')).toBe('retry-recovered');
    expect(latest.isAuthenticated).toBe(true);
  });
});

describe('session generation guards', () => {
  it.each(['guest', 'refresh-only'])('explicit logout clears local records exactly once for a %s session', async kind => {
    if (kind === 'refresh-only') localStorage.setItem('refresh_token', 'orphan-refresh');
    mount();
    await act(async () => { await latest.logout(); });
    expect(db.clearAllData).toHaveBeenCalledTimes(1);
    expect(await db.matchState.get('pending-match')).toBeUndefined();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(latest.isAuthenticated).toBe(false);
  });

  it('explicit offline logout clears tokens/cache/pending data before stale initialization finishes', async () => {
    seed();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new TypeError('No signal'));
    mount();
    await act(async () => { await latest.logout(); });
    expect(latest.isAuthenticated).toBe(false);
    expect(await db.matchState.get('pending-match')).toBeUndefined();
    await act(async () => { pending.resolve(json({ success: true, data: profile })); });
    expect(latest.user).toBeNull();
    expect(authApi.getAccessToken()).toBeNull();
    expect(authApi.getCachedProfile()).toBeNull();
    await waitFor(async () => expect(await db.matchState.get('pending-match')).toBeUndefined());
  });

  it.each(['profile', 'refresh'])('pending old-account %s cannot overwrite a newer login', async kind => {
    seed(profile.id, kind === 'refresh' ? Date.now() / 1000 - 1 : undefined);
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    mount();
    const next = { ...profile, id: 'parent-b', email: 'b@example.test' };
    const token = jwt(next.id);
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/login') ?
      json({ access_token: token, refresh_token: 'refresh-b', user: next }) : json({ success: true, data: next })));
    await act(async () => { expect(await latest.login(next.email, 'password')).toEqual({ success: true }); });
    await act(async () => { old.resolve(kind === 'profile' ? json({ success: true, data: profile }) :
      json({ access_token: jwt(), refresh_token: 'stale-refresh' })); });
    expect(latest.user).toEqual(next);
    expect(authApi.getAccessToken()).toBe(token);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-b');
    expect(authApi.getCachedProfile()).toEqual(next);
    expect(db.clearAllData).not.toHaveBeenCalled();
  });

  it('pending proactive refresh cannot restore identity or credentials after logout', async () => {
    seed(profile.id, Date.now() / 1000 + 90);
    const pending = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url.endsWith('/auth/refresh') ? pending.promise :
      Promise.resolve(json({ success: true, data: profile })));
    vi.useFakeTimers();
    const rendered = mount();
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => {
      const logout = latest.logout();
      await vi.advanceTimersByTimeAsync(100);
      await logout;
    });
    await act(async () => { pending.resolve(json({ access_token: jwt(), refresh_token: 'stale-refresh' })); });
    expect(latest.user).toBeNull();
    expect(authApi.getAccessToken()).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules the replacement session even when its expiry matches the old account', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 90;
    seed(profile.id, expiry);
    vi.useFakeTimers();
    mount();
    await act(async () => {});
    const next = { ...profile, id: 'parent-b' };
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/auth/login') ?
      json({ access_token: jwt(next.id, expiry), refresh_token: 'refresh-b', user: next }) :
      url.endsWith('/auth/refresh') ? json({ access_token: jwt(next.id), refresh_token: 'refreshed-b' }) :
      json({ success: true, data: next })));
    await act(async () => { await latest.login('b@example.test', 'password'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(localStorage.getItem('refresh_token')).toBe('refreshed-b');
    expect(latest.user?.id).toBe(next.id);
  });

  it('unmount removes retry and online listeners while deferred initialization settles', async () => {
    seed();
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    vi.useFakeTimers();
    const rendered = mount();
    rendered.unmount();
    const count = fetchMock.mock.calls.length;
    await act(async () => { pending.resolve(json({ success: true, data: profile })); });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchMock).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
});
