import apiClient from './baseApi';
import { authApi } from './authApi';
import { canChangeFormation } from '../../utils/guestQuota';
import { getGuestId, isGuest } from '../../utils/guest';

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
    const prev = formationCache.get(matchId);
    const notes = JSON.stringify({ reason: reason || null, formation, prevFormation: prev || null });

    // Guest mode: enforce quota and record local event
    if (!authApi.isAuthenticated()) {
      const q = await canChangeFormation(matchId);
      if (!q.ok) throw new Error(q.reason);
      try {
        const { db } = await import('../../db/indexedDB');
        await db.addEvent({
          kind: 'formation_change',
          match_id: matchId,
          minute: Math.max(0, Math.floor(startMin || 0)),
          second: 0,
          data: { notes },
          created: Date.now(),
          created_by_user_id: getGuestId(),
        });
      } catch (e) { /* ignore db errors */ }
      formationCache.set(matchId, formation);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { success: true, data: { local: true } } as any;
    }

    // Authenticated path, with offline fallback
    try {
      const resp = await apiClient.post(`/matches/${matchId}/formation-changes`, { startMin, formation, reason });
      formationCache.set(matchId, formation);
      return resp.data as any;
    } catch (e) {
      // Offline fallback: record formation_change in outbox
      try {
        const { db } = await import('../../db/indexedDB');
        await db.addEvent({
          kind: 'formation_change',
          match_id: matchId,
          minute: Math.max(0, Math.floor(startMin || 0)),
          second: 0,
          data: { notes },
          created: Date.now(),
          created_by_user_id: 'offline',
        });
      } catch {}
      formationCache.set(matchId, formation);
      return { success: true, data: { local: true } } as any;
    }
  }
};

export default formationsApi;
