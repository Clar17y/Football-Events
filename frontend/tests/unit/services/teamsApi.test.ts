/**
 * Teams API Service Unit Tests
 * Tests the teams API service with mocked HTTP calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { teamsApi } from '../../../src/services/api/teamsApi';
import apiClient from '../../../src/services/api/baseApi';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';

// Mock the API client
vi.mock('../../../src/services/api/baseApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}));

const mockApiClient = apiClient as any;

describe('Teams API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getTeams', () => {
    it('should fetch teams with default pagination', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'team-1',
              name: 'Test Team 1',
              homeKitPrimary: '#FF0000',
              homeKitSecondary: '#FFFFFF',
              awayKitPrimary: '#0000FF',
              awayKitSecondary: '#FFFFFF',
              logoUrl: 'https://example.com/logo.png',
              createdAt: new Date(),
              created_by_user_id: 'user-1',
              is_deleted: false
            }
          ],
          total: 1,
          page: 1,
          limit: 25,
          hasMore: false
        }
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await teamsApi.getTeams();

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams?page=1&limit=25');
      expect(result).toEqual(mockResponse.data);
    });

    it('should fetch teams with custom pagination and search', async () => {
      const mockResponse = {
        data: {
          data: [],
          total: 0,
          page: 2,
          limit: 10,
          hasMore: false
        }
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await teamsApi.getTeams({
        page: 2,
        limit: 10,
        search: 'Arsenal'
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams?page=2&limit=10&search=Arsenal');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle empty search parameter', async () => {
      const mockResponse = { data: { data: [], total: 0, page: 1, limit: 25, hasMore: false } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await teamsApi.getTeams({ search: '   ' }); // Whitespace only

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams?page=1&limit=25');
    });

    it('should include opponents when includeOpponents is true', async () => {
      const mockResponse = { data: { data: [], total: 0, page: 1, limit: 25, hasMore: false } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await teamsApi.getTeams({ includeOpponents: true });

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams?page=1&limit=25&includeOpponents=true');
    });
  });

  describe('getTeamById', () => {
    it('should fetch a specific team by ID', async () => {
      const mockTeam: Team = {
        id: 'team-1',
        name: 'Test Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF',
        logoUrl: 'https://example.com/logo.png',
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockApiClient.get.mockResolvedValue({ data: mockTeam });

      const result = await teamsApi.getTeamById('team-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams/team-1');
      expect(result).toEqual({
        data: mockTeam,
        success: true
      });
    });
  });

  describe('createTeam', () => {
    it('should create a new team with all fields', async () => {
      const teamData: TeamCreateRequest = {
        name: 'New Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF',
        logoUrl: 'https://example.com/logo.png'
      };

      const mockCreatedTeam: Team = {
        id: 'team-new',
        ...teamData,
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockApiClient.post.mockResolvedValue({ data: mockCreatedTeam });

      const result = await teamsApi.createTeam(teamData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/teams', {
        name: 'New Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF',
        logoUrl: 'https://example.com/logo.png'
      });

      expect(result).toEqual({
        data: mockCreatedTeam,
        success: true,
        message: 'Team created successfully'
      });
    });

    it('should create a team with minimal data', async () => {
      const teamData: TeamCreateRequest = {
        name: 'Minimal Team'
      };

      const mockCreatedTeam: Team = {
        id: 'team-minimal',
        name: 'Minimal Team',
        createdAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockApiClient.post.mockResolvedValue({ data: mockCreatedTeam });

      const result = await teamsApi.createTeam(teamData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/teams', {
        name: 'Minimal Team'
      });

      expect(result.data.name).toBe('Minimal Team');
    });
  });

  describe('updateTeam', () => {
    it('should update a team with partial data', async () => {
      const updateData: TeamUpdateRequest = {
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00'
      };

      const mockUpdatedTeam: Team = {
        id: 'team-1',
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF',
        createdAt: new Date(),
        updatedAt: new Date(),
        created_by_user_id: 'user-1',
        is_deleted: false
      };

      mockApiClient.put.mockResolvedValue({ data: mockUpdatedTeam });

      const result = await teamsApi.updateTeam('team-1', updateData);

      expect(mockApiClient.put).toHaveBeenCalledWith('/teams/team-1', {
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00'
      });

      expect(result).toEqual({
        data: mockUpdatedTeam,
        success: true,
        message: 'Team updated successfully'
      });
    });

    it('should filter out undefined values in update', async () => {
      const updateData: TeamUpdateRequest = {
        name: 'Updated Name',
        homeKitPrimary: undefined,
        logoUrl: 'https://new-logo.com'
      };

      mockApiClient.put.mockResolvedValue({ data: {} });

      await teamsApi.updateTeam('team-1', updateData);

      expect(mockApiClient.put).toHaveBeenCalledWith('/teams/team-1', {
        name: 'Updated Name',
        logoUrl: 'https://new-logo.com'
      });
    });
  });

  describe('deleteTeam', () => {
    it('should delete a team', async () => {
      mockApiClient.delete.mockResolvedValue({});

      const result = await teamsApi.deleteTeam('team-1');

      expect(mockApiClient.delete).toHaveBeenCalledWith('/teams/team-1');
      expect(result).toEqual({
        success: true,
        message: 'Team deleted successfully'
      });
    });
  });

  describe('getTeamPlayers', () => {
    it('should fetch team players', async () => {
      const mockPlayers = [
        {
          id: 'player-1',
          name: 'John Doe',
          squadNumber: 10,
          preferredPosition: 'FW',
          isActive: true
        },
        {
          id: 'player-2',
          name: 'Jane Smith',
          squadNumber: 7,
          preferredPosition: 'MF',
          isActive: true
        }
      ];

      mockApiClient.get.mockResolvedValue({ data: mockPlayers });

      const result = await teamsApi.getTeamPlayers('team-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams/team-1/players');
      expect(result).toEqual({
        data: mockPlayers,
        success: true
      });
    });
  });

  describe('getActiveTeamPlayers', () => {
    it('should fetch active team players', async () => {
      const mockActivePlayers = [
        {
          id: 'player-1',
          name: 'John Doe',
          squadNumber: 10,
          preferredPosition: 'FW',
          isActive: true
        }
      ];

      mockApiClient.get.mockResolvedValue({ data: mockActivePlayers });

      const result = await teamsApi.getActiveTeamPlayers('team-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams/team-1/active-players');
      expect(result).toEqual({
        data: mockActivePlayers,
        success: true
      });
    });
  });

  describe('getTeamSquad', () => {
    it('should fetch team squad without season', async () => {
      const mockSquad = {
        team: {
          id: 'team-1',
          name: 'Test Team',
          createdAt: new Date(),
          created_by_user_id: 'user-1',
          is_deleted: false
        },
        players: [
          {
            id: 'player-1',
            name: 'John Doe',
            squadNumber: 10,
            position: 'FW',
            isActive: true
          }
        ]
      };

      mockApiClient.get.mockResolvedValue({ data: mockSquad });

      const result = await teamsApi.getTeamSquad('team-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams/team-1/squad');
      expect(result).toEqual({
        data: mockSquad,
        success: true
      });
    });

    it('should fetch team squad with season', async () => {
      const mockSquad = {
        team: {
          id: 'team-1',
          name: 'Test Team',
          createdAt: new Date(),
          created_by_user_id: 'user-1',
          is_deleted: false
        },
        players: [],
        season: {
          id: 'season-1',
          label: '2024-25'
        }
      };

      mockApiClient.get.mockResolvedValue({ data: mockSquad });

      const result = await teamsApi.getTeamSquad('team-1', 'season-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/teams/team-1/squad?seasonId=season-1');
      expect(result).toEqual({
        data: mockSquad,
        success: true
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      mockApiClient.get.mockRejectedValue(apiError);

      await expect(teamsApi.getTeams()).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      const httpError = {
        response: {
          status: 404,
          data: { message: 'Team not found' }
        }
      };
      mockApiClient.get.mockRejectedValue(httpError);

      await expect(teamsApi.getTeamById('invalid-id')).rejects.toEqual(httpError);
    });
  });
});
