/**
 * Seasons API Service
 * Handles all season-related API operations with proper error handling and type safety
 */

import apiClient from './baseApi';
import type { 
  Season, 
  SeasonCreateRequest, 
  SeasonUpdateRequest, 
  PaginatedResponse 
} from '@shared/types';

// API request/response interfaces
export interface SeasonsListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface SeasonsListResponse extends PaginatedResponse<Season> {}

export interface SeasonResponse {
  data: Season;
  success: boolean;
  message?: string;
}

/**
 * Seasons API service with full CRUD operations
 */
export const seasonsApi = {
  /**
   * Get paginated list of user's seasons with optional search
   */
  async getSeasons(params: SeasonsListParams = {}): Promise<SeasonsListResponse> {
    const { page = 1, limit = 25, search } = params;
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      let rows = await db.seasons.toArray();
      rows = rows.filter((s: any) => s && !s.is_deleted);
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        rows = rows.filter((s: any) => (s.label || '').toLowerCase().includes(term));
      }
      rows.sort((a: any, b: any) => (a.label || '').localeCompare(b.label || ''));
      const total = rows.length;
      const start = (page - 1) * limit;
      const paged = rows.slice(start, start + limit);
      const data = paged.map((s: any) => ({
        id: s.season_id || s.id,
        seasonId: s.season_id || s.id,
        label: s.label,
        startDate: s.start_date,
        endDate: s.end_date,
        isCurrent: !!s.is_current,
        description: s.description,
        createdAt: new Date(s.created_at),
        updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
        created_by_user_id: s.created_by_user_id,
        deleted_at: s.deleted_at ? new Date(s.deleted_at) : undefined,
        deleted_by_user_id: s.deleted_by_user_id,
        is_deleted: !!s.is_deleted
      })) as Season[];
      return {
        data,
        total,
        page,
        limit,
        hasMore: start + limit < total
      } as SeasonsListResponse;
    }
    const queryParams = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search && search.trim()) queryParams.append('search', search.trim());
    const response = await apiClient.get(`/seasons?${queryParams.toString()}`);
    return response.data as SeasonsListResponse;
  },

  /**
   * Get a specific season by ID
   */
  async getSeasonById(id: string): Promise<SeasonResponse> {
    const response = await apiClient.get(`/seasons/${id}`);
    return {
      data: response.data as Season,
      success: true
    };
  },

  /**
   * Create a new season
   */
  async createSeason(seasonData: SeasonCreateRequest): Promise<SeasonResponse> {
    // Transform frontend data to match backend schema
    const backendData = {
      label: seasonData.label,
      startDate: seasonData.startDate ? seasonData.startDate.split('T')[0] : '', // Normalize to YYYY-MM-DD
      endDate: seasonData.endDate ? seasonData.endDate.split('T')[0] : '',       // Normalize to YYYY-MM-DD
      isCurrent: seasonData.isCurrent ?? false,
      description: seasonData.description
    };

    try {
      const response = await apiClient.post('/seasons', backendData);
      return {
        data: response.data as Season,
        success: true,
        message: 'Season created successfully'
      };
    } catch (e) {
      // Offline fallback: create locally and enqueue outbox
      const now = Date.now();
      const id = (crypto?.randomUUID ? crypto.randomUUID() : `season-${now}-${Math.random().toString(36).slice(2)}`);
      await (await import('../../db/indexedDB')).db.seasons.add({
        id,
        season_id: id,
        label: seasonData.label,
        start_date: seasonData.startDate,
        end_date: seasonData.endDate,
        is_current: !!seasonData.isCurrent,
        description: seasonData.description,
        created_at: now,
        updated_at: now,
        created_by_user_id: 'offline',
        is_deleted: false,
      } as any);
      await (await import('../../db/utils')).addToOutbox('seasons', id, 'INSERT', seasonData as any, 'offline');
      return {
        data: {
          id,
          seasonId: id,
          label: seasonData.label,
          startDate: seasonData.startDate,
          endDate: seasonData.endDate,
          isCurrent: !!seasonData.isCurrent,
          description: seasonData.description,
          createdAt: new Date(now),
          created_by_user_id: 'offline',
          is_deleted: false
        } as any,
        success: true,
        message: 'Season created (offline, pending sync)'
      };
    }
  },

  /**
   * Update an existing season
   */
  async updateSeason(id: string, seasonData: SeasonUpdateRequest): Promise<SeasonResponse> {
    // Transform frontend data to match backend schema
    const backendData = {
      label: seasonData.label,
      startDate: seasonData.startDate ? seasonData.startDate.split('T')[0] : undefined, // Normalize to YYYY-MM-DD
      endDate: seasonData.endDate ? seasonData.endDate.split('T')[0] : undefined,       // Normalize to YYYY-MM-DD
      isCurrent: seasonData.isCurrent,
      description: seasonData.description
    } as const;

    // Remove undefined values
    const cleanData = Object.fromEntries(
      Object.entries(backendData).filter(([_, value]) => value !== undefined)
    );

    try {
      const response = await apiClient.put(`/seasons/${id}`, cleanData);
      return {
        data: response.data as Season,
        success: true,
        message: 'Season updated successfully'
      };
    } catch (e) {
      // Offline fallback: update local and enqueue outbox
      const now = Date.now();
      try {
        await (await import('../../db/indexedDB')).db.seasons.update(id, {
          label: seasonData.label,
          start_date: seasonData.startDate,
          end_date: seasonData.endDate,
          is_current: seasonData.isCurrent,
          description: seasonData.description,
          updated_at: now,
        } as any);
      } catch {}
      await (await import('../../db/utils')).addToOutbox('seasons', id, 'UPDATE', seasonData as any, 'offline');
      return {
        data: {
          id,
          seasonId: id,
          label: seasonData.label || '',
          startDate: seasonData.startDate,
          endDate: seasonData.endDate,
          isCurrent: !!seasonData.isCurrent,
          description: seasonData.description,
          created_by_user_id: 'offline',
          is_deleted: false
        } as any,
        success: true,
        message: 'Season updated (offline, pending sync)'
      };
    }
  },

  /**
   * Delete a season (soft delete)
   */
  async deleteSeason(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await apiClient.delete(`/seasons/${id}`);
      return { success: true, message: 'Season deleted successfully' };
    } catch (e) {
      try {
        await (await import('../../db/indexedDB')).db.seasons.update(id, { is_deleted: true, deleted_at: Date.now() } as any);
      } catch {}
      await (await import('../../db/utils')).addToOutbox('seasons', id, 'DELETE', undefined, 'offline');
      return { success: true, message: 'Season deleted (offline, pending sync)' };
    }
  }
};

export default seasonsApi;
