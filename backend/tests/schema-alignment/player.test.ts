import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Player,
  PlayerCreateRequest,
  PlayerUpdateRequest,
  transformPlayer,
  transformPlayerCreateRequest,
  transformPlayerUpdateRequest,
  PrismaPlayer
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';
import {
  testNotFoundScenario,
  testSpecialCharacterHandling,
  EntityTestConfig
} from './shared-test-patterns';

describe('Player Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let createdPlayerIds: string[] = [];
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  // Configuration for shared test patterns
  const testConfig: EntityTestConfig<PrismaPlayer, PlayerCreateRequest, PlayerUpdateRequest> = {
    entityName: 'player',
    createSampleData: () => ({ 
      name: 'Test Player ' + Math.random().toString(36).substr(2, 5),
      squadNumber: Math.floor(Math.random() * 99) + 1,
      preferredPosition: 'CM'
    }),
    updateSampleData: () => ({ squadNumber: 99, notes: 'Updated notes' }),
    transformCreate: (req) => transformPlayerCreateRequest(req, testUserId),
    transformUpdate: transformPlayerUpdateRequest,
    transformRead: transformPlayer,
    createInDb: async (data) => {
      const created = await prisma.player.create({ data });
      return created;
    },
    findInDb: async (id) => {
      const found = await prisma.player.findUnique({ where: { id } });
      return found ? [found] : [];
    },
    updateInDb: async (id, data) => {
      const updated = await prisma.player.update({ where: { id }, data });
      return updated;
    },
    getIdentifier: (entity) => entity.id,
    getNonExistentIdentifier: () => '00000000-0000-0000-0000-000000000000',
    getCleanupIdentifiers: () => createdPlayerIds,
    addToCleanup: (id) => createdPlayerIds.push(id)
  };

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();
    
    // Create test user helper and test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');
  });

  afterEach(async () => {
    // Clean up created players after each test
    if (createdPlayerIds.length > 0) {
      await prisma.player.deleteMany({
        where: {
          id: {
            in: createdPlayerIds
          }
        }
      });
      createdPlayerIds = [];
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Player Creation', () => {
    it('should create a player using frontend interface and transform correctly', async () => {
      // 1. Create player data using frontend interface
      const frontendPlayerData: PlayerCreateRequest = {
        name: 'John Doe',
        squadNumber: 10,
        preferredPosition: 'GK',
        dateOfBirth: new Date('2010-05-15'),
        notes: 'Excellent striker with good finishing',
        // Note: currentTeam field removed from schema
      };

      // 2. Transform to Prisma format
      const prismaInput = transformPlayerCreateRequest(frontendPlayerData, testUserId);

      // 3. Verify transformation structure
      expect(prismaInput).toEqual({
        name: 'John Doe',
        squad_number: 10,
        preferred_pos: 'GK',
        dob: new Date('2010-05-15'),
        notes: 'Excellent striker with good finishing',
        created_by_user_id: testUserId
      });

      // 4. Create in database
      const createdPlayer: PrismaPlayer = await prisma.player.create({
        data: prismaInput
      });

      // Track for cleanup
      createdPlayerIds.push(createdPlayer.id);

      // 5. Verify database record
      expect(createdPlayer.id).toBeDefined();
      expect(createdPlayer.name).toBe('John Doe');
      expect(createdPlayer.squad_number).toBe(10);
      expect(createdPlayer.preferred_pos).toBe('GK');
      expect(createdPlayer.dob).toEqual(new Date('2010-05-15'));
      expect(createdPlayer.notes).toBe('Excellent striker with good finishing');
      // Note: current_team field removed from schema
      expect(createdPlayer.created_at).toBeInstanceOf(Date);
      expect(createdPlayer.updated_at).toBeNull();

      // 6. Transform back to frontend format
      const transformedPlayer: Player = transformPlayer(createdPlayer);

      // 7. Verify round-trip transformation
      expect(transformedPlayer).toEqual({
        id: createdPlayer.id,
        name: 'John Doe',
        squadNumber: 10,
        preferredPosition: 'GK',
        dateOfBirth: new Date('2010-05-15'),
        notes: 'Excellent striker with good finishing',
        createdAt: createdPlayer.created_at,
        updatedAt: undefined,
        // Authorization and soft delete fields
        created_by_user_id: testUserId,
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false
      });
    });

    it('should handle minimal player data correctly', async () => {
      // Test with only required fields
      const minimalPlayerData: PlayerCreateRequest = {
        name: 'Jane Smith'
      };

      const prismaInput = transformPlayerCreateRequest(minimalPlayerData, testUserId);
      
      expect(prismaInput).toEqual({
        name: 'Jane Smith',
        squad_number: null,
        preferred_pos: null,
        dob: null,
        notes: null,
        created_by_user_id: testUserId
      });

      const createdPlayer = await prisma.player.create({
        data: prismaInput
      });

      createdPlayerIds.push(createdPlayer.id);

      const transformedPlayer = transformPlayer(createdPlayer);
      
      expect(transformedPlayer.name).toBe('Jane Smith');
      expect(transformedPlayer.squadNumber).toBeUndefined();
      expect(transformedPlayer.preferredPosition).toBeUndefined();
      expect(transformedPlayer.dateOfBirth).toBeUndefined();
      expect(transformedPlayer.notes).toBeUndefined();
      expect(transformedPlayer.currentTeam).toBeUndefined();
    });
  });

  describe('Player Updates', () => {
    it('should update player using frontend interface', async () => {
      // Create initial player
      const initialData = transformPlayerCreateRequest({
        name: 'Update Test Player',
        squadNumber: 5
      }, testUserId);

      const createdPlayer = await prisma.player.create({
        data: initialData
      });
      createdPlayerIds.push(createdPlayer.id);

      // Update using frontend interface
      const updateData: PlayerUpdateRequest = {
        squadNumber: 15,
        preferredPosition: 'CM',
        notes: 'Updated notes'
      };

      const prismaUpdateInput = transformPlayerUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        squad_number: 15,
        preferred_pos: 'CM',
        notes: 'Updated notes'
      });

      // Apply update
      const updatedPlayer = await prisma.player.update({
        where: { id: createdPlayer.id },
        data: prismaUpdateInput
      });

      // Transform back and verify
      const transformedUpdated = transformPlayer(updatedPlayer);

      expect(transformedUpdated.name).toBe('Update Test Player'); // Unchanged
      expect(transformedUpdated.squadNumber).toBe(15); // Updated
      expect(transformedUpdated.preferredPosition).toBe('CM'); // Updated
      expect(transformedUpdated.notes).toBe('Updated notes'); // Updated
      // Note: updated_at is not automatically set in current schema
    });
  });

  describe('Player Retrieval', () => {
    it('should retrieve and transform player correctly', async () => {
      // Create test player
      const testData = transformPlayerCreateRequest({
        name: 'Retrieval Test Player',
        squadNumber: 7,
        preferredPosition: 'CB'
      }, testUserId);

      const createdPlayer = await prisma.player.create({
        data: testData
      });
      createdPlayerIds.push(createdPlayer.id);

      // Retrieve player
      const retrievedPlayer = await prisma.player.findUnique({
        where: { id: createdPlayer.id }
      });

      expect(retrievedPlayer).not.toBeNull();

      // Transform and verify
      const transformedPlayer = transformPlayer(retrievedPlayer!);

      expect(transformedPlayer.id).toBe(createdPlayer.id);
      expect(transformedPlayer.name).toBe('Retrieval Test Player');
      expect(transformedPlayer.squadNumber).toBe(7);
      expect(transformedPlayer.preferredPosition).toBe('CB');
    });
  });

  describe('Data Type Validation', () => {
    it('should handle date transformations correctly', async () => {
      const testDate = new Date('2012-03-20');
      
      const playerData: PlayerCreateRequest = {
        name: 'Date Test Player',
        dateOfBirth: testDate
      };

      const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
      const createdPlayer = await prisma.player.create({ data: prismaInput });
      createdPlayerIds.push(createdPlayer.id);

      const transformedPlayer = transformPlayer(createdPlayer);

      // Verify date is preserved correctly
      expect(transformedPlayer.dateOfBirth).toEqual(testDate);
    });

    it('should handle null values correctly', async () => {
      const playerData: PlayerCreateRequest = {
        name: 'Null Test Player',
        squadNumber: null,
        preferredPosition: null,
        dateOfBirth: null,
        notes: null,
        currentTeam: null
      };

      const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
      const createdPlayer = await prisma.player.create({ data: prismaInput });
      createdPlayerIds.push(createdPlayer.id);

      const transformedPlayer = transformPlayer(createdPlayer);

      expect(transformedPlayer.squadNumber).toBeUndefined();
      expect(transformedPlayer.preferredPosition).toBeUndefined();
      expect(transformedPlayer.dateOfBirth).toBeUndefined();
      expect(transformedPlayer.notes).toBeUndefined();
      expect(transformedPlayer.currentTeam).toBeUndefined();
    });
  });

  describe('Field Mapping Validation', () => {
    it('should correctly map frontend to database fields', async () => {
      const frontendData: PlayerCreateRequest = {
        name: 'Field Mapping Test Player',
        squadNumber: 42,
        preferredPosition: 'CM',
        dateOfBirth: new Date('2010-01-01'),
        notes: 'Mapping test notes',
        // Note: currentTeam field removed from schema
      };

      const prismaInput = transformPlayerCreateRequest(frontendData, testUserId);

      // Verify exact field mapping (frontend camelCase to database snake_case)
      expect(prismaInput.name).toBe(frontendData.name);
      expect(prismaInput.squad_number).toBe(frontendData.squadNumber);
      expect(prismaInput.preferred_pos).toBe(frontendData.preferredPosition);
      expect(prismaInput.dob).toBe(frontendData.dateOfBirth);
      expect(prismaInput.notes).toBe(frontendData.notes);
      // Note: current_team field removed from schema
    });

    it('should correctly map database to frontend fields', async () => {
      // Create player in database
      const prismaInput = transformPlayerCreateRequest({
        name: 'Database Mapping Test',
        squadNumber: 33,
        preferredPosition: 'GK',
        dateOfBirth: new Date('2011-06-15'),
        notes: 'Database mapping notes'
      }, testUserId);

      const createdPlayer = await prisma.player.create({ data: prismaInput });
      createdPlayerIds.push(createdPlayer.id);

      const transformedPlayer = transformPlayer(createdPlayer);

      // Verify exact field mapping (database snake_case to frontend camelCase)
      expect(transformedPlayer.id).toBe(createdPlayer.id);
      expect(transformedPlayer.name).toBe(createdPlayer.name);
      expect(transformedPlayer.squadNumber).toBe(createdPlayer.squad_number);
      expect(transformedPlayer.preferredPosition).toBe(createdPlayer.preferred_pos);
      expect(transformedPlayer.dateOfBirth).toBe(createdPlayer.dob);
      expect(transformedPlayer.notes).toBe(createdPlayer.notes);
      expect(transformedPlayer.createdAt).toBe(createdPlayer.created_at);
      // Note: current_team field removed from schema
      // expect(transformedPlayer.currentTeam).toBeUndefined();
      // expect(createdPlayer.current_team).toBeNull();
    });
  });

  describe('Foreign Key Constraint Validation', () => {
    it('should enforce position foreign key constraint', async () => {
      const playerData: PlayerCreateRequest = {
        name: 'Invalid Position Player',
        preferredPosition: 'INVALID_POSITION_CODE'
      };

      const prismaInput = transformPlayerCreateRequest(playerData, testUserId);

      // Should throw foreign key constraint violation
      await expect(
        prisma.player.create({ data: prismaInput })
      ).rejects.toThrow();
    });

    it('should allow valid position codes', async () => {
      // Test with known valid position codes
      const validPositions = ['GK', 'CB', 'CM', 'ST'];
      
      for (const position of validPositions) {
        const playerData: PlayerCreateRequest = {
          name: `Valid Position Player ${position}`,
          preferredPosition: position
        };

        const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
        const createdPlayer = await prisma.player.create({ data: prismaInput });
        createdPlayerIds.push(createdPlayer.id);

        expect(createdPlayer.preferred_pos).toBe(position);
      }
    });
  });

  describe('Special Character Handling', () => {
    it('should handle player names with special characters', async () => {
      await testSpecialCharacterHandling(
        testConfig,
        'name',
        "Jose Maria O'Connor-Smith"
      );
    });

    it('should handle player names with international characters', async () => {
      const specialNames = [
        'Mueller',
        'Zizek', 
        'Francois',
        'Haland',
        'Caglar'
      ];

      for (const name of specialNames) {
        const playerData: PlayerCreateRequest = {
          name: name,
          squadNumber: Math.floor(Math.random() * 99) + 1
        };

        const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
        const createdPlayer = await prisma.player.create({ data: prismaInput });
        createdPlayerIds.push(createdPlayer.id);

        const transformedPlayer = transformPlayer(createdPlayer);
        expect(transformedPlayer.name).toBe(name);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle player not found scenario', async () => {
      await testNotFoundScenario(testConfig);
    });

    it('should handle squad number edge cases', async () => {
      // Test edge cases for squad numbers
      const edgeCases = [
        { squadNumber: 1, description: 'minimum squad number' },
        { squadNumber: 99, description: 'maximum typical squad number' },
        { squadNumber: 0, description: 'zero squad number' }
      ];

      for (const testCase of edgeCases) {
        const playerData: PlayerCreateRequest = {
          name: `Squad Number Test ${testCase.squadNumber}`,
          squadNumber: testCase.squadNumber
        };

        const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
        const createdPlayer = await prisma.player.create({ data: prismaInput });
        createdPlayerIds.push(createdPlayer.id);

        const transformedPlayer = transformPlayer(createdPlayer);
        expect(transformedPlayer.squadNumber).toBe(testCase.squadNumber);
      }
    });

    it('should handle various birth dates', async () => {
      const dateTestCases = [
        { date: new Date('2000-01-01'), description: 'past date' },
        { date: new Date('2020-12-31'), description: 'recent date' },
        { date: new Date('1990-06-15'), description: 'older date' }
      ];

      for (const testCase of dateTestCases) {
        const playerData: PlayerCreateRequest = {
          name: `Date Test ${testCase.description}`,
          dateOfBirth: testCase.date
        };

        const prismaInput = transformPlayerCreateRequest(playerData, testUserId);
        const createdPlayer = await prisma.player.create({ data: prismaInput });
        createdPlayerIds.push(createdPlayer.id);

        const transformedPlayer = transformPlayer(createdPlayer);
        expect(transformedPlayer.dateOfBirth).toEqual(testCase.date);
      }
    });
  });

  afterAll(async () => {
    // Clean up test users
    await userHelper.cleanup();
    await prisma.$disconnect();
  });
});