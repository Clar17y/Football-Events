/**
 * Teams API Service Unit Tests
 * Tests the teams API service with local-first architecture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { teamsApi } from '../../../src/services/api/teamsApi';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';

// Mock the database
const mockTeams: any[] = [];
const mockDb = {
  teams: {
    toArray: vi.fn(() => Promise.resolve([...mockTeams])),
    get: vi.fn((id: string) => Promise.resolve(mockTeams.find(t => t.id === id))),
    put: vi.fn(),
    delete: vi.fn(),
    filter: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve(mockTeams.filter(t => !t.isDeleted)))
    }))
  },
  playerTeams: {
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        filter: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([]))
        }))
      }))
    }))
  },
  players: {
    where: vi.fn(() => ({
      anyOf: vi.fn(() => ({
        filter: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([]))
        }))
      }))
    }))
  }
};

// Mock the database module
vi.mock('../../../src/db/indexedDB', () => ({
  db: mockDb
}));

// Mock the data layer
const mockTeamsDataLayer = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
};

vi.mock('../../../src/services/dataLayer', () => ({
  teamsDataLayer: mockTeamsDataLayer
}));

// Mock auth API
vi.mock('../../../src/services/api/authApi', () => ({
  authApi: {
    isAuthenticated: vi.fn(() => true)
  }
}));

// Mock guest quota
vi.mock('../../../src/utils/guestQuota', () => ({
  canCreateTeam: vi.fn(() => Promise.resolve({ ok: true }))
}));

// Mock API client for getTeamSquad
vi.mock('../../../src/services/api/baseApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

describe('Teams API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeams.length = 0;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getTeams', () => {
    it('should fetch teams from local database with default pagination', async () => {
      mockTeams.push(
        {
          id: 'team-1',
          name: 'Test Team 1',
          homeKitPrimary: '#FF0000',
          homeKitSecondary: '#FFFFFF',
          createdAt: new Date().toISOString(),
          createdByUserId: 'user-1',
          isDeleted: false,
          isOpponent: false
        },
        {
          id: 'team-2',
          name: 'Test Team 2',
          homeKitPrimary: '#0000FF',
          homeKitSecondary: '#FFFFFF',
          createdAt: new Date().toISOString(),
          createdByUserId: 'user-1',
          isDeleted: false,
          isOpponent: false
        }
      );

      const result = await teamsApi.getTeams();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.hasMore).toBe(false);
    });

    it('should filter teams by search term', async () => {
      mockTeams.push(
        { id: 'team-1', name: 'Arsenal FC', isDeleted: false, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' },
        { id: 'team-2', name: 'Chelsea FC', isDeleted: false, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' }
      );

      const result = await teamsApi.getTeams({ search: 'Arsenal' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Arsenal FC');
    });

    it('should exclude soft-deleted teams', async () => {
      mockTeams.push(
        { id: 'team-1', name: 'Active Team', isDeleted: false, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' },
        { id: 'team-2', name: 'Deleted Team', isDeleted: true, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' }
      );

      const result = await teamsApi.getTeams();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Active Team');
    });

    it('should exclude opponent teams by default', async () => {
      mockTeams.push(
        { id: 'team-1', name: 'My Team', isDeleted: false, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' },
        { id: 'team-2', name: 'Opponent Team', isDeleted: false, isOpponent: true, createdAt: new Date().toISOString(), createdByUserId: 'user-1' }
      );

      const result = await teamsApi.getTeams();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('My Team');
    });

    it('should include opponent teams when includeOpponents is true', async () => {
      mockTeams.push(
        { id: 'team-1', name: 'My Team', isDeleted: false, isOpponent: false, createdAt: new Date().toISOString(), createdByUserId: 'user-1' },
        { id: 'team-2', name: 'Opponent Team', isDeleted: false, isOpponent: true, createdAt: new Date().toISOString(), createdByUserId: 'user-1' }
      );

      const result = await teamsApi.getTeams({ includeOpponents: true });

      expect(result.data).toHaveLength(2);
    });

    it('should handle pagination correctly', async () => {
      // Add 30 teams
      for (let i = 0; i < 30; i++) {
        mockTeams.push({
          id: `team-${i}`,
          name: `Team ${i.toString().padStart(2, '0')}`,
          isDeleted: false,
          isOpponent: false,
          createdAt: new Date().toISOString(),
          createdByUserId: 'user-1'
        });
      }

      const page1 = await teamsApi.getTeams({ page: 1, limit: 10 });
      expect(page1.data).toHaveLength(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.total).toBe(30);

      const page2 = await teamsApi.getTeams({ page: 2, limit: 10 });
      expect(page2.data).toHaveLength(10);
      expect(page2.hasMore).toBe(true);

      const page3 = await teamsApi.getTeams({ page: 3, limit: 10 });
      expect(page3.data).toHaveLength(10);
      expect(page3.hasMore).toBe(false);
    });
  });

  describe('getTeamById', () => {
    it('should fetch a specific team by ID', async () => {
      mockTeams.push({
        id: 'team-1',
        name: 'Test Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        createdAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        isOpponent: false
      });

      const result = await teamsApi.getTeamById('team-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('team-1');
      expect(result.data.name).toBe('Test Team');
    });

    it('should throw error for non-existent team', async () => {
      await expect(teamsApi.getTeamById('non-existent')).rejects.toThrow('Team not found');
    });

    it('should throw error for soft-deleted team', async () => {
      mockTeams.push({
        id: 'team-1',
        name: 'Deleted Team',
        isDeleted: true,
        createdAt: new Date().toISOString(),
        createdByUserId: 'user-1'
      });

      await expect(teamsApi.getTeamById('team-1')).rejects.toThrow('Team not found');
    });
  });

  describe('createTeam', () => {
    it('should create a new team via data layer', async () => {
      const teamData: TeamCreateRequest = {
        name: 'New Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF'
      };

      const mockCreatedTeam = {
        id: 'team-new',
        ...teamData,
        createdAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        isOpponent: false
      };

      mockTeamsDataLayer.create.mockResolvedValue(mockCreatedTeam);

      const result = await teamsApi.createTeam(teamData);

      expect(mockTeamsDataLayer.create).toHaveBeenCalledWith({
        name: 'New Team',
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: undefined,
        awayKitSecondary: undefined,
        logoUrl: undefined,
        isOpponent: undefined
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Team');
    });
  });

  describe('updateTeam', () => {
    it('should update a team via data layer', async () => {
      const updateData: TeamUpdateRequest = {
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00'
      };

      const mockUpdatedTeam = {
        id: 'team-1',
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00',
        homeKitSecondary: '#FFFFFF',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        isOpponent: false
      };

      mockTeamsDataLayer.update.mockResolvedValue(undefined);
      mockDb.teams.get.mockResolvedValue(mockUpdatedTeam);

      const result = await teamsApi.updateTeam('team-1', updateData);

      expect(mockTeamsDataLayer.update).toHaveBeenCalledWith('team-1', {
        name: 'Updated Team Name',
        homeKitPrimary: '#00FF00',
        homeKitSecondary: undefined,
        awayKitPrimary: undefined,
        awayKitSecondary: undefined,
        logoUrl: undefined,
        isOpponent: undefined
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Team Name');
    });
  });

  describe('deleteTeam', () => {
    it('should delete a team via data layer', async () => {
      mockTeamsDataLayer.delete.mockResolvedValue(undefined);

      const result = await teamsApi.deleteTeam('team-1');

      expect(mockTeamsDataLayer.delete).toHaveBeenCalledWith('team-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Team deleted');
    });
  });

  describe('getTeamPlayers', () => {
    it('should return empty array when no players', async () => {
      const result = await teamsApi.getTeamPlayers('team-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('getActiveTeamPlayers', () => {
    it('should return empty array when no active players', async () => {
      const result = await teamsApi.getActiveTeamPlayers('team-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
