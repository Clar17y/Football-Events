/**
 * Default Lineups API Service
 * Handles all default lineup-related API operations
 */

import apiClient from './baseApi';
import { authApi } from './authApi';

// API request/response interfaces
export interface FormationPlayer {
  playerId: string;
  position: string;
  pitchX: number;
  pitchY: number;
}

export interface DefaultLineupData {
  id: string;
  teamId: string;
  formation: FormationPlayer[];
  createdAt: Date;
  updatedAt?: Date;
  created_by_user_id: string;
  deleted_at?: Date;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

export interface DefaultLineupCreateRequest {
  teamId: string;
  formation: FormationPlayer[];
}

export interface DefaultLineupResponse {
  data: DefaultLineupData;
  success: boolean;
  message?: string;
}

export interface TeamsWithDefaultsResponse {
  data: Array<{
    teamId: string;
    teamName: string;
    hasDefaultLineup: boolean;
  }>;
  success: boolean;
}

/**
 * Default Lineups API service
 */
export const defaultLineupsApi = {
  /**
   * Create or update default lineup for a team
   */
  async saveDefaultLineup(data: DefaultLineupCreateRequest): Promise<DefaultLineupResponse> {
    // Guest fallback: store locally in default_lineups table
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const { getGuestId } = await import('../../utils/guest');
      const now = Date.now();
      const id = `default-lineup-${data.teamId}`;
      
      // Check if exists and update, otherwise create
      const existing = await db.default_lineups.where('team_id').equals(data.teamId).first();
      if (existing) {
        await db.default_lineups.update(existing.id, {
          formation: data.formation,
          updated_at: now,
        });
      } else {
        await db.default_lineups.add({
          id,
          team_id: data.teamId,
          formation: data.formation,
          created_at: now,
          updated_at: now,
          created_by_user_id: getGuestId(),
          is_deleted: false,
          synced: false,
        } as any);
      }
      return { success: true, data: { id, teamId: data.teamId, formation: data.formation as any, createdAt: new Date(), is_deleted: false, created_by_user_id: 'guest' } as any };
    }
    try {
      const response = await apiClient.post('/default-lineups', data);
      return response.data as DefaultLineupResponse;
    } catch (e) {
      // Offline fallback: store locally in default_lineups table
      const { db } = await import('../../db/indexedDB');
      const { addToOutbox } = await import('../../db/utils');
      const now = Date.now();
      const id = `default-lineup-${data.teamId}`;
      
      const existing = await db.default_lineups.where('team_id').equals(data.teamId).first();
      if (existing) {
        await db.default_lineups.update(existing.id, {
          formation: data.formation,
          updated_at: now,
        });
      } else {
        await db.default_lineups.add({
          id,
          team_id: data.teamId,
          formation: data.formation,
          created_at: now,
          updated_at: now,
          created_by_user_id: 'offline',
          is_deleted: false,
          synced: false,
        } as any);
      }
      await addToOutbox('default_lineups', data.teamId, 'UPDATE', { teamId: data.teamId, formation: data.formation } as any, 'offline');
      return { success: true, data: { id, teamId: data.teamId, formation: data.formation as any, createdAt: new Date(), is_deleted: false, created_by_user_id: 'offline' } as any };
    }
  },

  /**
   * Get default lineup for a specific team
   */
  async getDefaultLineup(teamId: string): Promise<DefaultLineupData | null> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const rec = await db.default_lineups.where('team_id').equals(teamId).and(r => !r.is_deleted).first();
      if (!rec) return null;
      return {
        id: rec.id,
        teamId: rec.team_id,
        formation: rec.formation,
        createdAt: new Date(rec.created_at),
        updatedAt: rec.updated_at ? new Date(rec.updated_at) : undefined,
        created_by_user_id: rec.created_by_user_id,
        is_deleted: rec.is_deleted
      } as any;
    }
    try {
      console.log('[defaultLineupsApi] GET default lineup request:', teamId);
      const response = await apiClient.get<DefaultLineupData>(`/default-lineups/${teamId}`);
      console.log('[defaultLineupsApi] GET default lineup response:', response);
      return response.data as DefaultLineupData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No default lineup found
      }
      throw error;
    }
  },

  /**
   * Update default lineup for a specific team
   */
  async updateDefaultLineup(teamId: string, formation: FormationPlayer[]): Promise<DefaultLineupResponse> {
    if (!authApi.isAuthenticated()) {
      // Use saveDefaultLineup which handles create/update
      return this.saveDefaultLineup({ teamId, formation });
    }
    try {
      const response = await apiClient.put(`/default-lineups/${teamId}`, { formation });
      return response.data as DefaultLineupResponse;
    } catch (e) {
      // Offline fallback to default_lineups table
      const { db } = await import('../../db/indexedDB');
      const { addToOutbox } = await import('../../db/utils');
      const now = Date.now();
      
      const existing = await db.default_lineups.where('team_id').equals(teamId).first();
      if (existing) {
        await db.default_lineups.update(existing.id, {
          formation,
          updated_at: now,
        });
      } else {
        const id = `default-lineup-${teamId}`;
        await db.default_lineups.add({
          id,
          team_id: teamId,
          formation,
          created_at: now,
          updated_at: now,
          created_by_user_id: 'offline',
          is_deleted: false,
          synced: false,
        } as any);
      }
      await addToOutbox('default_lineups', teamId, 'UPDATE', { teamId, formation } as any, 'offline');
      return { success: true, data: { id: `default-lineup-${teamId}`, teamId, formation: formation as any, createdAt: new Date(), updatedAt: new Date(), created_by_user_id: 'offline', is_deleted: false } as any };
    }
  },

  /**
   * Delete default lineup for a specific team
   */
  async deleteDefaultLineup(teamId: string): Promise<{ success: boolean; message: string }> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const existing = await db.default_lineups.where('team_id').equals(teamId).first();
      if (existing) {
        await db.default_lineups.update(existing.id, { is_deleted: true, deleted_at: Date.now() });
      }
      return { success: true, message: 'Deleted local default lineup' };
    }
    try {
      const response = await apiClient.delete(`/default-lineups/${teamId}`);
      return response.data as { success: boolean; message: string };
    } catch (e) {
      const { db } = await import('../../db/indexedDB');
      const { addToOutbox } = await import('../../db/utils');
      const existing = await db.default_lineups.where('team_id').equals(teamId).first();
      if (existing) {
        await db.default_lineups.update(existing.id, { is_deleted: true, deleted_at: Date.now() });
      }
      await addToOutbox('default_lineups', teamId, 'DELETE', undefined, 'offline');
      return { success: true, message: 'Deleted local default lineup' };
    }
  },

  /**
   * Get all teams with default lineup status
   */
  async getTeamsWithDefaults(): Promise<TeamsWithDefaultsResponse> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const teams = await db.teams.toArray();
      const defaultLineups = await db.default_lineups.filter(dl => !dl.is_deleted).toArray();
      const lineupTeamIds = new Set(defaultLineups.map(dl => dl.team_id));
      const results = teams.map(t => ({
        teamId: t.id,
        teamName: t.name,
        hasDefaultLineup: lineupTeamIds.has(t.id)
      }));
      return { success: true, data: results } as any;
    }
    const response = await apiClient.get('/default-lineups');
    return response.data as TeamsWithDefaultsResponse;
  },

  /**
   * Apply default lineup to a specific match
   */
  async applyDefaultToMatch(teamId: string, matchId: string): Promise<any> {
    if (!authApi.isAuthenticated()) {
      // In guest mode, nothing to persist server-side; caller should read getDefaultLineup() and apply locally.
      return { success: true, applied: 'local' } as any;
    }
    const response = await apiClient.post(`/default-lineups/${teamId}/apply-to-match`, { matchId });
    return response.data;
  },

  /**
   * Validate formation data without saving
   */
  async validateFormation(formation: FormationPlayer[]): Promise<{ isValid: boolean; errors: string[] }> {
    const response = await apiClient.post('/default-lineups/validate', { formation });
    return (response.data as any).data;
  }
};

export default defaultLineupsApi;
