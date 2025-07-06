import { expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Shared test patterns for schema alignment testing
 * These utilities reduce code duplication across entity tests
 */

export interface EntityTestConfig<T, CreateReq, UpdateReq> {
  entityName: string;
  createSampleData: () => CreateReq;
  updateSampleData: () => UpdateReq;
  transformCreate: (req: CreateReq) => any;
  transformUpdate: (req: UpdateReq) => any;
  transformRead: (entity: T) => any;
  createInDb: (data: any) => Promise<T>;
  findInDb: (identifier: string) => Promise<T[]>;
  updateInDb: (identifier: string, data: any) => Promise<T>;
  getIdentifier: (entity: T) => string;
  getNonExistentIdentifier: () => string;
  getCleanupIdentifiers: () => string[];
  addToCleanup: (identifier: string) => void;
}

/**
 * Test that entity is not found when querying with non-existent identifier
 */
export const testNotFoundScenario = async <T>(
  config: Pick<EntityTestConfig<T, any, any>, 'entityName' | 'findInDb' | 'getNonExistentIdentifier'>
) => {
  const nonExistentId = config.getNonExistentIdentifier();
  const result = await config.findInDb(nonExistentId);
  expect(result).toHaveLength(0);
};

/**
 * Test handling of long text in specified field
 */
export const testLongTextHandling = async <T, CreateReq>(
  config: Pick<EntityTestConfig<T, CreateReq, any>, 'entityName' | 'createInDb' | 'transformCreate' | 'transformRead' | 'getIdentifier' | 'addToCleanup' | 'createSampleData'>,
  textField: keyof CreateReq,
  longText: string
) => {
  // Start with sample data and override the specific field
  const createData = config.createSampleData();
  (createData as any)[textField] = longText;
  
  const prismaInput = config.transformCreate(createData);
  const created = await config.createInDb(prismaInput);
  config.addToCleanup(config.getIdentifier(created));
  
  const transformed = config.transformRead(created);
  expect((transformed as any)[textField]).toBe(longText);
};

/**
 * Test handling of special characters in text field
 */
export const testSpecialCharacterHandling = async <T, CreateReq>(
  config: Pick<EntityTestConfig<T, CreateReq, any>, 'entityName' | 'createInDb' | 'transformCreate' | 'transformRead' | 'getIdentifier' | 'addToCleanup' | 'createSampleData'>,
  textField: keyof CreateReq,
  specialText: string,
  expectedValue?: string
) => {
  // Start with sample data and override the specific field
  const createData = config.createSampleData();
  (createData as any)[textField] = specialText;
  
  const prismaInput = config.transformCreate(createData);
  const created = await config.createInDb(prismaInput);
  config.addToCleanup(config.getIdentifier(created));
  
  const transformed = config.transformRead(created);
  expect((transformed as any)[textField]).toBe(expectedValue || specialText);
};

/**
 * Test retrieval of multiple entities
 */
export const testMultipleEntityRetrieval = async <T, CreateReq>(
  config: Pick<EntityTestConfig<T, CreateReq, any>, 'entityName' | 'createInDb' | 'transformCreate' | 'transformRead' | 'getIdentifier' | 'addToCleanup'>,
  entities: CreateReq[]
) => {
  // Create multiple entities
  const createdEntities: T[] = [];
  for (const entityData of entities) {
    const prismaInput = config.transformCreate(entityData);
    const created = await config.createInDb(prismaInput);
    config.addToCleanup(config.getIdentifier(created));
    createdEntities.push(created);
  }
  
  expect(createdEntities).toHaveLength(entities.length);
  
  // Transform and verify all entities
  const transformedEntities = createdEntities.map(config.transformRead);
  transformedEntities.forEach((transformed, index) => {
    expect(transformed).toBeDefined();
    // Additional entity-specific validations can be added by caller
  });
  
  return { created: createdEntities, transformed: transformedEntities };
};

/**
 * Test empty update request handling
 */
export const testEmptyUpdateRequest = <UpdateReq>(
  config: Pick<EntityTestConfig<any, any, UpdateReq>, 'entityName' | 'transformUpdate'>
) => {
  const emptyUpdate = {} as UpdateReq;
  const prismaUpdateInput = config.transformUpdate(emptyUpdate);
  
  expect(prismaUpdateInput).toEqual({});
  expect(Object.keys(prismaUpdateInput)).toHaveLength(0);
};

/**
 * Test field mapping from frontend to database format
 */
export const testFrontendToDatabaseMapping = <CreateReq>(
  config: Pick<EntityTestConfig<any, CreateReq, any>, 'entityName' | 'createSampleData' | 'transformCreate'>,
  expectedMappings: Record<string, any>
) => {
  const frontendData = config.createSampleData();
  const prismaInput = config.transformCreate(frontendData);
  
  Object.entries(expectedMappings).forEach(([dbField, expectedValue]) => {
    expect((prismaInput as any)[dbField]).toBe(expectedValue);
  });
};

/**
 * Test field mapping from database to frontend format
 */
export const testDatabaseToFrontendMapping = <T>(
  config: Pick<EntityTestConfig<T, any, any>, 'entityName' | 'transformRead'>,
  databaseEntity: T,
  expectedMappings: Record<string, any>
) => {
  const transformed = config.transformRead(databaseEntity);
  
  Object.entries(expectedMappings).forEach(([frontendField, expectedValue]) => {
    expect((transformed as any)[frontendField]).toBe(expectedValue);
  });
};

/**
 * Test unique constraint violation
 */
export const testUniqueConstraintViolation = async <T, CreateReq>(
  config: Pick<EntityTestConfig<T, CreateReq, any>, 'entityName' | 'createInDb' | 'transformCreate' | 'getIdentifier' | 'addToCleanup'>,
  duplicateData: CreateReq
) => {
  // Create first entity
  const prismaInput1 = config.transformCreate(duplicateData);
  const created1 = await config.createInDb(prismaInput1);
  config.addToCleanup(config.getIdentifier(created1));
  
  // Try to create duplicate - should throw
  const prismaInput2 = config.transformCreate(duplicateData);
  await expect(config.createInDb(prismaInput2)).rejects.toThrow();
};

/**
 * Test partial update functionality
 */
export const testPartialUpdate = async <T, CreateReq, UpdateReq>(
  config: EntityTestConfig<T, CreateReq, UpdateReq>,
  initialData: CreateReq,
  updateData: UpdateReq,
  verifyFn: (original: T, updated: T, transformed: any) => void
) => {
  // Create initial entity
  const prismaInput = config.transformCreate(initialData);
  const created = await config.createInDb(prismaInput);
  config.addToCleanup(config.getIdentifier(created));
  
  // Apply update
  const prismaUpdateInput = config.transformUpdate(updateData);
  const updated = await config.updateInDb(config.getIdentifier(created), prismaUpdateInput);
  
  // Transform and verify
  const transformed = config.transformRead(updated);
  verifyFn(created, updated, transformed);
  
  return { created, updated, transformed };
};

/**
 * Utility to create standard test descriptions
 */
export const createTestDescription = (entityName: string, testType: string): string => {
  return `should handle ${testType} for ${entityName} entity`;
};

/**
 * Utility to validate timestamp fields
 */
export const validateTimestamps = (entity: any, expectUpdatedAt: boolean = false) => {
  expect(entity.createdAt).toBeInstanceOf(Date);
  
  if (expectUpdatedAt) {
    expect(entity.updatedAt).toBeInstanceOf(Date);
  } else {
    // Check if transformer returns undefined for null
    expect(entity.updatedAt === null || entity.updatedAt === undefined).toBe(true);
  }
};

/**
 * Utility to validate round-trip transformation
 */
export const validateRoundTripTransformation = <T, CreateReq>(
  config: Pick<EntityTestConfig<T, CreateReq, any>, 'transformCreate' | 'transformRead'>,
  frontendData: CreateReq,
  databaseEntity: T,
  customValidations?: (frontend: CreateReq, transformed: any) => void
) => {
  const transformed = config.transformRead(databaseEntity);
  
  // Standard validations
  expect(transformed).toBeDefined();
  validateTimestamps(transformed);
  
  // Custom validations if provided
  if (customValidations) {
    customValidations(frontendData, transformed);
  }
  
  return transformed;
};