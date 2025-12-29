/**
 * Seasons API Service
 * Handles all season-related API operations with proper error handling and type safety
 */

import apiClient from './baseApi';
import { dbToSeason, dbToSeasons } from '../../db/transforms';
import type { EnhancedSeason } from '../../db/schema';
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
    rows = rows.filter((s: any) => s && !s.isDeleted);
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((s: any) => (s.label || '').toLowerCase().includes(term));
    }
    rows.sort((a: any, b: any) => (a.label || '').localeCompare(b.label || ''));
    const total = rows.length;
    const start = (page - 1) * limit;
    const paged = rows.slice(start, start + limit);
    const data = dbToSeasons(paged as EnhancedSeason[]);
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
    if (!season || season.isDeleted) {
      throw new Error('Season not found');
    }
    return {
      data: dbToSeason(season as EnhancedSeason),
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
        id: season.seasonId,
        seasonId: season.seasonId,
        label: season.label,
        startDate: (season as any).startDate,
        endDate: (season as any).endDate,
        isCurrent: (season as any).isCurrent || false,
        description: (season as any).description,
        createdAt: new Date(season.createdAt),
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
        startDate: (updated as any)?.startDate,
        endDate: (updated as any)?.endDate,
        isCurrent: (updated as any)?.isCurrent || false,
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
