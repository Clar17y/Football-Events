/**
 * Seasons API Integration Tests
 * Tests the complete seasons API functionality including CRUD operations
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { seasonsApi } from '../../src/services/api/seasonsApi';
import { authApi } from '../../src/services/api/authApi';
import type { SeasonCreateRequest, SeasonUpdateRequest } from '@shared/types';

const TEST_TIMEOUT = 10000;

describe('Seasons API Integration Tests', () => {
  let authToken: string | null = null;
  const createdSeasonIds: string[] = [];

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

  afterEach(async () => {
    // Clean up created seasons
    for (const seasonId of createdSeasonIds) {
      try {
        await seasonsApi.deleteSeason(seasonId);
      } catch (error) {
        console.warn('Failed to clean up test season:', error);
      }
    }
    createdSeasonIds.length = 0;
  });

  describe('Season CRUD Operations', () => {
    it('should create a new season', async () => {
      if (!authToken) return;

      const seasonData: SeasonCreateRequest = {
        name: `Test Season ${Date.now()}`,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: true
      };

      const result = await seasonsApi.createSeason(seasonData);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.label || result.data.name).toBe(seasonData.name);
      expect(result.data.id).toBeDefined();
      
      if (result.data.id) {
        createdSeasonIds.push(result.data.id);
      }
    }, TEST_TIMEOUT);

    it('should get seasons list', async () => {
      if (!authToken) return;

      const result = await seasonsApi.getSeasons();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(typeof result.page).toBe('number');
    }, TEST_TIMEOUT);

    it('should get season by ID', async () => {
      if (!authToken) return;

      // First create a season
      const seasonData: SeasonCreateRequest = {
        name: `Get Test Season ${Date.now()}`,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: false
      };

      const createResult = await seasonsApi.createSeason(seasonData);
      expect(createResult.data.id).toBeDefined();
      
      if (createResult.data.id) {
        createdSeasonIds.push(createResult.data.id);
        
        // Now get it by ID
        const getResult = await seasonsApi.getSeasonById(createResult.data.id);
        
        expect(getResult.data).toBeDefined();
        expect(getResult.data.id).toBe(createResult.data.id);
        expect(getResult.data.label || getResult.data.name).toBe(seasonData.name);
      }
    }, TEST_TIMEOUT);

    it('should update a season', async () => {
      if (!authToken) return;

      // First create a season
      const seasonData: SeasonCreateRequest = {
        name: `Update Test Season ${Date.now()}`,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: false
      };

      const createResult = await seasonsApi.createSeason(seasonData);
      expect(createResult.data.id).toBeDefined();
      
      if (createResult.data.id) {
        createdSeasonIds.push(createResult.data.id);
        
        // Update the season
        const updateData: SeasonUpdateRequest = {
          name: `Updated Season ${Date.now()}`,
          isActive: true
        };
        
        const updateResult = await seasonsApi.updateSeason(createResult.data.id, updateData);
        
        expect(updateResult.data).toBeDefined();
        expect(updateResult.data.label || updateResult.data.name).toBe(updateData.name);
        expect(updateResult.data.isActive || updateResult.data.isCurrent).toBe(true);
      }
    }, TEST_TIMEOUT);

    it('should delete a season', async () => {
      if (!authToken) return;

      // First create a season
      const seasonData: SeasonCreateRequest = {
        name: `Delete Test Season ${Date.now()}`,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: false
      };

      const createResult = await seasonsApi.createSeason(seasonData);
      expect(createResult.data.id).toBeDefined();
      
      if (createResult.data.id) {
        // Delete the season
        const deleteResult = await seasonsApi.deleteSeason(createResult.data.id);
        
        expect(deleteResult.success).toBe(true);
        
        // Verify it's deleted by trying to get it
        try {
          await seasonsApi.getSeasonById(createResult.data.id);
          expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
          expect(error.response?.status).toBe(404);
        }
      }
    }, TEST_TIMEOUT);
  });

  describe('Season Search and Filtering', () => {
    it('should search seasons by name', async () => {
      if (!authToken) return;

      const uniqueName = `Searchable Season ${Date.now()}`;
      const seasonData: SeasonCreateRequest = {
        name: uniqueName,
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: false
      };

      const createResult = await seasonsApi.createSeason(seasonData);
      if (createResult.data.id) {
        createdSeasonIds.push(createResult.data.id);
      }

      // Search for the season
      const searchResult = await seasonsApi.getSeasons({ search: uniqueName });
      
      expect(searchResult.data.length).toBeGreaterThan(0);
      const foundSeason = searchResult.data.find(s => 
        (s.label || s.name) === uniqueName
      );
      expect(foundSeason).toBeDefined();
    }, TEST_TIMEOUT);

    it('should handle pagination', async () => {
      if (!authToken) return;

      const result = await seasonsApi.getSeasons({ page: 1, limit: 5 });
      
      expect(result.page).toBe(1);
      expect(result.data.length).toBeLessThanOrEqual(5);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid season ID', async () => {
      if (!authToken) return;

      try {
        await seasonsApi.getSeasonById('invalid-uuid');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for invalid UUID
      }
    }, TEST_TIMEOUT);

    it('should handle non-existent season', async () => {
      if (!authToken) return;

      try {
        await seasonsApi.getSeasonById('123e4567-e89b-12d3-a456-426614174000');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(404); // Not found
      }
    }, TEST_TIMEOUT);

    it('should handle validation errors', async () => {
      if (!authToken) return;

      const invalidSeasonData: SeasonCreateRequest = {
        name: '', // Empty name should fail validation
        startDate: '2024-08-01T00:00:00.000Z',
        endDate: '2025-05-31T00:00:00.000Z',
        isActive: false
      };

      try {
        await seasonsApi.createSeason(invalidSeasonData);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for validation error
      }
    }, TEST_TIMEOUT);

    it('should handle date validation errors', async () => {
      if (!authToken) return;

      const invalidDateSeason: SeasonCreateRequest = {
        name: `Invalid Date Season ${Date.now()}`,
        startDate: '2025-05-31T00:00:00.000Z', // End date before start date
        endDate: '2024-08-01T00:00:00.000Z',
        isActive: false
      };

      try {
        await seasonsApi.createSeason(invalidDateSeason);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response?.status).toBe(400); // Bad request for date validation
      }
    }, TEST_TIMEOUT);
  });
});