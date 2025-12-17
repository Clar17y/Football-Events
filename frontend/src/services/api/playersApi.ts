/**
 * Players API Service
 * Handles all player-related API operations with proper error handling and type safety
 * 
 * Local-first architecture: READ operations always read from IndexedDB.
 * WRITE operations go through dataLayer which writes to IndexedDB first.
 * Background sync handles server communication.
 * 
 * Requirements: 3.2 - Create players while offline with synced equals false
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */

import apiClient from './baseApi';
import { authApi } from './authApi';
import { canAddPlayer } from '../../utils/guestQuota';
import { getGuestId } from '../../utils/guest';
import { dbToPlayer, dbToPlayers } from '../../db/transforms';
import type { EnhancedPlayer } from '../../db/schema';
import type {
  Player,
  PlayerCreateRequest,
  PlayerUpdateRequest,
  PaginatedResponse
} from '@shared/types';

// API request/response interfaces
export interface PlayersListParams {
  page?: number;
  limit?: number;
  search?: string;
  teamId?: string; // backward-compatible single team filter
  teamIds?: string[]; // new multi-team filter
  noTeam?: boolean; // filter players without active team
  position?: string;
}

export interface PlayersListResponse extends PaginatedResponse<Player> { }

export interface PlayerResponse {
  data: Player;
  success: boolean;
  message?: string;
}

/**
 * Players API service with full CRUD operations
 */
export const playersApi = {
  /**
   * Get paginated list of user's players with optional search and filtering
   * Local-first: always reads from IndexedDB
   */
  async getPlayers(params: PlayersListParams = {}): Promise<PlayersListResponse> {
    const { page = 1, limit = 25, search, teamId, teamIds, noTeam, position } = params;

    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    let rows = await db.players.toArray();
    // Filter non-deleted
    rows = rows.filter((p: any) => p && !p.isDeleted);
    
    // Filter by team assignment using player_teams junction table
    if (teamIds && teamIds.length > 0) {
      // Get player IDs that belong to any of the specified teams
      const playerTeamRelations = await db.player_teams
        .filter((pt: any) => !pt.isDeleted && pt.isActive !== false && teamIds.includes(pt.teamId))
        .toArray();
      const playerIdsInTeams = new Set(playerTeamRelations.map((pt: any) => pt.playerId));
      rows = rows.filter((p: any) => playerIdsInTeams.has(p.id));
    } else if (teamId) {
      // Get player IDs that belong to the specified team
      const playerTeamRelations = await db.player_teams
        .where('teamId')
        .equals(teamId)
        .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
        .toArray();
      const playerIdsInTeam = new Set(playerTeamRelations.map((pt: any) => pt.playerId));
      rows = rows.filter((p: any) => playerIdsInTeam.has(p.id));
    } else if (noTeam) {
      // Get all player IDs that have any active team relationship
      const allPlayerTeamRelations = await db.player_teams
        .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
        .toArray();
      const playerIdsWithTeams = new Set(allPlayerTeamRelations.map((pt: any) => pt.playerId));
      rows = rows.filter((p: any) => !playerIdsWithTeams.has(p.id));
    }
    
    // Filter by search text
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((p: any) => (p.fullName || '').toLowerCase().includes(term));
    }
    // Filter by position
    if (position) {
      rows = rows.filter((p: any) => (p.preferredPos || '') === position);
    }
    // Sort by name
    rows.sort((a: any, b: any) => (a.fullName || '').localeCompare(b.fullName || ''));
    // Paginate
    const total = rows.length;
    const start = (page - 1) * limit;
    const paged = rows.slice(start, start + limit);
    const data = dbToPlayers(paged as EnhancedPlayer[]);
    return {
      data,
      total,
      page,
      limit,
      hasMore: start + limit < total
    } as PlayersListResponse;
  },

  /**
   * Get a specific player by ID
   * Local-first: always reads from IndexedDB
   */
  async getPlayerById(id: string): Promise<PlayerResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const player = await db.players.get(id);
    if (!player || player.isDeleted) {
      throw new Error('Player not found');
    }
    return {
      data: dbToPlayer(player as EnhancedPlayer),
      success: true
    };
  },

  /**
   * Create a new player - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first via dataLayer. Background sync handles server communication.
   */
  async createPlayer(playerData: PlayerCreateRequest): Promise<PlayerResponse> {
    // Import dataLayer and create player locally
    const { playersDataLayer } = await import('../dataLayer');

    const player = await playersDataLayer.create({
      name: playerData.name,
      squadNumber: playerData.squadNumber,
      preferredPosition: playerData.preferredPosition,
      dateOfBirth: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
      notes: playerData.notes,
      teamId: (playerData as any).teamId,
    });

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: {
        id: player.id,
        name: player.fullName,
        squadNumber: player.squadNumber,
        preferredPosition: player.preferredPos,
        dateOfBirth: player.dob ? new Date(player.dob) : undefined,
        notes: player.notes,
        currentTeam: player.currentTeam,
      } as any,
      success: true,
      message: 'Player created'
    };
  },

  /**
   * Update an existing player - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first via dataLayer. Background sync handles server communication.
   */
  async updatePlayer(id: string, playerData: PlayerUpdateRequest): Promise<PlayerResponse> {
    const { playersDataLayer } = await import('../dataLayer');
    const { db } = await import('../../db/indexedDB');

    await playersDataLayer.update(id, {
      name: playerData.name,
      squadNumber: playerData.squadNumber,
      preferredPosition: playerData.preferredPosition,
      dateOfBirth: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
      notes: playerData.notes,
    });

    const updated = await db.players.get(id);
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: {
        id,
        name: updated?.fullName || playerData.name,
        squadNumber: updated?.squadNumber,
        preferredPosition: updated?.preferredPos,
        dateOfBirth: updated?.dob ? new Date(updated.dob) : undefined,
        notes: updated?.notes,
        currentTeam: updated?.currentTeam,
      } as any,
      success: true,
      message: 'Player updated'
    };
  },

  /**
   * Update an existing player with team changes - LOCAL-FIRST
   */
  async updatePlayerWithTeams(id: string, playerData: PlayerUpdateRequest & { teamIds: string[], currentTeam?: string }): Promise<PlayerResponse> {
    const { playersDataLayer } = await import('../dataLayer');
    const { db } = await import('../../db/indexedDB');
    const { authApi: auth } = await import('./authApi');

    // Resolve team names from IDs if currentTeam not provided
    let currentTeamNames = playerData.currentTeam;
    const teamIds = playerData.teamIds || [];
    if (!currentTeamNames && teamIds.length > 0) {
      const teams = await db.teams.where('id').anyOf(teamIds).toArray();
      currentTeamNames = teams.map(t => t.name).filter(Boolean).join(', ');
    }

    // Update player basic fields
    await playersDataLayer.update(id, {
      name: playerData.name,
      squadNumber: playerData.squadNumber,
      preferredPosition: playerData.preferredPosition,
      dateOfBirth: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
      notes: playerData.notes,
    });

    // Update currentTeam with the resolved team names
    if (currentTeamNames !== undefined) {
      await db.players.update(id, { currentTeam: currentTeamNames, synced: false, updatedAt: Date.now() } as any);
    }

    // Manage player_teams junction table records
    const now = Date.now();
    const currentUser = auth.isAuthenticated() ? await auth.getCurrentUser().catch(() => null) : null;
    const userId = currentUser?.data?.id || getGuestId();
    const startDate = new Date();

    // Get existing player-team relationships (cast to any to access stored fields)
    const existingRelations = await db.player_teams
      .filter((pt: any) => pt.playerId === id && !pt.isDeleted && !pt.is_deleted)
      .toArray();

    // Deactivate relationships for teams no longer in the list
    for (const relation of existingRelations) {
      if (!teamIds.includes(relation.teamId)) {
        await db.player_teams.update(relation.id, {
          endDate: startDate,
          updatedAt: new Date(),
        } as any);
      }
    }

    // Add or reactivate relationships for new teams
    for (const teamId of teamIds) {
      const existing = existingRelations.find((pt: any) => pt.teamId === teamId);
      if (existing) {
        // Reactivate if it was deactivated (has endDate)
        if ((existing as any).endDate) {
          await db.player_teams.update(existing.id, {
            endDate: undefined,
            updatedAt: new Date(),
          } as any);
        }
      } else {
        // Create new relationship
        const ptId = crypto?.randomUUID ? crypto.randomUUID() : `pt-${now}-${Math.random().toString(36).slice(2)}`;
        await db.player_teams.put({
          id: ptId,
          playerId: id,
          teamId: teamId,
          startDate: startDate,
          createdAt: new Date(),
          updatedAt: new Date(),
          created_by_user_id: userId,
          is_deleted: false,
        } as any);
      }
    }

    const updated = await db.players.get(id);
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: {
        id,
        name: updated?.fullName || playerData.name,
        squadNumber: updated?.squadNumber,
        preferredPosition: updated?.preferredPos,
        currentTeam: updated?.currentTeam,
      } as any,
      success: true,
      message: 'Player updated'
    };
  },

  /**
   * Delete a player (soft delete) - LOCAL-FIRST
   */
  async deletePlayer(id: string): Promise<{ success: boolean; message: string }> {
    const { playersDataLayer } = await import('../dataLayer');
    await playersDataLayer.delete(id);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return { success: true, message: 'Player deleted' };
  },

  /**
   * Get players by team ID
   * Local-first: always reads from IndexedDB via player_teams junction table
   */
  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    
    // Get active player-team relationships for this team
    const playerTeamRelations = await db.player_teams
      .where('teamId')
      .equals(teamId)
      .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
      .toArray();
    
    // Get the player IDs from the relationships
    const playerIds = playerTeamRelations.map((pt: any) => pt.playerId);
    
    // Fetch the actual player records
    const players = await db.players
      .where('id')
      .anyOf(playerIds)
      .filter((p: any) => !p.isDeleted)
      .toArray();
    
    return dbToPlayers(players as EnhancedPlayer[]);
  },

  /**
   * Get player statistics
   * Local-first: computes stats from local IndexedDB data
   */
  async getPlayerStats(playerId: string, seasonId?: string): Promise<any> {
    // Local-first: compute stats from local data
    const { db } = await import('../../db/indexedDB');
    
    // Get events for this player
    let events = await db.events
      .where('playerId')
      .equals(playerId)
      .filter((e: any) => !e.isDeleted)
      .toArray();
    
    // Filter by season if provided
    if (seasonId) {
      const matchesInSeason = await db.matches
        .where('seasonId')
        .equals(seasonId)
        .filter((m: any) => !m.isDeleted)
        .toArray();
      const matchIds = new Set(matchesInSeason.map(m => m.id));
      events = events.filter((e: any) => matchIds.has(e.matchId));
    }
    
    // Get lineup entries for this player
    let lineups = await db.lineup
      .where('playerId')
      .equals(playerId)
      .filter((l: any) => !l.isDeleted)
      .toArray();
    
    // Count stats
    const goals = events.filter((e: any) => e.kind === 'goal').length;
    const assists = events.filter((e: any) => e.kind === 'assist').length;
    const yellowCards = events.filter((e: any) => e.kind === 'yellow_card').length;
    const redCards = events.filter((e: any) => e.kind === 'red_card').length;
    const appearances = new Set(lineups.map((l: any) => l.matchId)).size;
    
    // Calculate minutes played from lineups
    let minutesPlayed = 0;
    for (const lineup of lineups) {
      const start = (lineup as any).startMin || 0;
      const end = (lineup as any).endMin || 90; // Default to 90 if not ended
      minutesPlayed += (end - start);
    }
    
    return {
      matches: appearances,
      goals,
      assists,
      yellowCards,
      redCards,
      minutesPlayed,
      appearances
    };
  },

  /**
   * Create a new player with team assignment in one operation
   */
  async createPlayerWithTeam(playerData: PlayerCreateRequest & { teamId: string; startDate?: string }): Promise<PlayerResponse> {
    if (!authApi.isAuthenticated()) {
      const q = await canAddPlayer(playerData.teamId);
      if (!q.ok) throw new Error(q.reason);
      // Local create
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
      await db.players.add({
        id,
        fullName: playerData.name,
        squadNumber: playerData.squadNumber,
        preferredPos: playerData.preferredPosition,
        dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
        notes: playerData.notes,
        currentTeam: playerData.teamId,
        createdAt: now,
        updatedAt: now,
        createdByUserId: getGuestId(),
        isDeleted: false,
        synced: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch { }
      return { data: { id, name: playerData.name } as any, success: true, message: 'Player created locally' };
    }
    const { teamId, startDate = '2024-01-01', ...playerFields } = playerData;
    const requestData = { ...playerFields, teamId, startDate, isActive: true };
    const response = await apiClient.post('/players-with-team', requestData);
    return {
      data: (response.data as any).player as Player,
      success: true,
      message: 'Player created and assigned to team successfully'
    };
  },

  /**
   * Create a new player with multiple team assignments in one operation
   */
  async createPlayerWithTeams(playerData: PlayerCreateRequest & { teamIds: string[]; startDate?: string }): Promise<PlayerResponse> {
    if (!authApi.isAuthenticated()) {
      const firstTeam = playerData.teamIds?.[0];
      if (firstTeam) {
        const q = await canAddPlayer(firstTeam);
        if (!q.ok) throw new Error(q.reason);
      }
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
      await db.players.add({
        id,
        fullName: playerData.name,
        squadNumber: playerData.squadNumber,
        preferredPos: playerData.preferredPosition,
        dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
        notes: playerData.notes,
        currentTeam: firstTeam,
        createdAt: now,
        updatedAt: now,
        createdByUserId: getGuestId(),
        isDeleted: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch { }
      return { data: { id, name: playerData.name } as any, success: true, message: 'Player created locally' };
    }
    const { teamIds, startDate = '2024-01-01', ...playerFields } = playerData;
    const requestData = { ...playerFields, teamIds, startDate, isActive: true };
    const response = await apiClient.post('/players-with-teams', requestData);
    return {
      data: (response.data as any).player as Player,
      success: true,
      message: `Player created and assigned to ${teamIds.length} team${teamIds.length !== 1 ? 's' : ''} successfully`
    };
  }
};

export default playersApi;
