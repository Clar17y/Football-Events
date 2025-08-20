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
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search && search.trim()) {
      queryParams.append('search', search.trim());
    }
    
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

    const response = await apiClient.post('/seasons', backendData);
    return {
      data: response.data as Season,
      success: true,
      message: 'Season created successfully'
    };
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

    const response = await apiClient.put(`/seasons/${id}`, cleanData);
    return {
      data: response.data as Season,
      success: true,
      message: 'Season updated successfully'
    };
  },

  /**
   * Delete a season (soft delete)
   */
  async deleteSeason(id: string): Promise<{ success: boolean; message: string }> {
    await apiClient.delete(`/seasons/${id}`);
    return {
      success: true,
      message: 'Season deleted successfully'
    };
  }
};

export default seasonsApi;
