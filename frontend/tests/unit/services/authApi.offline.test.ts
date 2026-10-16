import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, type UserProfile } from '../../../src/services/api/authApi';
import { apiClient } from '../../../src/services/api/baseApi';
import { OFFLINE_IDENTITY_KEY, readTokenClaims } from '../../../src/services/api/authOfflineIdentity';

const profile: UserProfile = {
  id: 'parent-a', email: 'parent@example.test', first_name: 'Parent', last_name: null,
  role: 'USER', email_verified: true, created_at: '2026-01-01', updated_at: '2026-01-02',
};
const jwt = (id = profile.id, extra = {}) => `header.${btoa(JSON.stringify({ userId: id, exp: Date.now() / 1000 + 600, ...extra }))}.signature`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const fixture = () => localStorage.setItem(OFFLINE_IDENTITY_KEY,
  JSON.stringify({ version: 1, subject: profile.id, profile }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  apiClient.clearSession();
  localStorage.clear();
  apiClient.setToken(jwt());
  localStorage.setItem('refresh_token', 'refresh-a');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  apiClient.clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('server-confirmed offline profile', () => {
  it('caches an actual successful server profile and binds it to the JWT account', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: profile }));
    await authApi.getProfile();
    expect(authApi.getCachedProfile()).toEqual(profile);
    expect(JSON.parse(localStorage.getItem(OFFLINE_IDENTITY_KEY)!)).toMatchObject({ version: 1, subject: profile.id });
    apiClient.setToken(jwt('parent-b'));
    expect(authApi.getCachedProfile()).toBeNull();
  });

  it('supports standard sub and the existing server userId while rejecting conflicting claims', () => {
    expect(readTokenClaims(jwt()).subject).toBe(profile.id);
    expect(readTokenClaims(jwt(profile.id, { sub: profile.id })).subject).toBe(profile.id);
    expect(readTokenClaims(jwt(profile.id, { sub: 'other' })).subject).toBeNull();
  });

  it.each(['absent', 'mismatched-subject', 'mismatched-profile', 'malformed', 'incomplete', 'invalid-token', 'unsupported-version'])('rejects %s persisted identity evidence', scenario => {
    fixture();
    if (scenario === 'absent') localStorage.removeItem(OFFLINE_IDENTITY_KEY);
    if (scenario === 'mismatched-subject') localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: 'parent-b', profile }));
    if (scenario === 'mismatched-profile') localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: profile.id, profile: { ...profile, id: 'parent-b' } }));
    if (scenario === 'malformed') localStorage.setItem(OFFLINE_IDENTITY_KEY, '{broken');
    if (scenario === 'incomplete') localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: profile.id, profile: { id: profile.id } }));
    if (scenario === 'invalid-token') apiClient.setToken('invalid-token');
    if (scenario === 'unsupported-version') localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 99, subject: profile.id, profile }));
    expect(authApi.getCachedProfile()).toBeNull();
    expect(authApi.getAccessToken()).not.toBeNull();
  });

  it('does not cache an across-account server profile', async () => {
    fetchMock.mockResolvedValue(json({ success: true, data: { ...profile, id: 'parent-b' } }));
    await expect(authApi.getProfile()).rejects.toThrow();
    expect(authApi.getCachedProfile()).toBeNull();
  });

  it('retains a persisted fixture when storage temporarily cannot be written', async () => {
    fixture();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    fetchMock.mockResolvedValue(json({ success: true, data: profile }));
    await expect(authApi.getProfile()).resolves.toMatchObject({ success: true });
    expect(authApi.getCachedProfile()).toEqual(profile);
  });
});

describe('refresh and session lifecycle', () => {
  it.each(['offline', 'transport', 500, 429, 'malformed'])('attempt refresh %s retains tokens/cache and reports false', async failure => {
    fixture();
    const token = authApi.getAccessToken();
    if (failure === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    else if (failure === 'transport') fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    else if (failure === 'malformed') fetchMock.mockResolvedValue(json({ success: true, data: {} }));
    else fetchMock.mockResolvedValue(json({ error: 'Try later' }, Number(failure)));
    expect(await authApi.attemptTokenRefresh()).toBe(false);
    expect(authApi.getAccessToken()).toBe(token);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-a');
    expect(authApi.getCachedProfile()).toEqual(profile);
    if (failure === 'offline') expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('definitive refresh rejection %s clears cached identity and tokens', async status => {
    fixture();
    fetchMock.mockResolvedValue(json({ error: 'Invalid credentials' }, status));
    expect(await authApi.attemptTokenRefresh()).toBe(false);
    expect(authApi.getAccessToken()).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(authApi.getCachedProfile()).toBeNull();
  });

  it('a pending profile cannot resurrect the cache after explicit logout', async () => {
    fixture();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new TypeError('Offline'));
    const request = authApi.getProfile();
    const assertion = expect(request).rejects.toThrow('session changed');
    await authApi.logout();
    pending.resolve(json({ success: true, data: profile }));
    await assertion;
    expect(authApi.getAccessToken()).toBeNull();
    expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
  });

  it('a pending old profile cannot overwrite a replacement login and its confirmed profile', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const request = authApi.getProfile();
    const assertion = expect(request).rejects.toThrow('session changed');
    const next = { ...profile, id: 'parent-b', email: 'b@example.test' };
    fetchMock.mockResolvedValueOnce(json({ access_token: jwt(next.id), refresh_token: 'refresh-b', user: next }))
      .mockResolvedValueOnce(json({ success: true, data: next }));
    await authApi.login({ email: next.email, password: 'password' });
    await authApi.getProfile();
    const token = authApi.getAccessToken();
    pending.resolve(json({ success: true, data: profile }));
    await assertion;
    expect(authApi.getAccessToken()).toBe(token);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-b');
    expect(authApi.getCachedProfile()).toEqual(next);
  });

  it('a pending login cannot publish tokens after logout or a newer login', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const request = authApi.login({ email: profile.email, password: 'password' });
    const assertion = expect(request).rejects.toThrow('session changed');
    fetchMock.mockResolvedValueOnce(json({ access_token: jwt('parent-b'), refresh_token: 'refresh-b', user: profile }));
    await authApi.login({ email: 'b@example.test', password: 'password' });
    const token = authApi.getAccessToken();
    pending.resolve(json({ access_token: jwt(), refresh_token: 'stale-refresh', user: profile }));
    await assertion;
    expect(authApi.getAccessToken()).toBe(token);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-b');
  });
});
