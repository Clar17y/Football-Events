/**
 * Seasons management hook
 * Provides state management and operations for seasons with error handling and loading states
 */

import { useState, useCallback } from 'react';
import { seasonsApi, type SeasonsListParams } from '../services/api/seasonsApi';
import type { Season, SeasonCreateRequest, SeasonUpdateRequest } from '@shared/types';
import { useToast } from '../contexts/ToastContext';

export interface UseSeasonsState {
  seasons: Season[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  hasMore: boolean;
}

export interface UseSeasonsActions {
  loadSeasons: (params?: SeasonsListParams) => Promise<void>;
  createSeason: (seasonData: SeasonCreateRequest) => Promise<Season | null>;
  updateSeason: (id: string, seasonData: SeasonUpdateRequest) => Promise<Season | null>;
  deleteSeason: (id: string) => Promise<boolean>;
  refreshSeasons: () => Promise<void>;
  clearError: () => void;
}

export interface UseSeasonsReturn extends UseSeasonsState, UseSeasonsActions {}

/**
 * Custom hook for seasons management
 */
export const useSeasons = (): UseSeasonsReturn => {
  const [state, setState] = useState<UseSeasonsState>({
    seasons: [],
    loading: false,
    error: null,
    total: 0,
    page: 1,
    hasMore: false
  });

  const { showToast } = useToast();

  /**
   * Load seasons with pagination and search
   */
  const loadSeasons = useCallback(async (params: SeasonsListParams = {}) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await seasonsApi.getSeasons(params);
      
      setState(prev => ({
        ...prev,
        seasons: response.data,
        total: response.total,
        page: response.page,
        hasMore: response.hasMore,
        loading: false
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load seasons';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
    }
  }, [showToast]);

  /**
   * Create a new season
   */
  const createSeason = useCallback(async (seasonData: SeasonCreateRequest): Promise<Season | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await seasonsApi.createSeason(seasonData);
      
      // Add new season to the list
      setState(prev => ({
        ...prev,
        seasons: [response.data, ...prev.seasons],
        total: prev.total + 1,
        loading: false
      }));
      
      showToast({ message: response.message || 'Season created successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      let errorMessage = 'Failed to create season';
      
      // Handle specific error cases
      if (error.response?.data?.message) {
        const backendMessage = error.response.data.message;
        if (backendMessage.includes('unique constraint') || backendMessage.includes('already exists') || backendMessage.includes('duplicate')) {
          errorMessage = 'A season with that name already exists. Please choose a different name.';
        } else {
          errorMessage = backendMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
      return null;
    }
  }, [showToast]);

  /**
   * Update an existing season
   */
  const updateSeason = useCallback(async (id: string, seasonData: SeasonUpdateRequest): Promise<Season | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await seasonsApi.updateSeason(id, seasonData);
      
      // Update season in the list
      setState(prev => ({
        ...prev,
        seasons: prev.seasons.map(season => 
          season.id === id ? response.data : season
        ),
        loading: false
      }));
      
      showToast({ message: response.message || 'Season updated successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update season';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
      return null;
    }
  }, [showToast]);

  /**
   * Delete a season
   */
  const deleteSeason = useCallback(async (id: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await seasonsApi.deleteSeason(id);
      
      // Remove season from the list
      setState(prev => ({
        ...prev,
        seasons: prev.seasons.filter(season => season.id !== id),
        total: prev.total - 1,
        loading: false
      }));
      
      showToast({ message: response.message || 'Season deleted successfully', severity: 'success' });
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete season';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
      return false;
    }
  }, [showToast]);

  /**
   * Refresh seasons list
   */
  const refreshSeasons = useCallback(async () => {
    await loadSeasons({ page: state.page });
  }, [loadSeasons, state.page]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    seasons: state.seasons,
    loading: state.loading,
    error: state.error,
    total: state.total,
    page: state.page,
    hasMore: state.hasMore,
    
    // Actions
    loadSeasons,
    createSeason,
    updateSeason,
    deleteSeason,
    refreshSeasons,
    clearError
  };
};

export default useSeasons;