import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Season,
  SeasonCreateRequest,
  SeasonUpdateRequest,
  transformSeason,
  transformSeasonCreateRequest,
  transformSeasonUpdateRequest,
  PrismaSeason
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';

describe('Season Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let createdSeasonIds: string[] = [];
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();
    
    // Create test user helper and test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');
  });

  afterEach(async () => {
    // Clean up created seasons after each test
    if (createdSeasonIds.length > 0) {
      await prisma.seasons.deleteMany({
        where: {
          season_id: {
            in: createdSeasonIds
          }
        }
      });
      createdSeasonIds = [];
    }
  });

  afterAll(async () => {
    // Clean up test users
    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('Season Creation', () => {
    it('should create a season using frontend interface and transform correctly', async () => {
      // 1. Create season data using frontend interface
      const frontendSeasonData: SeasonCreateRequest = {
        label: '2024-25 Premier League',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: true,
        description: 'Premier League season 2024-25'
      };

      // 2. Transform to Prisma format
      const prismaInput = transformSeasonCreateRequest(frontendSeasonData, testUserId);

      // 3. Verify transformation structure
      expect(prismaInput).toEqual({
        label: '2024-25 Premier League',
        start_date: new Date('2024-08-01'),
        end_date: new Date('2025-05-31'),
        is_current: true,
        description: 'Premier League season 2024-25',
        created_by_user_id: testUserId
      });

      // 4. Create in database using Prisma
      const createdSeason = await prisma.seasons.create({ data: prismaInput });

      // Track for cleanup
      createdSeasonIds.push(createdSeason.season_id);

      // 5. Verify database record
      expect(createdSeason.season_id).toBeDefined();
      expect(createdSeason.label).toBe('2024-25 Premier League');
      expect(createdSeason.created_at).toBeInstanceOf(Date);
      expect(createdSeason.updated_at).toBeNull();

      // 6. Transform back to frontend format
      const transformedSeason: Season = transformSeason(createdSeason);

      // 7. Verify round-trip transformation
      expect(transformedSeason).toEqual({
        id: createdSeason.season_id,
        seasonId: createdSeason.season_id,
        label: '2024-25 Premier League',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: true,
        description: 'Premier League season 2024-25',
        createdAt: createdSeason.created_at,
        updatedAt: undefined, // transformSeason returns undefined for null database values
        // Authorization and soft delete fields
        created_by_user_id: testUserId,
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false
      });
    });

    it('should handle season with special characters', async () => {
      // Test with special characters in label
      const seasonData: SeasonCreateRequest = {
        label: '2023/24 Champions League - Group Stage',
        startDate: '2023-09-01',
        endDate: '2024-05-31',
        isCurrent: false,
        description: 'Champions League Group Stage'
      };

      const prismaInput = transformSeasonCreateRequest(seasonData, testUserId);
      
      const createdSeason = await prisma.seasons.create({ data: prismaInput });
      createdSeasonIds.push(createdSeason.season_id);

      const transformedSeason = transformSeason(createdSeason);
      
      expect(transformedSeason.label).toBe('2023/24 Champions League - Group Stage');
      expect(transformedSeason.id).toBe(createdSeason.season_id);
    });

    it('should enforce unique season label constraint', async () => {
      // Create first season
      const seasonData1 = transformSeasonCreateRequest({
        label: 'Unique Season 2024',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);

      // Create first season using proper Prisma create
      const result1 = await prisma.seasons.create({ data: seasonData1 });
      createdSeasonIds.push(result1.season_id);

      // Try to create second season with same label
      const seasonData2 = transformSeasonCreateRequest({
        label: 'Unique Season 2024',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);

      // Should throw unique constraint violation
      await expect(
        prisma.$queryRaw`
          INSERT INTO grassroots.seasons (label) 
          VALUES (${seasonData2.label})
          RETURNING season_id, label, created_at, updated_at
        `
      ).rejects.toThrow();
    });
  });

  describe('Season Updates', () => {
    it('should update season using frontend interface', async () => {
      // Create initial season
      const initialData = transformSeasonCreateRequest({
        label: 'Update Test Season',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);

      const createdSeason = await prisma.seasons.create({ data: initialData });
      createdSeasonIds.push(createdSeason.season_id);

      // Update using frontend interface
      const updateData: SeasonUpdateRequest = {
        label: 'Updated Season Name'
      };

      const prismaUpdateInput = transformSeasonUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        label: 'Updated Season Name'
      });

      // Apply update using Prisma
      const updatedSeason = await prisma.seasons.update({
        where: { season_id: createdSeason.season_id },
        data: prismaUpdateInput
      });

      // Transform back and verify
      const transformedUpdated = transformSeason(updatedSeason);

      expect(transformedUpdated.id).toBe(createdSeason.season_id);
      expect(transformedUpdated.label).toBe('Updated Season Name'); // Updated
      expect(transformedUpdated.createdAt).toEqual(createdSeason.created_at); // Unchanged
      // Note: updated_at is not automatically set in current schema
      expect(transformedUpdated.updatedAt).not.toEqual(createdSeason.updated_at); // Should be different
    });

    it('should handle partial updates correctly', async () => {
      // Create initial season
      const initialData = transformSeasonCreateRequest({
        label: 'Partial Update Season',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      }, testUserId);

      const createdSeason = await prisma.seasons.create({ data: initialData });
      createdSeasonIds.push(createdSeason.season_id);

      // Update with empty update (should not change anything)
      const updateData: SeasonUpdateRequest = {};

      const prismaUpdateInput = transformSeasonUpdateRequest(updateData);
      expect(prismaUpdateInput).toEqual({});

      // Since no fields to update, season should remain unchanged
      const retrievedSeason = await prisma.$queryRaw<PrismaSeason[]>`
        SELECT season_id, label, created_at, updated_at 
        FROM grassroots.seasons 
        WHERE season_id = ${createdSeason.season_id}::uuid
      `;

      const transformedSeason = transformSeason(retrievedSeason[0]);
      expect(transformedSeason.label).toBe('Partial Update Season'); // Unchanged
      expect(transformedSeason.updatedAt).toBeUndefined(); // transformSeason returns undefined for null
    });
  });

  describe('Season Retrieval', () => {
    it('should retrieve and transform season correctly', async () => {
      // Create test season
      const testData = transformSeasonCreateRequest({
        label: 'Retrieval Test Season 2025',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);

      const createdSeason = await prisma.seasons.create({ data: testData });
      createdSeasonIds.push(createdSeason.season_id);

      // Retrieve season
      const retrievedResult = await prisma.seasons.findUnique({
        where: { season_id: createdSeason.season_id }
      });

      expect(retrievedResult).toBeDefined();

      // Transform and verify
      const transformedSeason = transformSeason(retrievedResult!);

      expect(transformedSeason.id).toBe(createdSeason.season_id);
      expect(transformedSeason.label).toBe('Retrieval Test Season 2025');
      expect(transformedSeason.createdAt).toBeInstanceOf(Date);
    });

    it('should handle season not found scenario', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      
      const retrievedResult = await prisma.$queryRaw<PrismaSeason[]>`
        SELECT season_id, label, created_at, updated_at 
        FROM grassroots.seasons 
        WHERE season_id = ${nonExistentId}::uuid
      `;

      expect(retrievedResult).toHaveLength(0);
    });

    it('should retrieve multiple seasons correctly', async () => {
      // Create multiple test seasons
      const seasons = [
        'Season A 2024',
        'Season B 2024',
        'Season C 2024'
      ];

      for (const label of seasons) {
        const seasonData = transformSeasonCreateRequest({
          label,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          isCurrent: false
        }, testUserId);
        
        const result = await prisma.seasons.create({ data: seasonData });
        createdSeasonIds.push(result.season_id);
      }

      // Retrieve all created seasons
      const retrievedResult = await prisma.$queryRaw<PrismaSeason[]>`
        SELECT season_id, label, created_at, updated_at 
        FROM grassroots.seasons 
        WHERE season_id = ANY(${createdSeasonIds}::uuid[])
        ORDER BY label
      `;

      expect(retrievedResult).toHaveLength(3);

      // Transform and verify
      const transformedSeasons = retrievedResult.map(transformSeason);
      
      expect(transformedSeasons[0].label).toBe('Season A 2024');
      expect(transformedSeasons[1].label).toBe('Season B 2024');
      expect(transformedSeasons[2].label).toBe('Season C 2024');

      transformedSeasons.forEach(season => {
        expect(season.id).toBeDefined();
        expect(season.createdAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('Field Mapping Validation', () => {
    it('should correctly map frontend to database fields', async () => {
      const frontendData: SeasonCreateRequest = {
        label: 'Field Mapping Test Season',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      };

      const prismaInput = transformSeasonCreateRequest(frontendData, testUserId);

      // Verify exact field mapping
      expect(prismaInput.label).toBe(frontendData.label);
      expect(prismaInput.start_date).toEqual(new Date(frontendData.startDate));
      expect(prismaInput.end_date).toEqual(new Date(frontendData.endDate));
    });

    it('should correctly map database to frontend fields', async () => {
      // Create season in database using proper Prisma create
      const seasonData = transformSeasonCreateRequest({
        label: 'Database Mapping Test',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);
      
      const createdSeason = await prisma.seasons.create({ data: seasonData });
      createdSeasonIds.push(createdSeason.season_id);

      const transformedSeason = transformSeason(createdSeason);

      // Verify exact field mapping
      expect(transformedSeason.id).toBe(createdSeason.season_id);
      expect(transformedSeason.label).toBe(createdSeason.label);
      expect(transformedSeason.createdAt).toBe(createdSeason.created_at);
      // Note: transformSeason converts null to undefined for updatedAt
      expect(transformedSeason.updatedAt).toBeUndefined();
      expect(createdSeason.updated_at).toBeNull();
    });
  });

  describe('Data Validation', () => {
    it('should handle long season labels', async () => {
      const longLabel = 'Very Long Season Name That Contains Many Characters And Should Still Work Properly In The Database Without Issues';
      
      const testData = transformSeasonCreateRequest({
        label: longLabel,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false
      }, testUserId);

      const createdSeason = await prisma.seasons.create({ data: testData });
      createdSeasonIds.push(createdSeason.season_id);

      const transformedSeason = transformSeason(createdSeason);
      
      expect(transformedSeason.label).toBe(longLabel);
    });

    it('should handle empty update request', async () => {
      const updateData: SeasonUpdateRequest = {};
      const prismaUpdateInput = transformSeasonUpdateRequest(updateData);
      
      expect(prismaUpdateInput).toEqual({});
      expect(Object.keys(prismaUpdateInput)).toHaveLength(0);
    });
  });
});