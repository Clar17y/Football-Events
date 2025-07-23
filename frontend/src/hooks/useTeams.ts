/**
 * Teams management hook
 * Provides state management and operations for teams with error handling and loading states
 */

import { useState, useCallback } from 'react';
import { teamsApi, type TeamsListParams } from '../services/api/teamsApi';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';
import { useToast } from '../contexts/ToastContext';

export interface UseTeamsState {
  teams: Team[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  hasMore: boolean;
}

export interface UseTeamsActions {
  loadTeams: (params?: TeamsListParams) => Promise<void>;
  createTeam: (teamData: TeamCreateRequest) => Promise<Team | null>;
  updateTeam: (id: string, teamData: TeamUpdateRequest) => Promise<Team | null>;
  deleteTeam: (id: string) => Promise<boolean>;
  refreshTeams: () => Promise<void>;
  clearError: () => void;
}

export interface UseTeamsReturn extends UseTeamsState, UseTeamsActions {}

/**
 * Custom hook for teams management
 */
export const useTeams = (): UseTeamsReturn => {
  const [state, setState] = useState<UseTeamsState>({
    teams: [],
    loading: false,
    error: null,
    total: 0,
    page: 1,
    hasMore: false
  });

  const { showToast } = useToast();

  /**
   * Load teams with pagination and search
   */
  const loadTeams = useCallback(async (params: TeamsListParams = {}) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await teamsApi.getTeams(params);
      
      setState(prev => ({
        ...prev,
        teams: response.data,
        total: response.total,
        page: response.page,
        hasMore: response.hasMore,
        loading: false
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load teams';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
    }
  }, [showToast]);

  /**
   * Create a new team
   */
  const createTeam = useCallback(async (teamData: TeamCreateRequest): Promise<Team | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await teamsApi.createTeam(teamData);
      
      // Add new team to the list
      setState(prev => ({
        ...prev,
        teams: [response.data, ...prev.teams],
        total: prev.total + 1,
        loading: false
      }));
      
      showToast({ message: response.message || 'Team created successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      let errorMessage = 'Failed to create team';
      
      // Handle specific error cases
      if (error.response?.data?.message) {
        const backendMessage = error.response.data.message;
        if (backendMessage.includes('unique constraint') || backendMessage.includes('already exists') || backendMessage.includes('duplicate')) {
          errorMessage = 'A team with that name already exists. Please choose a different name.';
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
   * Update an existing team
   */
  const updateTeam = useCallback(async (id: string, teamData: TeamUpdateRequest): Promise<Team | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await teamsApi.updateTeam(id, teamData);
      
      // Update team in the list
      setState(prev => ({
        ...prev,
        teams: prev.teams.map(team => 
          team.id === id ? response.data : team
        ),
        loading: false
      }));
      
      showToast({ message: response.message || 'Team updated successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update team';
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
   * Delete a team
   */
  const deleteTeam = useCallback(async (id: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await teamsApi.deleteTeam(id);
      
      // Remove team from the list
      setState(prev => ({
        ...prev,
        teams: prev.teams.filter(team => team.id !== id),
        total: prev.total - 1,
        loading: false
      }));
      
      showToast({ message: response.message || 'Team deleted successfully', severity: 'success' });
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete team';
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
   * Refresh teams list
   */
  const refreshTeams = useCallback(async () => {
    await loadTeams({ page: state.page });
  }, [loadTeams, state.page]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    teams: state.teams,
    loading: state.loading,
    error: state.error,
    total: state.total,
    page: state.page,
    hasMore: state.hasMore,
    
    // Actions
    loadTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    refreshTeams,
    clearError
  };
};

export default useTeams;