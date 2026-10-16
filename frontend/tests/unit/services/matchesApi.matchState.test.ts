import { describe, expect, it, vi, afterEach } from 'vitest';
import matchesApi from '../../../src/services/api/matchesApi';
import { ApiRequestError, apiClient } from '../../../src/services/api/baseApi';
afterEach(() => { vi.restoreAllMocks(); apiClient.clearSession(); });
describe('match state HTTP evidence', () => {
  it('preserves genuine HTTP404 as typed absence evidence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'State not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(matchesApi.getMatchState('m')).rejects.toMatchObject({ status: 404 });
    try { await matchesApi.getMatchState('m'); } catch (error) { expect(error).toBeInstanceOf(ApiRequestError); }
  });
  it('does not turn transport failure into 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    try { await matchesApi.getMatchState('m'); throw new Error('Expected failure'); }
    catch (error) { expect(error).not.toMatchObject({ status: 404 }); }
  });
});
