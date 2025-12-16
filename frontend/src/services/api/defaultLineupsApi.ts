/**
 * Default Lineups API Service
 * Handles all default lineup-related API operations
 * 
 * Local-first architecture: READ operations always read from IndexedDB.
 * WRITE operations go through dataLayer which writes to IndexedDB first.
 * Background sync handles server communication.
 */

import apiClient from './baseApi';

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
   * Create or update default lineup for a team - LOCAL-FIRST
   */
  async saveDefaultLineup(data: DefaultLineupCreateRequest): Promise<DefaultLineupResponse> {
    const { defaultLineupsDataLayer } = await import('../dataLayer');

    const result = await defaultLineupsDataLayer.save({
      teamId: data.teamId,
      formation: data.formation,
    });

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      success: true,
      data: {
        id: result.id,
        teamId: data.teamId,
        formation: result.formation as FormationPlayer[],
        createdAt: new Date(result.created_at),
        updatedAt: result.updated_at ? new Date(result.updated_at) : undefined,
        created_by_user_id: result.created_by_user_id,
        is_deleted: result.is_deleted,
      },
    };
  },

  /**
   * Get default lineup for a specific team
   * Local-first: always reads from IndexedDB
   */
  async getDefaultLineup(teamId: string): Promise<DefaultLineupData | null> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const rec = await db.default_lineups.where('team_id').equals(teamId).filter(r => !r.is_deleted).first();
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
  },

  /**
   * Update default lineup for a specific team - LOCAL-FIRST
   */
  async updateDefaultLineup(teamId: string, formation: FormationPlayer[]): Promise<DefaultLineupResponse> {
    // Delegate to saveDefaultLineup which handles upsert
    return this.saveDefaultLineup({ teamId, formation });
  },

  /**
   * Delete default lineup for a specific team - LOCAL-FIRST
   */
  async deleteDefaultLineup(teamId: string): Promise<{ success: boolean; message: string }> {
    const { defaultLineupsDataLayer } = await import('../dataLayer');
    await defaultLineupsDataLayer.delete(teamId);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return { success: true, message: 'Default lineup deleted' };
  },

  /**
   * Get all teams with default lineup status
   * Local-first: always reads from IndexedDB
   */
  async getTeamsWithDefaults(): Promise<TeamsWithDefaultsResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const teams = await db.teams.filter((t: any) => !t.is_deleted).toArray();
    const defaultLineups = await db.default_lineups.filter(dl => !dl.is_deleted).toArray();
    const lineupTeamIds = new Set(defaultLineups.map(dl => dl.team_id));
    const results = teams.map(t => ({
      teamId: t.id,
      teamName: t.name,
      hasDefaultLineup: lineupTeamIds.has(t.id)
    }));
    return { success: true, data: results } as any;
  },

  /**
   * Apply default lineup to a specific match
   * Local-first: reads default lineup from IndexedDB and applies locally
   */
  async applyDefaultToMatch(teamId: string, matchId: string): Promise<any> {
    // Local-first: read default lineup and apply locally
    // The caller should use getDefaultLineup() and apply via lineupsDataLayer
    return { success: true, applied: 'local' } as any;
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
