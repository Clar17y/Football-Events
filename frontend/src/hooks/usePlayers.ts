/**
 * Players management hook
 * Provides state management and operations for players with error handling and loading states
 */

import { useState, useCallback } from 'react';
import { playersApi, type PlayersListParams } from '../services/api/playersApi';
import type { Player, PlayerCreateRequest, PlayerUpdateRequest } from '@shared/types';
import { useToast } from '../contexts/ToastContext';

export interface UsePlayersState {
  players: Player[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  hasMore: boolean;
}

export interface UsePlayersActions {
  loadPlayers: (params?: PlayersListParams) => Promise<void>;
  createPlayer: (playerData: PlayerCreateRequest) => Promise<Player | null>;
  updatePlayer: (id: string, playerData: PlayerUpdateRequest) => Promise<Player | null>;
  deletePlayer: (id: string) => Promise<boolean>;
  refreshPlayers: () => Promise<void>;
  clearError: () => void;
}

export interface UsePlayersReturn extends UsePlayersState, UsePlayersActions {}

/**
 * Custom hook for players management
 */
export const usePlayers = (): UsePlayersReturn => {
  const [state, setState] = useState<UsePlayersState>({
    players: [],
    loading: false,
    error: null,
    total: 0,
    page: 1,
    hasMore: false
  });

  const { showToast } = useToast();

  /**
   * Load players with pagination and search
   */
  const loadPlayers = useCallback(async (params: PlayersListParams = {}) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await playersApi.getPlayers(params);
      setState(prev => ({
        ...prev,
        players: response.data,
        total: response.total,
        page: response.page,
        hasMore: response.hasMore,
        loading: false,
        error: null
      }));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load players';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      showToast({ message: errorMessage, severity: 'error' });
    }
  }, [showToast]);

  /**
   * Create a new player (with optional team assignment)
   */
  const createPlayer = useCallback(async (playerData: PlayerCreateRequest & { teamId?: string; teamIds?: string[] }): Promise<Player | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      let response;
      
      // If teamIds array is provided, use the players-with-teams endpoint
      if (playerData.teamIds && playerData.teamIds.length > 0) {
        response = await playersApi.createPlayerWithTeams(playerData as PlayerCreateRequest & { teamIds: string[] });
      } else if (playerData.teamId) {
        // If single teamId is provided, use the players-with-team endpoint (backward compatibility)
        response = await playersApi.createPlayerWithTeam(playerData as PlayerCreateRequest & { teamId: string });
      } else {
        // Otherwise use the regular players endpoint
        const { teamId, teamIds, ...playerFields } = playerData;
        response = await playersApi.createPlayer(playerFields);
      }
      
      // Add the new player to the list
      setState(prev => ({
        ...prev,
        players: [response.data, ...prev.players],
        total: prev.total + 1,
        loading: false,
        error: null
      }));
      
      showToast({ message: response.message || 'Player created successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      let errorMessage = 'Failed to create player';
      
      // Handle specific error cases
      if (error.response?.data?.message) {
        const backendMessage = error.response.data.message;
        if (backendMessage.includes('already exists') || backendMessage.includes('duplicate')) {
          errorMessage = 'A player with that name already exists. Please choose a different name.';
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
   * Update an existing player (with optional team changes)
   */
  const updatePlayer = useCallback(async (id: string, playerData: PlayerUpdateRequest & { teamIds?: string[] }): Promise<Player | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      let response;
      
      // If teamIds are provided, we need to handle team changes
      if (playerData.teamIds !== undefined) {
        response = await playersApi.updatePlayerWithTeams(id, playerData as PlayerUpdateRequest & { teamIds: string[] });
      } else {
        // Regular player update without team changes
        const { teamIds, ...updateFields } = playerData;
        response = await playersApi.updatePlayer(id, updateFields);
      }
      
      // Update the player in the list
      setState(prev => ({
        ...prev,
        players: prev.players.map(player => 
          player.id === id ? response.data : player
        ),
        loading: false,
        error: null
      }));
      
      showToast({ message: response.message || 'Player updated successfully', severity: 'success' });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update player';
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
   * Delete a player (soft delete)
   */
  const deletePlayer = useCallback(async (id: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      await playersApi.deletePlayer(id);
      
      // Remove the player from the list
      setState(prev => ({
        ...prev,
        players: prev.players.filter(player => player.id !== id),
        total: prev.total - 1,
        loading: false,
        error: null
      }));
      
      showToast({ message: 'Player deleted successfully', severity: 'success' });
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete player';
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
   * Refresh players list
   */
  const refreshPlayers = useCallback(async () => {
    await loadPlayers({ page: state.page });
  }, [loadPlayers, state.page]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    players: state.players,
    loading: state.loading,
    error: state.error,
    total: state.total,
    page: state.page,
    hasMore: state.hasMore,
    
    // Actions
    loadPlayers,
    createPlayer,
    updatePlayer,
    deletePlayer,
    refreshPlayers,
    clearError
  };
};

export default usePlayers;