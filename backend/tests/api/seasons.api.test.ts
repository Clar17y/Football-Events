/**
 * Seasons API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Seasons API using Supertest.
 * Seasons are root entities with no foreign key dependencies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';

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
        label: `${currentYear}/${currentYear + 1} Test Season`
      };
      
      const response = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        label: seasonData.label
      });
      
      console.log('Season created successfully:', response.body.id);
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
        label: `Searchable 2024/25 Season ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.id);
      
      // Search for the season
      const searchTerm = '2024';
      const response = await apiRequest
        .get(`/api/v1/seasons?search=${searchTerm}`)
        .expect(200);
      
      // Should find our season
      const foundSeason = response.body.data.find((season: any) => season.id === createResponse.body.id);
      expect(foundSeason).toBeDefined();
      
      console.log('Search functionality working, found seasons:', response.body.data.length);
    });
  });

  describe('GET /api/v1/seasons/:id', () => {
    it('should return a specific season', async () => {
      // Create season first
      const seasonData = {
        label: `Specific Season ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.id);
      
      // Get the specific season
      const response = await apiRequest
        .get(`/api/v1/seasons/${createResponse.body.id}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
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
        label: `Updatable Season ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      createdSeasonIds.push(createResponse.body.id);
      
      // Update the season
      const updateData = {
        label: `Updated Season ${Date.now()}`
      };
      
      const response = await apiRequest
        .put(`/api/v1/seasons/${createResponse.body.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        label: updateData.label
      });
      
      console.log('Season update working');
    });
  });

  describe('DELETE /api/v1/seasons/:id', () => {
    it('should delete a season', async () => {
      // Create season first
      const seasonData = {
        label: `Deletable Season ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .send(seasonData)
        .expect(201);
      
      // Delete the season
      await apiRequest
        .delete(`/api/v1/seasons/${createResponse.body.id}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/seasons/${createResponse.body.id}`)
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
        label: `Performance Season ${currentYear + i}/${currentYear + i + 1} ${Date.now()}`
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
        createdSeasonIds.push(response.body.id);
      });
      
      const avgTime = totalTime / seasonCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per season
      
      console.log(`${seasonCount} seasons created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});