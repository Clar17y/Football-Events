import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Position,
  PositionCreateRequest,
  PositionUpdateRequest,
  transformPosition,
  transformPositionCreateRequest,
  transformPositionUpdateRequest,
  PrismaPosition
} from '@shared/types';
import {
  testNotFoundScenario,
  testLongTextHandling,
  testSpecialCharacterHandling,
  testMultipleEntityRetrieval,
  testEmptyUpdateRequest,
  testUniqueConstraintViolation,
  validateRoundTripTransformation,
  EntityTestConfig
} from './shared-test-patterns';

describe('Position Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let createdPositionCodes: string[] = [];

  // Configuration for shared test patterns
  const testConfig: EntityTestConfig<PrismaPosition, PositionCreateRequest, PositionUpdateRequest> = {
    entityName: 'position',
    createSampleData: () => ({ code: 'TST' + Math.random().toString(36).substr(2, 3).toUpperCase(), longName: 'Test Position' }),
    updateSampleData: () => ({ longName: 'Updated Position' }),
    transformCreate: transformPositionCreateRequest,
    transformUpdate: transformPositionUpdateRequest,
    transformRead: transformPosition,
    createInDb: async (data) => {
      return await prisma.positions.create({ data });
    },
    findInDb: async (code) => {
      const position = await prisma.positions.findUnique({ where: { pos_code: code } });
      return position ? [position] : [];
    },
    updateInDb: async (code, data) => {
      return await prisma.positions.update({
        where: { pos_code: code },
        data: data
      });
    },
    getIdentifier: (entity) => entity.pos_code,
    getNonExistentIdentifier: () => 'NOTFOUND',
    getCleanupIdentifiers: () => createdPositionCodes,
    addToCleanup: (code) => createdPositionCodes.push(code)
  };

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    // Clean up created positions after each test
    if (createdPositionCodes.length > 0) {
      // Use raw query since Position model might not be available in Prisma client
      await prisma.$executeRaw`
        DELETE FROM grassroots.positions 
        WHERE pos_code = ANY(${createdPositionCodes}::text[])
      `;
      createdPositionCodes = [];
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Position Creation', () => {
    it('should create a position using frontend interface and transform correctly', async () => {
      // 1. Create position data using frontend interface
      const frontendPositionData: PositionCreateRequest = {
        code: 'AM',
        longName: 'Attacking Midfielder'
      };

      // 2. Transform to Prisma format
      const prismaInput = transformPositionCreateRequest(frontendPositionData);

      // 3. Verify transformation structure
      expect(prismaInput).toEqual({
        pos_code: 'AM',
        long_name: 'Attacking Midfielder'
      });

      // 4. Create in database using Prisma
      const createdPosition = await prisma.positions.create({ data: prismaInput });

      // Track for cleanup
      createdPositionCodes.push(createdPosition.pos_code);

      // 5. Verify database record
      expect(createdPosition.pos_code).toBe('AM');
      expect(createdPosition.long_name).toBe('Attacking Midfielder');
      expect(createdPosition.created_at).toBeInstanceOf(Date);
      expect(createdPosition.updated_at).toBeNull();

      // 6. Transform back to frontend format
      const transformedPosition: Position = transformPosition(createdPosition);

      // 7. Verify round-trip transformation
      expect(transformedPosition).toEqual({
        code: 'AM',
        longName: 'Attacking Midfielder',
        createdAt: createdPosition.created_at,
        updatedAt: undefined // transformPosition returns undefined for null database values
      });
    });

    it('should handle position with special characters and spaces', async () => {
      await testSpecialCharacterHandling(
        testConfig,
        'longName',
        'Left Wing-Back (Defensive)'
      );
    });

    it('should handle short position codes', async () => {
      // Test with minimal position code
      const positionData: PositionCreateRequest = {
        code: 'S',
        longName: 'Substitute'
      };

      const prismaInput = transformPositionCreateRequest(positionData);
      const createdPosition = await prisma.positions.create({ data: prismaInput });
      createdPositionCodes.push(createdPosition.pos_code);

      const transformedPosition = transformPosition(createdPosition);
      
      expect(transformedPosition.code).toBe('S');
      expect(transformedPosition.longName).toBe('Substitute');
    });

    it('should enforce unique position code constraint', async () => {
      await testUniqueConstraintViolation(testConfig, {
        code: 'DUP',
        longName: 'Duplicate Test Position'
      });
    });
  });

  describe('Position Updates', () => {
    it('should update position using frontend interface', async () => {
      // Create initial position
      const initialData = transformPositionCreateRequest({
        code: 'UPD',
        longName: 'Update Test Position'
      });

      const createdPosition = await prisma.positions.create({ data: initialData });
      createdPositionCodes.push(createdPosition.pos_code);

      // Update using frontend interface
      const updateData: PositionUpdateRequest = {
        longName: 'Updated Position Name'
      };

      const prismaUpdateInput = transformPositionUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        long_name: 'Updated Position Name'
      });

      // Apply update using Prisma
      const updatedPosition = await prisma.positions.update({
        where: { pos_code: createdPosition.pos_code },
        data: prismaUpdateInput
      });

      // Transform back and verify
      const transformedUpdated = transformPosition(updatedPosition);

      expect(transformedUpdated.code).toBe('UPD'); // Unchanged
      expect(transformedUpdated.longName).toBe('Updated Position Name'); // Updated
      expect(transformedUpdated.createdAt).toEqual(createdPosition.created_at); // Unchanged
      expect(transformedUpdated.updatedAt).toBeInstanceOf(Date); // Should be set
      expect(transformedUpdated.updatedAt).not.toEqual(createdPosition.updated_at); // Should be different
    });

    it('should update position code using frontend interface', async () => {
      // Create initial position
      const initialData = transformPositionCreateRequest({
        code: 'OLD',
        longName: 'Position Code Update Test'
      });

      const createdPosition = await prisma.positions.create({ data: initialData });
      createdPositionCodes.push(createdPosition.pos_code);

      // Update position code
      const updateData: PositionUpdateRequest = {
        code: 'NEW'
      };

      const prismaUpdateInput = transformPositionUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        pos_code: 'NEW'
      });

      // Apply update using Prisma
      const updatedPosition = await prisma.positions.update({
        where: { pos_code: createdPosition.pos_code },
        data: prismaUpdateInput
      });

      // Update cleanup tracking
      createdPositionCodes = createdPositionCodes.filter(code => code !== 'OLD');
      createdPositionCodes.push('NEW');

      // Transform back and verify
      const transformedUpdated = transformPosition(updatedPosition);

      expect(transformedUpdated.code).toBe('NEW'); // Updated
      expect(transformedUpdated.longName).toBe('Position Code Update Test'); // Unchanged
      expect(transformedUpdated.updatedAt).toBeInstanceOf(Date); // Should be set
    });

    it('should handle partial updates correctly', async () => {
      // Create initial position
      const initialData = transformPositionCreateRequest({
        code: 'PAR',
        longName: 'Partial Update Position'
      });

      const createdPosition = await prisma.positions.create({ data: initialData });
      createdPositionCodes.push(createdPosition.pos_code);

      // Update with empty update (should not change anything)
      const updateData: PositionUpdateRequest = {};

      const prismaUpdateInput = transformPositionUpdateRequest(updateData);
      expect(prismaUpdateInput).toEqual({});

      // Since no fields to update, position should remain unchanged
      const retrievedPosition = await prisma.positions.findUnique({
        where: { pos_code: createdPosition.pos_code }
      });

      const transformedPosition = transformPosition(retrievedPosition!);
      expect(transformedPosition.code).toBe('PAR'); // Unchanged
      expect(transformedPosition.longName).toBe('Partial Update Position'); // Unchanged
      expect(transformedPosition.updatedAt).toBeUndefined(); // Should still be undefined
    });
  });

  describe('Position Retrieval', () => {
    it('should retrieve and transform position correctly', async () => {
      // Create test position
      const testData = transformPositionCreateRequest({
        code: 'RET',
        longName: 'Retrieval Test Position'
      });

      const createdPosition = await prisma.positions.create({ data: testData });
      createdPositionCodes.push(createdPosition.pos_code);

      // Retrieve position
      const retrievedResult = await prisma.positions.findUnique({
        where: { pos_code: createdPosition.pos_code }
      });

      expect(retrievedResult).toBeDefined();

      // Transform and verify
      const transformedPosition = transformPosition(retrievedResult!);

      expect(transformedPosition.code).toBe('RET');
      expect(transformedPosition.longName).toBe('Retrieval Test Position');
      expect(transformedPosition.createdAt).toBeInstanceOf(Date);
    });

    it('should handle position not found scenario', async () => {
      await testNotFoundScenario(testConfig);
    });

    it('should retrieve multiple positions correctly', async () => {
      // Create multiple test positions
      const positions = [
        { code: 'MUL1', longName: 'Multiple Test Position 1' },
        { code: 'MUL2', longName: 'Multiple Test Position 2' },
        { code: 'MUL3', longName: 'Multiple Test Position 3' }
      ];

      for (const pos of positions) {
        const prismaInput = transformPositionCreateRequest(pos);
        const createdPosition = await prisma.positions.create({ data: prismaInput });
        createdPositionCodes.push(createdPosition.pos_code);
      }

      // Retrieve all created positions
      const retrievedResult = await prisma.positions.findMany({
        where: { pos_code: { in: createdPositionCodes.slice(-3) } },
        orderBy: { pos_code: 'asc' }
      });

      expect(retrievedResult).toHaveLength(3);

      // Transform and verify
      const transformedPositions = retrievedResult.map(transformPosition);
      
      expect(transformedPositions[0].code).toBe('MUL1');
      expect(transformedPositions[0].longName).toBe('Multiple Test Position 1');
      expect(transformedPositions[1].code).toBe('MUL2');
      expect(transformedPositions[1].longName).toBe('Multiple Test Position 2');
      expect(transformedPositions[2].code).toBe('MUL3');
      expect(transformedPositions[2].longName).toBe('Multiple Test Position 3');

      transformedPositions.forEach(position => {
        expect(position.createdAt).toBeInstanceOf(Date);
        expect(position.updatedAt).toBeUndefined();
      });
    });
  });

  describe('Field Mapping Validation', () => {
    it('should correctly map frontend to database fields', async () => {
      const frontendData: PositionCreateRequest = {
        code: 'MAP',
        longName: 'Field Mapping Test Position'
      };

      const prismaInput = transformPositionCreateRequest(frontendData);

      // Verify exact field mapping
      expect(prismaInput.pos_code).toBe(frontendData.code);
      expect(prismaInput.long_name).toBe(frontendData.longName);
      expect(Object.keys(prismaInput)).toEqual(['pos_code', 'long_name']);
    });

    it('should correctly map database to frontend fields', async () => {
      // Create position in database
      const prismaInput = transformPositionCreateRequest({
        code: 'DBM',
        longName: 'Database Mapping Test'
      });
      const createdPosition = await prisma.positions.create({ data: prismaInput });
      createdPositionCodes.push(createdPosition.pos_code);

      const transformedPosition = transformPosition(createdPosition);

      // Verify exact field mapping
      expect(transformedPosition.code).toBe(createdPosition.pos_code);
      expect(transformedPosition.longName).toBe(createdPosition.long_name);
      expect(transformedPosition.createdAt).toBe(createdPosition.created_at);
      // Note: transformPosition converts null to undefined for updatedAt
      expect(transformedPosition.updatedAt).toBeUndefined();
      expect(createdPosition.updated_at).toBeNull();
    });
  });

  describe('Data Validation', () => {
    it('should handle long position names', async () => {
      const longName = 'Very Long Position Name That Contains Many Characters And Should Still Work Properly In The Database Without Issues';
      
      await testLongTextHandling(
        testConfig,
        'longName',
        longName
      );
    });

    it('should handle empty update request', async () => {
      testEmptyUpdateRequest(testConfig);
    });

    it('should handle position codes with numbers and special characters', async () => {
      const positionData: PositionCreateRequest = {
        code: 'CB1',
        longName: 'Centre Back #1'
      };

      const prismaInput = transformPositionCreateRequest(positionData);
      const createdPosition = await prisma.positions.create({ data: prismaInput });
      createdPositionCodes.push(createdPosition.pos_code);

      const transformedPosition = transformPosition(createdPosition);
      
      expect(transformedPosition.code).toBe('CB1');
      expect(transformedPosition.longName).toBe('Centre Back #1');
    });
  });

  describe('Integration with Player Entity', () => {
    it('should verify position codes used in player tests exist', async () => {
      // Check that position codes used in player tests are available
      const playerTestPositions = ['GK', 'CB', 'CM'];
      
      for (const posCode of playerTestPositions) {
        const position = await prisma.positions.findUnique({
          where: { pos_code: posCode }
        });
        
        expect(position).toBeDefined();
        expect(position!.pos_code).toBe(posCode);
        
        // Transform and verify structure
        const transformedPosition = transformPosition(position!);
        expect(transformedPosition.code).toBe(posCode);
        expect(transformedPosition.longName).toBeDefined();
        expect(transformedPosition.createdAt).toBeInstanceOf(Date);
      }
    });
  });
});