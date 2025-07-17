/**
 * Shared API Validation Test Patterns
 * 
 * Reusable test utilities for API constraint validation across all endpoints.
 * Reduces code duplication and ensures consistent validation testing.
 */

import { expect } from 'vitest';
import { randomUUID } from 'crypto';
import type { SuperTest, Test } from 'supertest';

export interface ForeignKeyTestConfig {
  entityName: string;
  endpoint: string;
  createValidData: () => any;
  foreignKeyFields: {
    fieldName: string;
    description: string;
    invalidValue?: string;
  }[];
}

export interface UniqueConstraintTestConfig {
  entityName: string;
  endpoint: string;
  createDuplicateData: () => any;
  uniqueFields: string[];
  description: string;
}

export interface ValidationTestConfig {
  entityName: string;
  endpoint: string;
  createInvalidData: () => any;
  expectedErrorPattern?: RegExp;
  description: string;
}

/**
 * Test foreign key constraint validation for an API endpoint
 */
export const testForeignKeyConstraints = async (
  apiRequest: SuperTest<Test>,
  config: ForeignKeyTestConfig,
  authToken?: string
) => {
  console.log(`Testing foreign key constraints for ${config.entityName}`);
  
  for (const fkField of config.foreignKeyFields) {
    const testData = config.createValidData();
    
    // Use provided invalid value or generate a random UUID
    testData[fkField.fieldName] = fkField.invalidValue || randomUUID();
    
    console.log(`  Testing invalid ${fkField.description}: ${testData[fkField.fieldName]}`);
    
    let request = apiRequest
      .post(config.endpoint);
    
    if (authToken) {
      request = request.set('Authorization', `Bearer ${authToken}`);
    }
    
    const response = await request
      .send(testData)
      .expect(400); // Should return 400 Bad Request for invalid foreign keys
    
    expect(response.body.error || response.body.message).toBeDefined();
    
    // Check that error message mentions the foreign key issue
    const errorText = response.body.error || response.body.message.toLowerCase() || JSON.stringify(response.body);
    const errorMessage = errorText.toLowerCase();
    
    // Log basic response info
    console.log(`    Response status: ${response.status}`);
    
    // We expect a 400 status
    expect(response.status).toBe(400);
    
    // Additional check for foreign key related content
    expect(
      errorMessage.includes('foreign key constraint violation') &&
      response.body.message.toLowerCase().includes("does not exist")
    ).toBe(true);
  }
  
  console.log(`✅ Foreign key validation working for ${config.entityName}`);
};

/**
 * Test unique constraint validation for an API endpoint
 */
export const testUniqueConstraints = async (
  apiRequest: SuperTest<Test>,
  config: UniqueConstraintTestConfig
) => {
  console.log(`Testing unique constraints for ${config.entityName}`);
  
  const duplicateData = config.createDuplicateData();
  
  // Create first entity
  const firstResponse = await apiRequest
    .post(config.endpoint)
    .send(duplicateData)
    .expect(201);
  
  console.log(`  Created first ${config.entityName}: ${firstResponse.body.id || firstResponse.body.code}`);
  
  // Try to create duplicate with SAME data - should return 409 Conflict
  const duplicateResponse = await apiRequest
    .post(config.endpoint)
    .send(duplicateData)
    .expect(409);
  
  expect(duplicateResponse.body.error || duplicateResponse.body.message).toBeDefined();
  
  // Check that error message mentions the uniqueness issue
  const errorText = duplicateResponse.body.error || duplicateResponse.body.message || JSON.stringify(duplicateResponse.body);
  const errorMessage = errorText.toLowerCase();
  
  // Log basic response info
  console.log(`  Response status: ${duplicateResponse.status}`);
  
  // Check for unique constraint violation - accept any unique constraint as valid
  expect(errorMessage.includes('unique constraint violation')).toBe(true);
  
  // Also verify the message mentions something already exists
  const messageText = duplicateResponse.body.message || '';
  expect(messageText.toLowerCase().includes('already exists')).toBe(true);
  
  console.log(`✅ Unique constraint validation working for ${config.entityName}`);
  
  return firstResponse.body.id || firstResponse.body.code;
};

/**
 * Test general validation rules for an API endpoint
 */
export const testValidationRules = async (
  apiRequest: SuperTest<Test>,
  config: ValidationTestConfig
) => {
  console.log(`Testing validation rules for ${config.entityName}: ${config.description}`);
  
  const invalidData = config.createInvalidData();
  
  const response = await apiRequest
    .post(config.endpoint)
    .send(invalidData)
    .expect(400); // Should return 400 Bad Request for validation errors
  
  expect(response.body.error || response.body.message).toBeDefined();
  
  // Check against expected error pattern if provided
  if (config.expectedErrorPattern) {
    const errorMessage = response.body.error || response.body.message;
    expect(config.expectedErrorPattern.test(errorMessage)).toBe(true);
  }
  
  console.log(`✅ Validation rules working for ${config.entityName}: ${config.description}`);
};

/**
 * Test color format validation (for teams)
 */
export const testColorFormatValidation = async (
  apiRequest: SuperTest<Test>,
  endpoint: string,
  entityName: string = 'team'
) => {
  const invalidColors = [
    'red',           // Named color
    '#GGG',          // Invalid hex
    '#12345',        // Too short
    '#1234567',      // Too long
    'rgb(255,0,0)',  // RGB format
    ''               // Empty string
  ];
  
  for (const invalidColor of invalidColors) {
    console.log(`  Testing invalid color format: "${invalidColor}"`);
    
    const testData = {
      name: `Color Test ${Date.now()}`,
      homeColor: invalidColor
    };
    
    const response = await apiRequest
      .post(endpoint)
      .send(testData)
      .expect(400);
    
    expect(response.body.error || response.body.message).toBeDefined();
    
    const errorMessage = (response.body.error || response.body.message).toLowerCase();
    expect(
      errorMessage.includes('color') ||
      errorMessage.includes('format') ||
      errorMessage.includes('hex') ||
      errorMessage.includes('invalid')
    ).toBe(true);
  }
  
  console.log(`✅ Color format validation working for ${entityName}`);
};

/**
 * Helper to create foreign key test configurations for common entities
 */
export const createForeignKeyTestConfigs = {
  /**
   * Players API foreign key tests
   */
  players: (): ForeignKeyTestConfig => ({
    entityName: 'Player',
    endpoint: '/api/v1/players',
    createValidData: () => ({
      name: `FK Test Player ${Date.now()}`,
      squadNumber: Math.floor(Math.random() * 99) + 1
    }),
    foreignKeyFields: [
      {
        fieldName: 'currentTeam',
        description: 'team reference'
      },
      {
        fieldName: 'preferredPosition',
        description: 'position reference',
        invalidValue: 'XX'
      }
    ]
  }),

  /**
   * Matches API foreign key tests
   */
  matches: (): ForeignKeyTestConfig => ({
    entityName: 'Match',
    endpoint: '/api/v1/matches',
    createValidData: () => ({
      kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Test Stadium',
      seasonId: randomUUID(), // Will be overridden when testing seasonId FK
      homeTeamId: randomUUID(), // Will be overridden when testing homeTeamId FK  
      awayTeamId: randomUUID() // Will be overridden when testing awayTeamId FK
    }),
    foreignKeyFields: [
      {
        fieldName: 'seasonId',
        description: 'season reference'
      },
      {
        fieldName: 'homeTeamId',
        description: 'home team reference'
      },
      {
        fieldName: 'awayTeamId',
        description: 'away team reference'
      }
    ]
  }),

  /**
   * Awards API foreign key tests
   */
  awards: (): ForeignKeyTestConfig => ({
    entityName: 'Award',
    endpoint: '/api/v1/awards',
    createValidData: () => ({
      category: `FK Test Award ${Date.now()}`,
      notes: 'Test award for foreign key validation',
      seasonId: randomUUID(), // Will be overridden when testing seasonId FK
      playerId: randomUUID()  // Will be overridden when testing playerId FK
    }),
    foreignKeyFields: [
      {
        fieldName: 'seasonId',
        description: 'season reference'
      },
      {
        fieldName: 'playerId',
        description: 'player reference'
      }
    ]
  }),

  /**
   * Lineups API foreign key tests
   */
  lineups: (): ForeignKeyTestConfig => ({
    entityName: 'Lineup',
    endpoint: '/api/v1/lineups',
    createValidData: () => ({
      startMinute: 0,
      endMinute: 90,
      matchId: randomUUID(), // Will be overridden when testing matchId FK
      playerId: randomUUID(), // Will be overridden when testing playerId FK
      position: 'XX' // Will be overridden when testing position FK
    }),
    foreignKeyFields: [
      {
        fieldName: 'matchId',
        description: 'match reference'
      },
      {
        fieldName: 'playerId',
        description: 'player reference'
      },
      {
        fieldName: 'position',
        description: 'position reference',
        invalidValue: 'XX'
      }
    ]
  })
};

/**
 * Helper to create unique constraint test configurations
 */
export const createUniqueConstraintTestConfigs = {
  /**
   * Teams API unique constraint tests
   */
  teams: (): UniqueConstraintTestConfig => ({
    entityName: 'Team',
    endpoint: '/api/v1/teams',
    createDuplicateData: () => ({
      name: `Duplicate Team ${Date.now()}`,
      homeColor: '#FF0000',
      awayColor: '#0000FF'
    }),
    uniqueFields: ['name'],
    description: 'team name uniqueness'
  }),

  /**
   * Seasons API unique constraint tests
   */
  seasons: (): UniqueConstraintTestConfig => ({
    entityName: 'Season',
    endpoint: '/api/v1/seasons',
    createDuplicateData: () => ({
      label: `Duplicate Season ${Date.now()}`,
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    }),
    uniqueFields: ['label'],
    description: 'season label uniqueness'
  }),

  /**
   * Positions API unique constraint tests
   */
  positions: (): UniqueConstraintTestConfig => ({
    entityName: 'Position',
    endpoint: '/api/v1/positions',
    createDuplicateData: () => ({
      code: `DUP${Date.now().toString().slice(-4)}`,
      longName: 'Duplicate Position'
    }),
    uniqueFields: ['code'],
    description: 'position code uniqueness'
  }),

  /**
   * Players API unique constraint tests (squad number within team)
   */
  players: (teamId: string): UniqueConstraintTestConfig => {
    // Generate unique data once to avoid name collisions
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    
    return {
      entityName: 'Player',
      endpoint: '/api/v1/players',
      createDuplicateData: () => ({
        name: `Squad Test Player ${timestamp}-${randomId}`,
        squadNumber: 10,
        currentTeam: teamId
      }),
      uniqueFields: ['squadNumber', 'currentTeam'],
      description: 'squad number uniqueness within team'
    };
  }
};

/**
 * Helper to create validation rule test configurations
 */
export const createValidationTestConfigs = {
  /**
   * Color format validation for teams
   */
  teamColors: (): ValidationTestConfig => ({
    entityName: 'Team',
    endpoint: '/api/v1/teams',
    createInvalidData: () => ({
      name: `Color Test Team ${Date.now()}`,
      homeColor: 'invalid-color-format'
    }),
    expectedErrorPattern: /color|format|hex/i,
    description: 'color format validation'
  })
};