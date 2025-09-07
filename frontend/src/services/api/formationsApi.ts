import apiClient from './baseApi';

export interface FormationPlayerDTO {
  id: string;
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  position: { x: number; y: number };
}

export interface FormationDataDTO { players: FormationPlayerDTO[] }

// Simple in-memory cache keyed by matchId
const formationCache = new Map<string, FormationDataDTO>();
const inflight = new Map<string, Promise<FormationDataDTO | null>>();

export const formationsApi = {
  async getCurrent(matchId: string, opts: { useCache?: boolean } = { useCache: true }): Promise<FormationDataDTO | null> {
    const { useCache = true } = opts;
    if (useCache && formationCache.has(matchId)) return formationCache.get(matchId)!;
    if (inflight.has(matchId)) return inflight.get(matchId)!;
    const p = (async () => {
      try {
        const resp = await apiClient.get<FormationDataDTO>(`/matches/${matchId}/current-formation`);
        const data = (resp.data as any) || null;
        if (data) formationCache.set(matchId, data);
        return data;
      } finally {
        inflight.delete(matchId);
      }
    })();
    inflight.set(matchId, p);
    return p;
  },

  async prefetch(matchId: string): Promise<void> {
    try { await this.getCurrent(matchId, { useCache: true }); } catch {}
  },

  setCached(matchId: string, data: FormationDataDTO) {
    formationCache.set(matchId, data);
  },

  invalidate(matchId: string) {
    formationCache.delete(matchId);
  },

  async applyChange(matchId: string, startMin: number, formation: FormationDataDTO, reason?: string) {
    const resp = await apiClient.post(`/matches/${matchId}/formation-changes`, { startMin, formation, reason });
    // Optimistically update cache with the new formation
    formationCache.set(matchId, formation);
    return resp.data as any;
  }
};

export default formationsApi;
