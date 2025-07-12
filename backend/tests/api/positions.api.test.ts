/**
 * Positions API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Positions API using Supertest.
 * Positions are root entities with no foreign key dependencies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';

describe('Positions API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let createdPositionCodes: string[] = [];

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
    
    console.log('Positions API Tests: Database connected');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    createdPositionCodes = [];
  });

  afterEach(async () => {
    // Clean up created positions
    if (createdPositionCodes.length > 0) {
      try {
        await prisma.positions.deleteMany({
          where: { pos_code: { in: createdPositionCodes } }
        });
        console.log('Positions cleaned up successfully');
      } catch (error) {
        console.warn('Position cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/positions', () => {
    it('should create a position successfully', async () => {
      const positionData = {
        code: `T${Date.now().toString().slice(-6)}`, // Keep under 10 chars
        longName: 'Test Position'
      };
      
      const response = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      createdPositionCodes.push(response.body.code);
      
      expect(response.body).toMatchObject({
        code: positionData.code,
        longName: positionData.longName
      });
      
      console.log('Position created successfully:', response.body.code);
    });

    it('should create standard football positions', async () => {
      const timestamp = Date.now().toString().slice(-4); // Last 4 digits
      const standardPositions = [
        { code: `GK${timestamp}`, longName: 'Goalkeeper' },
        { code: `DF${timestamp}`, longName: 'Defender' },
        { code: `MD${timestamp}`, longName: 'Midfielder' },
        { code: `FW${timestamp}`, longName: 'Forward' }
      ];
      
      for (const positionData of standardPositions) {
        const response = await apiRequest
          .post('/api/v1/positions')
          .send(positionData)
          .expect(201);
        
        createdPositionCodes.push(response.body.code);
        
        expect(response.body).toMatchObject({
          code: positionData.code,
          longName: positionData.longName
        });
      }
      
      console.log(`Created ${standardPositions.length} standard positions`);
    });

    it('should validate required fields', async () => {
      const invalidPositionData = {
        longName: 'Missing Code Position'
        // Missing required code
      };
      
      const response = await apiRequest
        .post('/api/v1/positions')
        .send(invalidPositionData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // TODO: Add duplicate code test once API properly handles unique constraints
    it.skip('should handle duplicate position codes', async () => {
      const positionCode = `D${Date.now().toString().slice(-6)}`;
      const positionData = { 
        code: positionCode,
        longName: 'Duplicate Position'
      };
      
      // Create first position
      const firstResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      createdPositionCodes.push(firstResponse.body.code);
      
      // Try to create duplicate - should return 409 Conflict
      const duplicateResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(409);
      
      expect(duplicateResponse.body.error || duplicateResponse.body.message).toBeDefined();
      console.log('Duplicate code validation working');
    });
  });

  describe('GET /api/v1/positions', () => {
    it('should return paginated positions', async () => {
      const response = await apiRequest
        .get('/api/v1/positions')
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
      
      console.log('Pagination working, total positions:', response.body.pagination.total);
    });

    it('should support search functionality', async () => {
      // Create a test position first
      const positionData = {
        code: `S${Date.now().toString().slice(-6)}`,
        longName: 'Searchable Goalkeeper Position'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      createdPositionCodes.push(createResponse.body.code);
      
      // Search for the position
      const searchTerm = 'Goalkeeper';
      const response = await apiRequest
        .get(`/api/v1/positions?search=${searchTerm}`)
        .expect(200);
      
      // Should find our position
      const foundPosition = response.body.data.find((position: any) => position.code === createResponse.body.code);
      expect(foundPosition).toBeDefined();
      
      console.log('Search functionality working, found positions:', response.body.data.length);
    });
  });

  describe('GET /api/v1/positions/:code', () => {
    // ENABLED: Route now uses position codes instead of UUIDs
    it('should return a specific position', async () => {
      // Create position first
      const positionData = {
        code: `SP${Date.now().toString().slice(-5)}`,
        longName: 'Specific Position'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      createdPositionCodes.push(createResponse.body.code);
      
      // Get the specific position
      const response = await apiRequest
        .get(`/api/v1/positions/${createResponse.body.code}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        code: createResponse.body.code,
        longName: positionData.longName
      });
      
      console.log('Specific position retrieval working');
    });

    // ENABLED: Route now uses position codes instead of UUIDs
    it('should return 404 for non-existent position', async () => {
      const nonExistentCode = `NE${Date.now().toString().slice(-5)}`;
      
      const response = await apiRequest
        .get(`/api/v1/positions/${nonExistentCode}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent position');
    });
  });

  describe('PUT /api/v1/positions/:code', () => {
    // ENABLED: Route now uses position codes instead of UUIDs
    it('should update a position', async () => {
      // Create position first
      const positionData = {
        code: `U${Date.now().toString().slice(-6)}`,
        longName: 'Updatable Position'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      createdPositionCodes.push(createResponse.body.code);
      
      // Update the position
      const updateData = {
        longName: 'Updated Position Name'
      };
      
      const response = await apiRequest
        .put(`/api/v1/positions/${createResponse.body.code}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        code: createResponse.body.code,
        longName: updateData.longName
      });
      
      console.log('Position update working');
    });
  });

  describe('DELETE /api/v1/positions/:code', () => {
    // ENABLED: Route now uses position codes instead of UUIDs
    it('should delete a position', async () => {
      // Create position first
      const positionData = {
        code: `D${Date.now().toString().slice(-6)}`,
        longName: 'Deletable Position'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/positions')
        .send(positionData)
        .expect(201);
      
      // Delete the position
      await apiRequest
        .delete(`/api/v1/positions/${createResponse.body.code}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/positions/${createResponse.body.code}`)
        .expect(404);
      
      console.log('Position deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    // ENABLED: Route now uses position codes instead of UUIDs
    it('should return 404 when deleting non-existent position', async () => {
      const nonExistentCode = `NX${Date.now().toString().slice(-5)}`;
      
      const response = await apiRequest
        .delete(`/api/v1/positions/${nonExistentCode}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for position deletion');
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple position creation', async () => {
      const positionCount = 5;
      const timestamp = Date.now().toString().slice(-4);
      const positions = Array.from({ length: positionCount }, (_, i) => ({
        code: `P${i + 1}${timestamp}`,
        longName: `Performance Position ${i + 1}`
      }));
      
      const startTime = Date.now();
      
      const promises = positions.map(position =>
        apiRequest.post('/api/v1/positions').send(position)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        createdPositionCodes.push(response.body.code);
      });
      
      const avgTime = totalTime / positionCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per position
      
      console.log(`${positionCount} positions created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});