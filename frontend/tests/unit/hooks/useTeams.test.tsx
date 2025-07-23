/**
 * useTeams Hook Unit Tests
 * Tests the teams management hook with mocked API calls and toast context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { useTeams } from '../../../src/hooks/useTeams';
import { teamsApi } from '../../../src/services/api/teamsApi';
import { ToastProvider } from '../../../src/contexts/ToastContext';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';

// Mock the teams API
vi.mock('../../../src/services/api/teamsApi', () => ({
  teamsApi: {
    getTeams: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    getTeamById: vi.fn(),
    getTeamPlayers: vi.fn(),
    getActiveTeamPlayers: vi.fn(),
    getTeamSquad: vi.fn(),
  }
}));

const mockTeamsApi = teamsApi as any;

// Test wrapper with ToastProvider
const TestWrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('useTeams Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      expect(result.current.teams).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.total).toBe(0);
      expect(result.current.page).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('loadTeams', () => {
    it('should load teams successfully', async () => {
      const mockTeams: Team[] = [
        {
          id: 'team-1',
          name: 'Test Team 1',
          homeKitPrimary: '#FF0000',
          createdAt: new Date(),
          created_by_user_id: 'user-1',
          is_deleted: false
        },
        {
          id: 'team-2',
          name: 'Test Team 2',
          awayKitPrimary: '#0000FF',
          createdAt: new Date(),
          created_by_user_id: 'user-1',
          is_deleted: false
        }
      ];

      const mockResponse = {
        data: mockTeams,
        total: 2,
        page: 1,
        limit: 25,
        hasMore: false
      };

      mockTeamsApi.getTeams.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      expect(result.current.loading).toBe(false);

      await act(async () => {
        await result.current.loadTeams();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.teams).toEqual(mockTeams);
      expect(result.current.total).toBe(2);
      expect(result.current.page).toBe(1);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle loading state correctly', async () => {
      mockTeamsApi.getTeams.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: [], total: 0, page: 1, hasMore: false }), 100))
      );

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      act(() => {
        result.current.loadTeams();
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle API errors', async () => {
      const errorMessage = 'Failed to load teams';
      mockTeamsApi.getTeams.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      await act(async () => {
        await result.current.loadTeams();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.teams).toEqual([]);
    });

    it('should load teams with custom parameters', async () => {
      const mockResponse = {
        data: [],
        total: 0,
        page: 2,
        limit: 10,
        hasMore: false
      };

      mockTeamsApi.getTeams.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      await act(async () => {
        await result.current.loadTeams({ page: 2, limit: 10, search: 'Arsenal' });
      });

      expect(mockTeamsApi.getTeams).toHaveBeenCalledWith({ page: 2, limit: 10, search: 'Arsenal' });
      expect(result.current.page).toBe(2);
    });
  });

  describe('createTeam', () => {
    it('should create a team successfully', async () => {
      const newTeamData: TeamCreateRequest = {
        name: 'New Team',
        homeKitPrimary: '#FF0000'
      };

      const createdTeam: Team = {
        id: 'team-new',
        name: 'New Team',
        homeKitPrimary: '#FF0000',
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockTeamsApi.createTeam.mockResolvedValue({
        data: createdTeam,
        success: true,
        message: 'Team created successfully'
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      let createdResult: Team | null = null;

      await act(async () => {
        createdResult = await result.current.createTeam(newTeamData);
      });

      expect(createdResult).toEqual(createdTeam);
      expect(result.current.teams).toContain(createdTeam);
      expect(result.current.total).toBe(1);
      expect(mockTeamsApi.createTeam).toHaveBeenCalledWith(newTeamData);
    });

    it('should handle create team errors', async () => {
      const newTeamData: TeamCreateRequest = {
        name: 'Invalid Team'
      };

      const errorMessage = 'Team name already exists';
      mockTeamsApi.createTeam.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      let createdResult: Team | null = null;

      await act(async () => {
        createdResult = await result.current.createTeam(newTeamData);
      });

      expect(createdResult).toBe(null);
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.teams).toEqual([]);
    });
  });

  describe('updateTeam', () => {
    it('should update a team successfully', async () => {
      const existingTeam: Team = {
        id: 'team-1',
        name: 'Original Team',
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      const updateData: TeamUpdateRequest = {
        name: 'Updated Team',
        homeKitPrimary: '#00FF00'
      };

      const updatedTeam: Team = {
        ...existingTeam,
        ...updateData
      };

      mockTeamsApi.updateTeam.mockResolvedValue({
        data: updatedTeam,
        success: true,
        message: 'Team updated successfully'
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      // Mock the initial load first
      mockTeamsApi.getTeams.mockResolvedValue({
        data: [existingTeam],
        total: 1,
        page: 1,
        hasMore: false
      });

      // Set initial state with existing team
      await act(async () => {
        await result.current.loadTeams();
      });

      let updateResult: Team | null = null;

      await act(async () => {
        updateResult = await result.current.updateTeam('team-1', updateData);
      });

      expect(updateResult).toEqual(updatedTeam);
      expect(result.current.teams[0]).toEqual(updatedTeam);
      expect(mockTeamsApi.updateTeam).toHaveBeenCalledWith('team-1', updateData);
    });

    it('should handle update team errors', async () => {
      const updateData: TeamUpdateRequest = {
        name: 'Invalid Update'
      };

      const errorMessage = 'Team not found';
      mockTeamsApi.updateTeam.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      let updateResult: Team | null = null;

      await act(async () => {
        updateResult = await result.current.updateTeam('invalid-id', updateData);
      });

      expect(updateResult).toBe(null);
      expect(result.current.error).toBe(errorMessage);
    });
  });

  describe('deleteTeam', () => {
    it('should delete a team successfully', async () => {
      const teamToDelete: Team = {
        id: 'team-1',
        name: 'Team to Delete',
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockTeamsApi.deleteTeam.mockResolvedValue({
        success: true,
        message: 'Team deleted successfully'
      });

      mockTeamsApi.getTeams.mockResolvedValue({
        data: [teamToDelete],
        total: 1,
        page: 1,
        hasMore: false
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      // Load initial team
      await act(async () => {
        await result.current.loadTeams();
      });

      expect(result.current.teams).toContain(teamToDelete);

      let deleteResult: boolean = false;

      await act(async () => {
        deleteResult = await result.current.deleteTeam('team-1');
      });

      expect(deleteResult).toBe(true);
      expect(result.current.teams).not.toContain(teamToDelete);
      expect(result.current.total).toBe(0);
      expect(mockTeamsApi.deleteTeam).toHaveBeenCalledWith('team-1');
    });

    it('should handle delete team errors', async () => {
      const errorMessage = 'Cannot delete team with active players';
      mockTeamsApi.deleteTeam.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      let deleteResult: boolean = true;

      await act(async () => {
        deleteResult = await result.current.deleteTeam('team-1');
      });

      expect(deleteResult).toBe(false);
      expect(result.current.error).toBe(errorMessage);
    });
  });

  describe('Utility Functions', () => {
    it('should refresh teams', async () => {
      const mockResponse = {
        data: [],
        total: 0,
        page: 1,
        hasMore: false
      };

      mockTeamsApi.getTeams.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      await act(async () => {
        await result.current.refreshTeams();
      });

      expect(mockTeamsApi.getTeams).toHaveBeenCalledWith({ page: 1 });
    });

    it('should clear error', () => {
      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      // Set an error first
      act(() => {
        // Simulate an error state
        result.current.loadTeams().catch(() => {});
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle network errors gracefully', async () => {
      mockTeamsApi.getTeams.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      await act(async () => {
        await result.current.loadTeams();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.loading).toBe(false);
    });

    it('should handle malformed API responses', async () => {
      mockTeamsApi.getTeams.mockRejectedValue({
        response: { data: null }
      });

      const { result } = renderHook(() => useTeams(), {
        wrapper: TestWrapper
      });

      await act(async () => {
        await result.current.loadTeams();
      });

      expect(result.current.error).toBe('Failed to load teams');
    });
  });
});