import { buildApiBaseUrl } from '../../utils/protocol';

const baseURL = buildApiBaseUrl();

type QParam = { name: 'view' | 'code'; value: string };

const publicGet = async <T,>(path: string): Promise<T> => {
  const resp = await fetch(`${baseURL}${path}`, { headers: { 'Content-Type': 'application/json' } });
  if (!resp.ok) {
    const ct = resp.headers.get('content-type') || '';
    let body: any = null;
    try { body = ct.includes('application/json') ? await resp.json() : await resp.text(); } catch {}
    const err: any = new Error(body?.error || body?.message || `HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as T;
};

export const viewerApi = {
  async getSummary(matchId: string, q: QParam) {
    return await publicGet<any>(`/matches/${matchId}/summary?${q.name}=${encodeURIComponent(q.value)}`);
  },
  async getPeriods(matchId: string, q: QParam) {
    const data = await publicGet<any>(`/matches/${matchId}/periods-public?${q.name}=${encodeURIComponent(q.value)}`);
    return data?.periods || [];
  },
  async getTimeline(matchId: string, q: QParam) {
    return await publicGet<any>(`/matches/${matchId}/timeline-public?${q.name}=${encodeURIComponent(q.value)}`);
  },
  async getEvents(matchId: string, q: QParam) {
    const data = await publicGet<any>(`/events/match/${matchId}?${q.name}=${encodeURIComponent(q.value)}`);
    return data?.events || data || [];
  },
  openEventSource(matchId: string, q: QParam): EventSource {
    const url = `${baseURL}/matches/${matchId}/stream?${q.name}=${encodeURIComponent(q.value)}`;
    return new EventSource(url);
  },
  async checkToken(matchId: string, q: QParam): Promise<{ ok: boolean; status?: number }> {
    try {
      await publicGet<any>(`/matches/${matchId}/summary?${q.name}=${encodeURIComponent(q.value)}`);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, status: e?.status };
    }
  }
};

export default viewerApi;
