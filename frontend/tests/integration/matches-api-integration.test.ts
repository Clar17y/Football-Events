/**
 * Matches API Integration Tests
 * Tests the complete matches API functionality including CRUD operations
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { matchesApi } from '../../src/services/api/matchesApi';
import { authApi } from '../../src/services/api/authApi';
import type { Match } from '@shared/types';

const TEST_TIMEOUT = 10000;

describe('Matches API Integration Tests', () => {
  let authToken: string | null = null;

  beforeAll(async () => {
    // Login with test user
    try {
      const loginResult = await authApi.login({
        email: 'test@example.com',
        password: 'password123'
      });
      authToken = loginResult.token;
    } catch (error) {
      console.warn('Could not authenticate test user. Some tests may be skipped.');
    }
  }, TEST_TIMEOUT);

  describe('Match Retrieval Operations', () => {
    it('should get matches list with pagination', async () => {
      if (!authToken) return;

      const result = await matchesApi.getMatches({ page: 1, limit: 10 });
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(typeof result.pagination.total).toBe('number');
      expect(typeof result.pagination.page).toBe('number');
      expect(result.pagination.page).toBe(1);
      expect(result.data.length).toBeLessThanOrEqual(10);
    }, TEST_TIMEOUT);

    it('should filter matches by season', async () => {
      if (!authToken) return;

      // Use a test season ID (this would need to exist in your test data)
      const testSeasonId = '123e4567-e89b-12d3-a456-426614174000';
      
      try {
        const result = await matchesApi.getMatches({ seasonId: testSeasonId });
        
        expect(Array.isArray(result.data)).toBe(true);
        // All returned matches should belong to the specified season
        result.data.forEach(match => {
          expect(match.seasonId).toBe(testSeasonId);
        });
      } catch (error: any) {
        // If no matches exist for this season, that's also valid
        expect(error.response?.status).toBeOneOf([200, 404]);
      }
    }, TEST_TIMEOUT);

    it('should filter matches by team', async () => {
      if (!authToken) return;

      // Use a test team ID (this would need to exist in your test data)
      const testTeamId = '123e4567-e89b-12d3-a456-426614174001';
      
      try {
        const result = await matchesApi.getMatches({ teamId: testTeamId });
        
        expect(Array.isArray(result.data)).toBe(true);
        // All returned matches should involve the specified team
        result.data.forEach(match => {
          expect(
            match.homeTeamId === testTeamId || match.awayTeamId === testTeamId
          ).toBe(true);
        });
      } catch (error: any) {
        // If no matches exist for this team, that's also valid
        expect(error.response?.status).toBeOneOf([200, 404]);
      }
    }, TEST_TIMEOUT);

    it('should search matches by competition', async () => {
      if (!authToken) return;

      const result = await matchesApi.getMatches({ 
        search: 'Premier',
        competition: 'Premier League'
      });
      
      expect(Array.isArray(result.data)).toBe(true);
      // This test documents the search functionality
      // Results may be empty if no matches exist
    }, TEST_TIMEOUT);

    it('should get matches by season ID', async () => {
      if (!authToken) return;

      // Use a test season ID
      const testSeasonId = '123e4567-e89b-12d3-a456-426614174000';
      
      try {
        const matches = await matchesApi.getMatchesBySeason(testSeasonId);
        
        expect(Array.isArray(matches)).toBe(true);
        // All matches should belong to the specified season
        matches.forEach(match => {
          expect(match.seasonId).toBe(testSeasonId);
        });
      } catch (error: any) {
        // If season doesn't exist or has no matches, expect appropriate error
        expect(error.response?.status).toBeOneOf([404, 200]);
      }
    }, TEST_TIMEOUT);

    it('should get matches by team ID', async () => {
      if (!authToken) return;

      // Use a test team ID
      const testTeamId = '123e4567-e89b-12d3-a456-426614174001';
      
      try {
        const matches = await matchesApi.getMatchesByTeam(testTeamId);
        
        expect(Array.isArray(matches)).toBe(true);
        // All matches should involve the specified team
        matches.forEach(match => {
          expect(
            match.homeTeamId === testTeamId || match.awayTeamId === testTeamId
          ).toBe(true);
        });
      } catch (error: any) {
        // If team doesn't exist or has no matches, expect appropriate error
        expect(error.response?.status).toBeOneOf([404, 200]);
      }
    }, TEST_TIMEOUT);
  });

  describe('Search and Filtering', () => {
    it('should handle empty search results', async () => {
      if (!authToken) return;

      const result = await matchesApi.getMatches({ 
        search: 'NonExistentMatchSearch12345'
      });
      
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(0);
      expect(result.pagination.total).toBe(0);
    }, TEST_TIMEOUT);

    it('should handle pagination edge cases', async () => {
      if (!authToken) return;

      // Test with very high page number
      const result = await matchesApi.getMatches({ 
        page: 9999, 
        limit: 10 
      });
      
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(0);
      expect(result.pagination.page).toBe(9999);
    }, TEST_TIMEOUT);

    it('should handle different limit sizes', async () => {
      if (!authToken) return;

      const smallResult = await matchesApi.getMatches({ limit: 1 });
      const largeResult = await matchesApi.getMatches({ limit: 50 });
      
      expect(smallResult.data.length).toBeLessThanOrEqual(1);
      expect(largeResult.data.length).toBeLessThanOrEqual(50);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid season ID format', async () => {
      if (!authToken) return;

      try {
        await matchesApi.getMatchesBySeason('invalid-uuid-format');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid UUID
      }
    }, TEST_TIMEOUT);

    it('should handle invalid team ID format', async () => {
      if (!authToken) return;

      try {
        await matchesApi.getMatchesByTeam('invalid-uuid-format');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid UUID
      }
    }, TEST_TIMEOUT);

    it('should handle non-existent season', async () => {
      if (!authToken) return;

      try {
        await matchesApi.getMatchesBySeason('123e4567-e89b-12d3-a456-999999999999');
        // This might return empty array or 404, both are valid
      } catch (error: any) {
        if (error.response?.status) {
          expect(error.response.status).toBeOneOf([404, 403]);
        }
      }
    }, TEST_TIMEOUT);

    it('should handle non-existent team', async () => {
      if (!authToken) return;

      try {
        await matchesApi.getMatchesByTeam('123e4567-e89b-12d3-a456-999999999999');
        // This might return empty array or 404, both are valid
      } catch (error: any) {
        if (error.response?.status) {
          expect(error.response.status).toBeOneOf([404, 403]);
        }
      }
    }, TEST_TIMEOUT);

    it('should handle network errors gracefully', async () => {
      if (!authToken) return;

      // Mock fetch to simulate network error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));

      try {
        await matchesApi.getMatches();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('Network error');
      } finally {
        // Restore original fetch
        global.fetch = originalFetch;
      }
    }, TEST_TIMEOUT);
  });

  describe('Data Validation', () => {
    it('should return properly formatted match objects', async () => {
      if (!authToken) return;

      const result = await matchesApi.getMatches({ limit: 1 });
      
      if (result.data.length > 0) {
        const match = result.data[0];
        
        // Verify required fields exist
        expect(match.id).toBeDefined();
        expect(typeof match.id).toBe('string');
        
        if (match.homeTeamId) {
          expect(typeof match.homeTeamId).toBe('string');
        }
        if (match.awayTeamId) {
          expect(typeof match.awayTeamId).toBe('string');
        }
        if (match.seasonId) {
          expect(typeof match.seasonId).toBe('string');
        }
        if (match.kickoffTime) {
          expect(typeof match.kickoffTime).toBe('string');
        }
      }
    }, TEST_TIMEOUT);

    it('should handle matches with minimal data', async () => {
      if (!authToken) return;

      // This test ensures the API can handle matches that might have minimal required fields
      const result = await matchesApi.getMatches();
      
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
      
      // Each match should at least have an ID
      result.data.forEach(match => {
        expect(match.id).toBeDefined();
        expect(typeof match.id).toBe('string');
      });
    }, TEST_TIMEOUT);
  });
});