import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from '../../../src/services/api/baseApi';
import { OFFLINE_IDENTITY_KEY } from '../../../src/services/api/authOfflineIdentity';

const jwt = (subject = 'parent-a', exp = Math.floor(Date.now() / 1000) + 600) =>
  `header.${btoa(JSON.stringify({ sub: subject, exp }))}.signature`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

let client: ApiClient;
let fetchMock: ReturnType<typeof vi.fn>;
let unauthorized: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  client = new ApiClient('https://example.test/api');
  client.setToken(jwt());
  localStorage.setItem('refresh_token', 'refresh-secret-a');
  localStorage.setItem(OFFLINE_IDENTITY_KEY, 'persisted-confirmed-profile');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  unauthorized = vi.fn();
  window.addEventListener('auth:unauthorized', unauthorized);
});
afterEach(() => {
  window.removeEventListener('auth:unauthorized', unauthorized);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const preserved = (token: string | null) => {
  expect(client.getToken()).toBe(token);
  expect(localStorage.getItem('refresh_token')).toBe('refresh-secret-a');
  expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBe('persisted-confirmed-profile');
  expect(unauthorized).not.toHaveBeenCalled();
};

describe('session refresh and remote authorization', () => {
  it.each(['transport', 'timeout', 500, 503, 429])('retains the session after initial 401 then refresh %s', async failure => {
    const token = client.getToken();
    fetchMock.mockResolvedValueOnce(json({ error: 'Token expired' }, 401));
    if (failure === 'transport') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else if (failure === 'timeout') fetchMock.mockRejectedValueOnce(new DOMException('Timed out', 'AbortError'));
    else fetchMock.mockResolvedValueOnce(json({ error: 'Try later' }, Number(failure)));
    const request = client.get('/auth/profile');
    await expect(request).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    preserved(token);
  });

  it.each([401, 403])('invalid refresh credentials (%s) definitively end the session', async status => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Token expired' }, 401))
      .mockResolvedValueOnce(json({ error: 'Invalid refresh credentials' }, status));
    await expect(client.get('/auth/profile')).rejects.toMatchObject({ status });
    expect(client.getToken()).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('retries once with refreshed credentials and cannot authorize a rejected request', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Expired' }, 401))
      .mockResolvedValueOnce(json({ success: true, data: { access_token: jwt(), refresh_token: 'new-refresh' } }))
      .mockResolvedValueOnce(json({ error: 'Still rejected' }, 401));
    await expect(client.get('/auth/profile')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(client.getToken()).toBeNull();
  });

  it('recovers normally after a transient refresh failure', async () => {
    const newToken = jwt('parent-a', Math.floor(Date.now() / 1000) + 1200);
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockRejectedValueOnce(new TypeError('No signal'));
    await expect(client.get('/auth/profile')).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: newToken, refresh_token: 'new-refresh' }))
      .mockResolvedValueOnce(json({ success: true, data: { id: 'parent-a' } }));
    await expect(client.get('/auth/profile')).resolves.toMatchObject({ success: true });
    expect(client.getToken()).toBe(newToken);
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('does not confuse a resource permission denial with account rejection', async () => {
    const token = client.getToken();
    fetchMock.mockResolvedValue(json({ error: 'Team not yours' }, 403));
    await expect(client.get('/teams/other')).rejects.toMatchObject({ status: 403 });
    preserved(token);
  });

  it.each([401, 403])('profile rejection %s without refresh retains remote rejection security', async status => {
    localStorage.removeItem('refresh_token');
    fetchMock.mockResolvedValue(json({ error: 'Rejected' }, status));
    await expect(client.get('/auth/profile')).rejects.toMatchObject({ status });
    expect(client.getToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent refresh requests within the session', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const first = client.refreshSession();
    const second = client.refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(json({ access_token: jwt(), refresh_token: 'new-refresh' }));
    await Promise.all([first, second]);
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
  });

  it.each(['logout', 'replacement'])('a deferred refresh cannot overwrite credentials after %s', async action => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const result = client.refreshSession();
    const assertion = expect(result).rejects.toThrow('session changed');
    if (action === 'logout') client.clearSession();
    else {
      client.setToken(jwt('parent-b'));
      localStorage.setItem('refresh_token', 'refresh-b');
      localStorage.setItem(OFFLINE_IDENTITY_KEY, 'cache-b');
    }
    const expected = client.getToken();
    pending.resolve(json({ access_token: jwt('parent-a'), refresh_token: 'stale-refresh' }));
    await assertion;
    expect(client.getToken()).toBe(expected);
    expect(localStorage.getItem('refresh_token')).toBe(action === 'logout' ? null : 'refresh-b');
    expect(localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBe(action === 'logout' ? null : 'cache-b');
  });

  it('a deferred old account 401 cannot clear the replacement account', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const result = client.get('/auth/profile');
    const assertion = expect(result).rejects.toThrow('session changed');
    const newToken = jwt('parent-b');
    client.setToken(newToken);
    localStorage.setItem('refresh_token', 'refresh-b');
    pending.resolve(json({ error: 'Old account rejected' }, 401));
    await assertion;
    expect(client.getToken()).toBe(newToken);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-b');
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('a malformed or across-account refresh response does not invent credentials', async () => {
    const token = client.getToken();
    fetchMock.mockResolvedValue(json({ access_token: jwt('parent-b'), refresh_token: 'refresh-b' }));
    await expect(client.refreshSession()).rejects.toMatchObject({ code: 'INVALID_REFRESH_RESPONSE' });
    preserved(token);
  });

  it('bounds a hanging online fetch without invalidating persisted auth', async () => {
    vi.useFakeTimers();
    const token = client.getToken();
    fetchMock.mockReturnValue(new Promise(() => {}));
    const request = client.get('/auth/profile');
    const assertion = expect(request).rejects.toBeInstanceOf(ApiRequestError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    preserved(token);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled refresh response body and releases it for connected retry', async () => {
    vi.useFakeTimers();
    const token = client.getToken();
    vi.spyOn(Response.prototype, 'json').mockImplementationOnce(() => new Promise(() => {}));
    fetchMock.mockResolvedValue(json({ access_token: jwt(), refresh_token: 'new-refresh' }));
    const request = client.refreshSession();
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    preserved(token);
    await expect(client.refreshSession()).resolves.toMatchObject({ success: true });
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('safe diagnostics', () => {
  it('never prints passwords, access or refresh tokens from auth request/response payloads', async () => {
    localStorage.setItem('DEBUG_API', '1');
    const token = jwt();
    const secrets = ['login-password-secret', 'register-password-secret', 'refresh-secret-a', token, 'refresh-response-secret'];
    fetchMock.mockResolvedValue(json({ access_token: token, refresh_token: 'refresh-response-secret' }));
    await client.post('/auth/login', { password: secrets[0] });
    await client.post('/auth/register', { password: secrets[1] });
    await client.refreshSession();
    const output = JSON.stringify(vi.mocked(console.debug).mock.calls);
    secrets.forEach(secret => expect(output).not.toContain(secret));
    expect(output).toContain('Request');
    expect(output).toContain('status');
    expect(output).not.toContain('body');
    expect(output).not.toContain('Authorization');
  });
});
