/**
 * Comprehensive Frontend API Integration Tests
 * Tests all frontend API services together to ensure they work cohesively
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authApi } from '../../src/services/api/authApi';
import { teamsApi } from '../../src/services/api/teamsApi';
import { seasonsApi } from '../../src/services/api/seasonsApi';
import { playersApi } from '../../src/services/api/playersApi';
import { matchesApi } from '../../src/services/api/matchesApi';
import type { 
  TeamCreateRequest, 
  SeasonCreateRequest, 
  PlayerCreateRequest 
} from '@shared/types';

const TEST_TIMEOUT = 15000;

describe('All APIs Integration Tests', () => {
  let authToken: string | null = null;
  const testData = {
    teamIds: [] as string[],
    seasonIds: [] as string[],
    playerIds: [] as string[]
  };

  beforeAll(async () => {
    // Login with test user
    try {
      const loginResult = await authApi.login({
        email: 'test@example.com',
        password: 'password123'
      });
      authToken = loginResult.data?.access_token || null;
      console.log('Authentication successful');
    } catch (error) {
      console.warn('Could not authenticate test user. Tests will be skipped.');
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up all test data
    console.log('Cleaning up test data...');
    
    // Clean up players
    for (const playerId of testData.playerIds) {
      try {
        await playersApi.deletePlayer(playerId);
      } catch (error) {
        console.warn('Failed to clean up player:', playerId);
      }
    }

    // Clean up seasons
    for (const seasonId of testData.seasonIds) {
      try {
        await seasonsApi.deleteSeason(seasonId);
      } catch (error) {
        console.warn('Failed to clean up season:', seasonId);
      }
    }

    // Clean up teams
    for (const teamId of testData.teamIds) {
      try {
        await teamsApi.deleteTeam(teamId);
      } catch (error) {
        console.warn('Failed to clean up team:', teamId);
      }
    }

    console.log('Cleanup completed');
  });

  describe('Cross-API Workflow Tests', () => {
    it('should create a complete football management workflow', async () => {
      if (!authToken) return;

      const timestamp = Date.now();

      // 1. Create a team
      console.log('Creating team...');
      const teamData: TeamCreateRequest = {
        name: `Integration Test Team ${timestamp}`,
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#0000FF',
        awayKitSecondary: '#FFFFFF'
      };

      const teamResult = await teamsApi.createTeam(teamData);
      expect(teamResult.success).toBe(true);
      expect(teamResult.data.id).toBeDefined();
      testData.teamIds.push(teamResult.data.id!);
      console.log('Team created:', teamResult.data.name);

      // 2. Create a season
      console.log('Creating season...');
      const seasonData: SeasonCreateRequest = {
        name: `Integration Test Season ${timestamp}`,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: true
      };

      const seasonResult = await seasonsApi.createSeason(seasonData);
      expect(seasonResult.success).toBe(true);
      expect(seasonResult.data.id).toBeDefined();
      testData.seasonIds.push(seasonResult.data.id!);
      console.log('Season created:', seasonResult.data.label || seasonResult.data.name);

      // 3. Create players
      console.log('Creating players...');
      const playerData: PlayerCreateRequest = {
        name: `Integration Test Player ${timestamp}`,
        dateOfBirth: '1995-01-15',
        position: 'Forward',
        kitNumber: 10,
        email: `testplayer${timestamp}@example.com`
      };

      const playerResult = await playersApi.createPlayer(playerData);
      expect(playerResult.success).toBe(true);
      expect(playerResult.data.id).toBeDefined();
      testData.playerIds.push(playerResult.data.id!);
      console.log('Player created:', playerResult.data.name);

      console.log('Complete workflow test passed');
    }, TEST_TIMEOUT);

    it('should handle search across all APIs', async () => {
      if (!authToken) return;

      const searchTerm = 'Integration';

      // Search teams
      const teamsSearch = await teamsApi.getTeams({ search: searchTerm });
      expect(Array.isArray(teamsSearch.data)).toBe(true);

      // Search seasons
      const seasonsSearch = await seasonsApi.getSeasons({ search: searchTerm });
      expect(Array.isArray(seasonsSearch.data)).toBe(true);

      // Search players
      const playersSearch = await playersApi.getPlayers({ search: searchTerm });
      expect(Array.isArray(playersSearch.data)).toBe(true);

      // Search matches
      const matchesSearch = await matchesApi.getMatches({ search: searchTerm });
      expect(Array.isArray(matchesSearch.data)).toBe(true);

      console.log('Search functionality works across all APIs');
    }, TEST_TIMEOUT);
  });

  describe('Error Handling Consistency', () => {
    it('should handle authentication errors consistently', async () => {
      // Temporarily clear authentication
      authApi.clearToken();

      const apis = [
        () => teamsApi.getTeams(),
        () => seasonsApi.getSeasons(),
        () => playersApi.getPlayers(),
        () => matchesApi.getMatches()
      ];

      for (const apiCall of apis) {
        try {
          await apiCall();
          expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
          expect(error.status).toBe(401);
        }
      }

      // Restore auth by re-logging in
      try {
        const loginResult = await authApi.login({
          email: 'test@example.com',
          password: 'password123'
        });
        authToken = loginResult.data?.access_token || null;
      } catch (error) {
        console.warn('Failed to restore authentication');
      }

      console.log('Authentication errors handled consistently');
    }, TEST_TIMEOUT);

    it('should handle invalid UUIDs consistently', async () => {
      if (!authToken) return;

      const invalidUuid = 'invalid-uuid';

      const apiCalls = [
        () => teamsApi.getTeamById(invalidUuid),
        () => seasonsApi.getSeasonById(invalidUuid),
        () => playersApi.getPlayerById(invalidUuid),
        () => matchesApi.getMatchesBySeason(invalidUuid),
        () => matchesApi.getMatchesByTeam(invalidUuid)
      ];

      for (const apiCall of apiCalls) {
        try {
          await apiCall();
          expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
          expect(error.response?.status).toBe(400); // Bad request for invalid UUID
        }
      }

      console.log('Invalid UUID errors handled consistently');
    }, TEST_TIMEOUT);
  });
});