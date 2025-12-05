/**
 * Lineups API Service
 * Handles match lineup operations (who played when, substitutions, etc.)
 * 
 * Requirements: 3.3 - Offline fallback for lineup operations
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */

import apiClient from './baseApi';
import type { Lineup, LineupCreateRequest, LineupUpdateRequest } from '@shared/types';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import { db } from '../../db/indexedDB';
import type { EnhancedLineup } from '../../db/schema';

export interface LineupBatchRequest {
  create?: LineupCreateRequest[];
  update?: Array<{ id: string; data: LineupUpdateRequest }>;
  delete?: string[];
}

export interface LineupBatchResult {
  created: {
    success: number;
    failed: number;
    items: Lineup[];
  };
  updated: {
    success: number;
    failed: number;
    items: Lineup[];
  };
  deleted: {
    success: number;
    failed: number;
    ids: string[];
  };
}

export interface SubstitutionRequest {
  playerOffId: string;
  playerOnId: string;
  position: string;
  currentTime: number;
  substitutionReason?: string;
}

/**
 * Show offline toast notification
 * Requirements: 4.2 - Show toast when data is saved locally
 */
function showOfflineToast(message: string): void {
  try {
    (window as any).__toastApi?.current?.showInfo?.(message);
  } catch {
    console.log('[lineupsApi] Offline:', message);
  }
}

/**
 * Generate a composite ID for lineup records
 * Format: match_id-player_id-start_min
 */
function generateLineupId(matchId: string, playerId: string, startMin: number): string {
  return `${matchId}-${playerId}-${startMin}`;
}

/**
 * Transform local EnhancedLineup to API Lineup format
 * Requirements: 3.3 - Return transformed local lineup
 */
function transformToApiLineup(localLineup: EnhancedLineup): Lineup {
  return {
    id: localLineup.id,
    matchId: localLineup.match_id,
    playerId: localLineup.player_id,
    startMinute: localLineup.start_min,
    endMinute: localLineup.end_min,
    position: localLineup.position,
    createdAt: new Date(localLineup.created_at),
    updatedAt: localLineup.updated_at ? new Date(localLineup.updated_at) : undefined,
    created_by_user_id: localLineup.created_by_user_id,
    deleted_at: localLineup.deleted_at ? new Date(localLineup.deleted_at) : undefined,
    deleted_by_user_id: localLineup.deleted_by_user_id,
    is_deleted: localLineup.is_deleted,
  };
}

export const lineupsApi = {
  /**
   * Get lineups for a specific match
   */
  async getByMatch(matchId: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/match/${matchId}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineups for a specific player
   */
  async getByPlayer(playerId: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/player/${playerId}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineups for a specific position
   */
  async getByPosition(position: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/position/${position}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineup by ID
   */
  async getById(id: string): Promise<Lineup> {
    const response = await apiClient.get<Lineup>(`/lineups/${id}`);
    return response.data as unknown as Lineup;
  },

  /**
   * Get lineup by composite key (matchId, playerId, startMinute)
   */
  async getByKey(matchId: string, playerId: string, startMinute: number): Promise<Lineup> {
    const response = await apiClient.get<Lineup>(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`);
    return response.data as unknown as Lineup;
  },

  /**
   * Get current lineup for a match at a specific time
   */
  async getCurrentLineup(matchId: string, currentTime?: number): Promise<Lineup[]> {
    const params = new URLSearchParams();
    if (currentTime !== undefined) {
      params.append('currentTime', currentTime.toString());
    }
    const url = `/lineups/match/${matchId}/current${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get<Lineup[]>(url);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get active players at a specific time in a match
   */
  async getActivePlayersAtTime(matchId: string, timeMinutes: number): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/match/${matchId}/active-at/${timeMinutes}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Create a new lineup entry with offline fallback
   * 
   * Requirements: 3.3 - Write to local lineup table with synced equals false when offline
   * Requirements: 5.1 - Use authenticated user ID for created_by_user_id
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async create(lineup: LineupCreateRequest): Promise<Lineup> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<Lineup>('/lineups', lineup);
        return response.data as unknown as Lineup;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: write to local lineup table
    const now = Date.now();
    const startMin = lineup.startMinute ?? 0;
    const lineupId = generateLineupId(lineup.matchId, lineup.playerId, startMin);
    const userId = getCurrentUserId();

    const localLineup: EnhancedLineup = {
      id: lineupId,
      match_id: lineup.matchId,
      player_id: lineup.playerId,
      start_min: startMin,
      end_min: lineup.endMinute,
      position: lineup.position,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    };

    await db.lineup.add(localLineup);
    showOfflineToast('Lineup saved locally - will sync when online');

    return transformToApiLineup(localLineup);
  },

  /**
   * Update a lineup by ID with offline fallback
   * 
   * Requirements: 3.3 - Update local lineup record if exists when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async update(id: string, data: LineupUpdateRequest): Promise<Lineup> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.put<Lineup>(`/lineups/${id}`, data);
        return response.data as unknown as Lineup;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local record
    const existingLineup = await db.lineup.get(id);
    if (!existingLineup) {
      throw new Error(`Lineup ${id} not found in local storage`);
    }

    const now = Date.now();
    const updates: Partial<EnhancedLineup> = {
      updated_at: now,
      synced: false,
    };

    // Map API fields to local schema fields
    if (data.startMinute !== undefined) updates.start_min = data.startMinute;
    if (data.endMinute !== undefined) updates.end_min = data.endMinute;
    if (data.position !== undefined) updates.position = data.position;

    await db.lineup.update(id, updates);
    showOfflineToast('Lineup updated locally - will sync when online');

    const updatedLineup = await db.lineup.get(id);
    if (!updatedLineup) {
      throw new Error(`Failed to retrieve updated lineup ${id}`);
    }

    return transformToApiLineup(updatedLineup);
  },

  /**
   * Update lineup by composite key (with upsert capability)
   */
  async updateByKey(matchId: string, playerId: string, startMinute: number, data: LineupUpdateRequest): Promise<Lineup> {
    const response = await apiClient.put<Lineup>(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`, data);
    return response.data as unknown as Lineup;
  },

  /**
   * Delete a lineup by ID with offline fallback
   * 
   * Requirements: 3.3 - Mark local lineup record as deleted (soft delete) when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async delete(id: string): Promise<void> {
    // Try server first if online
    if (isOnline()) {
      try {
        await apiClient.delete(`/lineups/${id}`);
        return;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: mark local record as deleted (soft delete)
    const existingLineup = await db.lineup.get(id);
    if (!existingLineup) {
      // Lineup doesn't exist locally - nothing to delete
      return;
    }

    const now = Date.now();
    const userId = getCurrentUserId();

    await db.lineup.update(id, {
      is_deleted: true,
      deleted_at: now,
      deleted_by_user_id: userId,
      updated_at: now,
      synced: false,
    });

    showOfflineToast('Lineup deleted locally - will sync when online');
  },

  /**
   * Delete lineup by composite key
   */
  async deleteByKey(matchId: string, playerId: string, startMinute: number): Promise<void> {
    await apiClient.delete(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`);
  },

  /**
   * Batch operations for lineups with offline fallback
   * 
   * Requirements: 3.3 - Process batch create/update/delete operations locally when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async batch(operations: LineupBatchRequest): Promise<LineupBatchResult> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<LineupBatchResult>('/lineups/batch', operations);
        return response.data as unknown as LineupBatchResult;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: process batch operations locally
    const now = Date.now();
    const userId = getCurrentUserId();
    
    const result: LineupBatchResult = {
      created: { success: 0, failed: 0, items: [] },
      updated: { success: 0, failed: 0, items: [] },
      deleted: { success: 0, failed: 0, ids: [] },
    };

    // Process creates
    if (operations.create) {
      for (const createReq of operations.create) {
        try {
          const startMin = createReq.startMinute ?? 0;
          const lineupId = generateLineupId(createReq.matchId, createReq.playerId, startMin);
          
          const localLineup: EnhancedLineup = {
            id: lineupId,
            match_id: createReq.matchId,
            player_id: createReq.playerId,
            start_min: startMin,
            end_min: createReq.endMinute,
            position: createReq.position,
            created_at: now,
            updated_at: now,
            created_by_user_id: userId,
            is_deleted: false,
            synced: false,
          };

          await db.lineup.add(localLineup);
          result.created.success++;
          result.created.items.push(transformToApiLineup(localLineup));
        } catch {
          result.created.failed++;
        }
      }
    }

    // Process updates
    if (operations.update) {
      for (const updateOp of operations.update) {
        try {
          const existingLineup = await db.lineup.get(updateOp.id);
          if (!existingLineup) {
            result.updated.failed++;
            continue;
          }

          const updates: Partial<EnhancedLineup> = {
            updated_at: now,
            synced: false,
          };

          if (updateOp.data.startMinute !== undefined) updates.start_min = updateOp.data.startMinute;
          if (updateOp.data.endMinute !== undefined) updates.end_min = updateOp.data.endMinute;
          if (updateOp.data.position !== undefined) updates.position = updateOp.data.position;

          await db.lineup.update(updateOp.id, updates);
          
          const updatedLineup = await db.lineup.get(updateOp.id);
          if (updatedLineup) {
            result.updated.success++;
            result.updated.items.push(transformToApiLineup(updatedLineup));
          } else {
            result.updated.failed++;
          }
        } catch {
          result.updated.failed++;
        }
      }
    }

    // Process deletes
    if (operations.delete) {
      for (const deleteId of operations.delete) {
        try {
          const existingLineup = await db.lineup.get(deleteId);
          if (!existingLineup) {
            result.deleted.failed++;
            continue;
          }

          await db.lineup.update(deleteId, {
            is_deleted: true,
            deleted_at: now,
            deleted_by_user_id: userId,
            updated_at: now,
            synced: false,
          });

          result.deleted.success++;
          result.deleted.ids.push(deleteId);
        } catch {
          result.deleted.failed++;
        }
      }
    }

    showOfflineToast('Lineup batch saved locally - will sync when online');
    return result;
  },

  /**
   * Batch operations scoped to a specific match
   */
  async batchByMatch(matchId: string, operations: Omit<LineupBatchRequest, 'matchId'>): Promise<LineupBatchResult> {
    const response = await apiClient.post<LineupBatchResult>('/lineups/batch-by-match', {
      matchId,
      ...operations
    });
    return response.data as unknown as LineupBatchResult;
  },

  /**
   * Make a substitution during a match with offline fallback
   * 
   * Requirements: 3.3 - Update local lineup records for substitution when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async makeSubstitution(matchId: string, substitution: SubstitutionRequest): Promise<{
    playerOff: Lineup;
    playerOn: Lineup;
  }> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<{
          playerOff: Lineup;
          playerOn: Lineup;
        }>(`/lineups/match/${matchId}/substitute`, substitution);
        return response.data as unknown as {
          playerOff: Lineup;
          playerOn: Lineup;
        };
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local lineup records
    const now = Date.now();
    const userId = getCurrentUserId();
    const currentTime = substitution.currentTime;

    // Find the player going off - they should have an active lineup entry (no end_min)
    const playerOffLineups = await db.lineup
      .where('match_id')
      .equals(matchId)
      .filter(l => l.player_id === substitution.playerOffId && !l.end_min && !l.is_deleted)
      .toArray();

    if (playerOffLineups.length === 0) {
      throw new Error(`No active lineup found for player ${substitution.playerOffId} in match ${matchId}`);
    }

    // Get the most recent lineup entry for the player going off
    const playerOffLineup = playerOffLineups.sort((a, b) => b.start_min - a.start_min)[0];

    // Update player off - set end_min to current time
    await db.lineup.update(playerOffLineup.id, {
      end_min: currentTime,
      updated_at: now,
      synced: false,
    });

    const updatedPlayerOff = await db.lineup.get(playerOffLineup.id);
    if (!updatedPlayerOff) {
      throw new Error(`Failed to update lineup for player off ${substitution.playerOffId}`);
    }

    // Create lineup entry for player coming on
    const playerOnId = generateLineupId(matchId, substitution.playerOnId, currentTime);
    const playerOnLineup: EnhancedLineup = {
      id: playerOnId,
      match_id: matchId,
      player_id: substitution.playerOnId,
      start_min: currentTime,
      end_min: undefined,
      position: substitution.position,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    };

    await db.lineup.add(playerOnLineup);
    showOfflineToast('Substitution saved locally - will sync when online');

    return {
      playerOff: transformToApiLineup(updatedPlayerOff),
      playerOn: transformToApiLineup(playerOnLineup),
    };
  }
};

export default lineupsApi;
