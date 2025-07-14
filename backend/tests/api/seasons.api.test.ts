/**
 * Seasons API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Seasons API using Supertest.
 * Seasons are root entities with no foreign key dependencies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { SeasonService } from '../../src/services/SeasonService';

describe('Seasons API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let createdSeasonIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    });
    
    await prisma.$connect();
    apiRequest = request(app);
    
    console.log('Seasons API Tests: Database connected');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    createdSeasonIds = [];
  });

  afterEach(async () => {
    // Clean up created seasons
    if (createdSeasonIds.length > 0) {
      try {
        await prisma.seasons.deleteMany({
          where: { season_id: { in: createdSeasonIds } }
        });
        console.log('Seasons cleaned up successfully');
      } catch (error) {
        console.warn('Season cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/seasons', () => {
    it('should create a season successfully', async () => {
      const currentYear = new Date().getFullYear();
      const seasonData = {
        label: `${currentYear}/${currentYear + 1} Test Season`,
        startDate: new Date(`${currentYear}-08-01`).toISOString(),
        endDate: new Date(`${currentYear + 1}-05-31`).toISOString(),
        isCurrent: false,
        description: 'Test season for API validation'
      };
      
      const response = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(response.body.seasonId);
      
      expect(response.body).toMatchObject({
        seasonId: expect.any(String),
        label: seasonData.label,
        startDate: expect.any(String),
        endDate: expect.any(String),
        isCurrent: false
      });
      
      console.log('Season created successfully:', response.body.seasonId);
    });

    it('should validate required fields', async () => {
      const invalidSeasonData = {}; // Missing required label
      
      const response = await apiRequest
        .post('/api/v1/seasons')
        .send(invalidSeasonData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // TODO: Add duplicate label test once API properly handles unique constraints
    it.skip('should handle duplicate season labels', async () => {
      const seasonLabel = `Duplicate Season ${Date.now()}`;
      const seasonData = { label: seasonLabel };
      
      // Create first season
      const firstResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(firstResponse.body.id);
      
      // Try to create duplicate - should return 409 Conflict
      const duplicateResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(409);
      
      expect(duplicateResponse.body.error || duplicateResponse.body.message).toBeDefined();
      console.log('Duplicate label validation working');
    });
  });

  describe('GET /api/v1/seasons/current', () => {
    it('should return 404 when no current season exists', async () => {
      const response = await apiRequest
        .get('/api/v1/seasons/current')
        .expect(404);

      expect(response.body).toEqual({
        error: 'No current season found',
        message: 'No active season found for the current date'
      });
    });

    it('should return current season when marked with is_current flag', async () => {
      // Create a season marked as current
      const currentSeasonData = {
        label: 'Current Test Season 2024/25',
        start_date: new Date('2024-08-01'),
        end_date: new Date('2025-05-31'),
        is_current: true,
        description: 'Test current season'
      };

      const createdSeason = await prisma.seasons.create({
        data: currentSeasonData
      });
      createdSeasonIds.push(createdSeason.season_id);

      const response = await apiRequest
        .get('/api/v1/seasons/current')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        season: expect.objectContaining({
          seasonId: createdSeason.season_id,
          label: currentSeasonData.label,
          startDate: currentSeasonData.start_date.toISOString().split('T')[0],
          endDate: currentSeasonData.end_date.toISOString().split('T')[0],
          isCurrent: true,
          description: currentSeasonData.description
        })
      });
    });

    it('should return current season by date range when no is_current flag set', async () => {
      // Create a season that covers today's date but not marked as current
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1); // Last month
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 28); // Next month

      const seasonData = {
        label: 'Date Range Test Season',
        start_date: startDate,
        end_date: endDate,
        is_current: false,
        description: 'Season detected by date range'
      };

      const createdSeason = await prisma.seasons.create({
        data: seasonData
      });
      createdSeasonIds.push(createdSeason.season_id);

      const response = await apiRequest
        .get('/api/v1/seasons/current')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        season: expect.objectContaining({
          seasonId: createdSeason.season_id,
          label: seasonData.label,
          isCurrent: false
        })
      });
    });

    it('should prioritize is_current flag over date range', async () => {
      // Create two seasons: one with date range covering today, one marked as current
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 28);

      // Season 1: Covers today's date but not marked current
      const dateRangeSeason = await prisma.seasons.create({
        data: {
          label: 'Date Range Season',
          start_date: startDate,
          end_date: endDate,
          is_current: false
        }
      });
      createdSeasonIds.push(dateRangeSeason.season_id);

      // Season 2: Marked as current but different date range
      const currentSeason = await prisma.seasons.create({
        data: {
          label: 'Flagged Current Season',
          start_date: new Date('2023-08-01'),
          end_date: new Date('2024-05-31'),
          is_current: true
        }
      });
      createdSeasonIds.push(currentSeason.season_id);

      const response = await apiRequest
        .get('/api/v1/seasons/current')
        .expect(200);

      // Should return the season marked as current, not the one with date range
      expect(response.body.season.seasonId).toBe(currentSeason.season_id);
      expect(response.body.season.label).toBe('Flagged Current Season');
    });

    it('should handle database errors gracefully', async () => {
      // Mock the SeasonService.getCurrentSeason method to throw a database error
      const originalGetCurrentSeason = SeasonService.prototype.getCurrentSeason;
      
      // Create a spy that throws a database error
      const getCurrentSeasonSpy = vi.spyOn(SeasonService.prototype, 'getCurrentSeason')
        .mockRejectedValue(new Error('Database connection error'));

      try {
        const response = await apiRequest
          .get('/api/v1/seasons/current')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Failed to fetch current season',
          message: 'Unable to retrieve current season information'
        });

        // Verify the mock was called
        expect(getCurrentSeasonSpy).toHaveBeenCalledOnce();
      } finally {
        // Restore original method
        getCurrentSeasonSpy.mockRestore();
      }
    });
  });

  describe('GET /api/v1/seasons', () => {
    it('should return paginated seasons', async () => {
      const response = await apiRequest
        .get('/api/v1/seasons')
        .expect(200);
      
      expect(response.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
          totalPages: expect.any(Number),
          hasNext: expect.any(Boolean),
          hasPrev: expect.any(Boolean)
        }
      });
      
      console.log('Pagination working, total seasons:', response.body.pagination.total);
    });

    it('should support search functionality', async () => {
      // Create a test season first
      const seasonData = {
        label: `Searchable 2024/25 Season ${Date.now()}`,
        startDate: new Date('2024-08-01').toISOString(),
        endDate: new Date('2025-05-31').toISOString(),
        isCurrent: false
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.seasonId);
      
      // Search for the season
      const searchTerm = '2024';
      const response = await apiRequest
        .get(`/api/v1/seasons?search=${searchTerm}`)
        .expect(200);
      
      // Should find our season
      const foundSeason = response.body.data.find((season: any) => season.seasonId === createResponse.body.seasonId);
      expect(foundSeason).toBeDefined();
      
      console.log('Search functionality working, found seasons:', response.body.data.length);
    });
  });

  describe('GET /api/v1/seasons/:id', () => {
    it('should return a specific season', async () => {
      // Create season first
      const seasonData = {
        label: `Specific Season ${Date.now()}`,
        startDate: new Date('2024-08-01').toISOString(),
        endDate: new Date('2025-05-31').toISOString()
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.seasonId);
      
      // Get the specific season
      const response = await apiRequest
        .get(`/api/v1/seasons/${createResponse.body.seasonId}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        seasonId: createResponse.body.seasonId,
        label: seasonData.label
      });
      
      console.log('Specific season retrieval working');
    });

    it('should return 404 for non-existent season', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .get(`/api/v1/seasons/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent season');
    });
  });

  describe('PUT /api/v1/seasons/:id', () => {
    it('should update a season', async () => {
      // Create season first
      const seasonData = {
        label: `Updatable Season ${Date.now()}`,
        startDate: new Date('2024-08-01').toISOString(),
        endDate: new Date('2025-05-31').toISOString(),
        isCurrent: false,
        description: 'Original description'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.seasonId);
      
      // Update the season
      const updateData = {
        label: `Updated Season ${Date.now()}`,
        description: 'Updated description'
      };
      
      const response = await apiRequest
        .put(`/api/v1/seasons/${createResponse.body.seasonId}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        seasonId: createResponse.body.seasonId,
        label: updateData.label,
        description: updateData.description
      });
      
      console.log('Season update working');
    });
  });

  describe('DELETE /api/v1/seasons/:id', () => {
    it('should delete a season', async () => {
      // Create season first
      const seasonData = {
        label: `Deletable Season ${Date.now()}`,
        startDate: new Date('2024-08-01').toISOString(),
        endDate: new Date('2025-05-31').toISOString(),
        isCurrent: false
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      // Delete the season
      await apiRequest
        .delete(`/api/v1/seasons/${createResponse.body.seasonId}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/seasons/${createResponse.body.seasonId}`)
        .expect(404);
      
      console.log('Season deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent season', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/seasons/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for season deletion');
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple season creation', async () => {
      const seasonCount = 5;
      const currentYear = new Date().getFullYear();
      const seasons = Array.from({ length: seasonCount }, (_, i) => ({
        label: `Performance Season ${currentYear + i}/${currentYear + i + 1} ${Date.now()}`,
        startDate: new Date(`${currentYear + i}-08-01`).toISOString(),
        endDate: new Date(`${currentYear + i + 1}-05-31`).toISOString(),
        isCurrent: false,
        description: `Performance test season ${i + 1}`
      }));
      
      const startTime = Date.now();
      
      const promises = seasons.map(season =>
        apiRequest.post('/api/v1/seasons').send(season)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        createdSeasonIds.push(response.body.seasonId);
      });
      
      const avgTime = totalTime / seasonCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per season
      
      console.log(`${seasonCount} seasons created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});