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

export interface SeasonsListResponse extends PaginatedResponse<Season> { }

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
   * Local-first: always reads from IndexedDB
   */
  async getSeasons(params: SeasonsListParams = {}): Promise<SeasonsListResponse> {
    const { page = 1, limit = 25, search } = params;
    
    // Local-first: always read from IndexedDB
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
  },

  /**
   * Get a specific season by ID
   * Local-first: always reads from IndexedDB
   */
  async getSeasonById(id: string): Promise<SeasonResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const season = await db.seasons.get(id);
    if (!season || season.is_deleted) {
      throw new Error('Season not found');
    }
    return {
      data: {
        id: season.season_id || season.id,
        seasonId: season.season_id || season.id,
        label: season.label,
        startDate: season.start_date,
        endDate: season.end_date,
        isCurrent: !!season.is_current,
        description: season.description,
        createdAt: new Date(season.created_at),
        updatedAt: season.updated_at ? new Date(season.updated_at) : undefined,
        created_by_user_id: season.created_by_user_id,
        deleted_at: season.deleted_at ? new Date(season.deleted_at) : undefined,
        deleted_by_user_id: season.deleted_by_user_id,
        is_deleted: !!season.is_deleted
      } as Season,
      success: true
    };
  },

  /**
   * Create a new season - LOCAL-FIRST
   */
  async createSeason(seasonData: SeasonCreateRequest): Promise<SeasonResponse> {
    const { seasonsDataLayer } = await import('../dataLayer');

    const season = await seasonsDataLayer.create({
      label: seasonData.label,
      startDate: seasonData.startDate,
      endDate: seasonData.endDate,
      isCurrent: seasonData.isCurrent,
      description: seasonData.description,
    });

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: {
        id: season.season_id,
        seasonId: season.season_id,
        label: season.label,
        startDate: (season as any).start_date,
        endDate: (season as any).end_date,
        isCurrent: (season as any).is_current || false,
        description: (season as any).description,
        createdAt: new Date(season.created_at),
      } as any,
      success: true,
      message: 'Season created'
    };
  },

  /**
   * Update an existing season - LOCAL-FIRST
   */
  async updateSeason(id: string, seasonData: SeasonUpdateRequest): Promise<SeasonResponse> {
    const { seasonsDataLayer } = await import('../dataLayer');
    const { db } = await import('../../db/indexedDB');

    await seasonsDataLayer.update(id, {
      label: seasonData.label,
      startDate: seasonData.startDate,
      endDate: seasonData.endDate,
      isCurrent: seasonData.isCurrent,
      description: seasonData.description,
    });

    const updated = await db.seasons.get(id);
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: {
        id,
        seasonId: id,
        label: updated?.label || seasonData.label || '',
        startDate: (updated as any)?.start_date,
        endDate: (updated as any)?.end_date,
        isCurrent: (updated as any)?.is_current || false,
        description: (updated as any)?.description,
      } as any,
      success: true,
      message: 'Season updated'
    };
  },

  /**
   * Delete a season (soft delete) - LOCAL-FIRST
   */
  async deleteSeason(id: string): Promise<{ success: boolean; message: string }> {
    const { seasonsDataLayer } = await import('../dataLayer');
    await seasonsDataLayer.delete(id);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return { success: true, message: 'Season deleted' };
  }
};

export default seasonsApi;
