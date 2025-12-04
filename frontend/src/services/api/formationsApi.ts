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
    // Guests keep formation local; avoid hitting server
    if (!authApi.isAuthenticated()) {
      return useCache && formationCache.has(matchId) ? formationCache.get(matchId)! : null;
    }
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
    try {
      // Guests should not call server; getCurrent will short-circuit
      await this.getCurrent(matchId, { useCache: true });
    } catch {}
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

    // Guest mode: enforce quota and record local event in events table
    if (!authApi.isAuthenticated()) {
      const q = await canChangeFormation(matchId);
      if (!q.ok) throw new Error(q.reason);
      try {
        const { db } = await import('../../db/indexedDB');
        // Use addEventToTable to store in events table (not outbox)
        await db.addEventToTable({
          kind: 'formation_change',
          match_id: matchId,
          team_id: '', // Formation changes are match-level, not team-specific
          minute: Math.max(0, Math.floor(startMin || 0)),
          second: 0,
          notes: notes,
          created_by_user_id: getGuestId(),
        });
      } catch (e) { 
        console.warn('Failed to save formation change:', e);
      }
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
      // Offline fallback: record formation_change in events table
      try {
        const { db } = await import('../../db/indexedDB');
        await db.addEventToTable({
          kind: 'formation_change',
          match_id: matchId,
          team_id: '', // Formation changes are match-level, not team-specific
          minute: Math.max(0, Math.floor(startMin || 0)),
          second: 0,
          notes: notes,
          created_by_user_id: 'offline',
        });
      } catch {}
      formationCache.set(matchId, formation);
      return { success: true, data: { local: true } } as any;
    }
  }
};

export default formationsApi;
