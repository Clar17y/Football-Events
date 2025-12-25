import apiClient from './baseApi';
import { authApi } from './authApi';
import { canChangeFormation } from '../../utils/guestQuota';
import { db } from '../../db/indexedDB';

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
    } catch { }
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

    // Guest mode: enforce quota
    if (!authApi.isAuthenticated()) {
      const q = await canChangeFormation(matchId);
      if (!q.ok) throw new Error(q.reason);
    }

    // LOCAL-FIRST: create event via dataLayer
    const { eventsDataLayer } = await import('../dataLayer');
    const match = await db.matches.get(matchId);
    if (!match) {
      throw new Error('Match not found');
    }
    const [homeTeam, awayTeam] = await Promise.all([
      db.teams.get(match.homeTeamId),
      db.teams.get(match.awayTeamId)
    ]);
    const formationTeamId =
      (homeTeam && !homeTeam.isOpponent ? homeTeam.id : null) ||
      (awayTeam && !awayTeam.isOpponent ? awayTeam.id : null) ||
      match.homeTeamId;

    await eventsDataLayer.create({
      matchId,
      kind: 'formation_change',
      clockMs: Math.floor((startMin || 0) * 60 * 1000),
      teamId: formationTeamId,
      notes: notes,
    });

    formationCache.set(matchId, formation);
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return { success: true, data: { local: true } } as any;
  }
};

export default formationsApi;
