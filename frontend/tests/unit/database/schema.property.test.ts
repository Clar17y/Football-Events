/**
 * Property-based tests for Schema Field Naming
 *
 * **Feature: indexeddb-camelcase-migration, Property 1: Schema Field Names Follow camelCase**
 * **Validates: Requirements 1.1, 1.2**
 *
 * Tests that:
 * - All interface field names use camelCase (no underscores)
 * - All index field names in SCHEMA_INDEXES use camelCase
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SCHEMA_INDEXES } from '../../../src/db/schema';

/**
 * Helper to check if a string is camelCase (no underscores, except for specific allowed patterns)
 * Allowed exceptions:
 * - 'id' (single word)
 * - 'dob' (single word abbreviation)
 * - Enum values like 'server_wins', 'client_wins' (these are values, not field names)
 */
function isCamelCase(fieldName: string): boolean {
  // Single lowercase words are valid camelCase
  if (/^[a-z]+$/.test(fieldName)) {
    return true;
  }
  // camelCase pattern: starts with lowercase, no underscores
  if (/^[a-z][a-zA-Z0-9]*$/.test(fieldName)) {
    return true;
  }
  return false;
}

/**
 * Extract field names from a composite index string like '[matchId+playerId]'
 */
function extractFieldsFromIndex(indexStr: string): string[] {
  // Handle composite indexes like '[matchId+playerId]'
  if (indexStr.startsWith('[') && indexStr.endsWith(']')) {
    const inner = indexStr.slice(1, -1);
    return inner.split('+');
  }
  // Single field index
  return [indexStr];
}

describe('Schema Field Naming Property Tests', () => {
  /**
   * **Feature: indexeddb-camelcase-migration, Property 1: Schema Field Names Follow camelCase**
   * **Validates: Requirements 1.1, 1.2**
   *
   * *For any* field name in the database schema indexes, the field name should match
   * the camelCase pattern (no underscores).
   */
  describe('Property 1: Schema Field Names Follow camelCase', () => {
    it('should have all SCHEMA_INDEXES field names in camelCase', () => {
      // Get all table names from SCHEMA_INDEXES
      const tableNames = Object.keys(SCHEMA_INDEXES) as (keyof typeof SCHEMA_INDEXES)[];

      for (const tableName of tableNames) {
        const indexes = SCHEMA_INDEXES[tableName];

        for (const indexStr of indexes) {
          const fields = extractFieldsFromIndex(indexStr);

          for (const field of fields) {
            expect(
              isCamelCase(field),
              `Field "${field}" in table "${tableName}" index "${indexStr}" should be camelCase (no underscores)`
            ).toBe(true);
          }
        }
      }
    });

    it('should not contain any snake_case patterns in index definitions', () => {
      // Property test: for any randomly selected index, it should not contain underscores
      const allIndexes: { table: string; index: string; field: string }[] = [];

      const tableNames = Object.keys(SCHEMA_INDEXES) as (keyof typeof SCHEMA_INDEXES)[];
      for (const tableName of tableNames) {
        const indexes = SCHEMA_INDEXES[tableName];
        for (const indexStr of indexes) {
          const fields = extractFieldsFromIndex(indexStr);
          for (const field of fields) {
            allIndexes.push({ table: tableName, index: indexStr, field });
          }
        }
      }

      // Use fast-check to randomly sample and verify
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: allIndexes.length - 1 }),
          (idx) => {
            const { table, index, field } = allIndexes[idx];
            const hasUnderscore = field.includes('_');
            if (hasUnderscore) {
              throw new Error(
                `Found snake_case field "${field}" in table "${table}" index "${index}"`
              );
            }
            return true;
          }
        ),
        { numRuns: Math.min(100, allIndexes.length) }
      );
    });

    it('should have consistent camelCase naming across all tables', () => {
      // Common field names that should appear in camelCase across multiple tables
      const expectedCamelCaseFields = [
        'matchId',
        'playerId',
        'teamId',
        'seasonId',
        'createdByUserId',
        'isDeleted',
        'synced',
        'updatedAt',
        'createdAt',
        'syncedAt',
      ];

      const tableNames = Object.keys(SCHEMA_INDEXES) as (keyof typeof SCHEMA_INDEXES)[];
      const allFields = new Set<string>();

      for (const tableName of tableNames) {
        const indexes = SCHEMA_INDEXES[tableName];
        for (const indexStr of indexes) {
          const fields = extractFieldsFromIndex(indexStr);
          fields.forEach((f) => allFields.add(f));
        }
      }

      // Verify that common fields are in camelCase format
      for (const expectedField of expectedCamelCaseFields) {
        if (allFields.has(expectedField)) {
          expect(isCamelCase(expectedField)).toBe(true);
        }
      }

      // Verify NO snake_case versions exist
      const snakeCaseVersions = [
        'match_id',
        'player_id',
        'team_id',
        'season_id',
        'created_by_user_id',
        'is_deleted',
        'updated_at',
        'created_at',
        'synced_at',
      ];

      for (const snakeField of snakeCaseVersions) {
        expect(
          allFields.has(snakeField),
          `Found snake_case field "${snakeField}" which should be camelCase`
        ).toBe(false);
      }
    });
  });

  /**
   * **Feature: indexeddb-camelcase-migration, Property 2: Index Names Follow camelCase**
   * **Validates: Requirements 1.2**
   *
   * *For any* index specification in SCHEMA_INDEXES, all field names within the index
   * string should use camelCase naming.
   */
  describe('Property 2: Index Names Follow camelCase', () => {
    it('should have all composite index fields in camelCase', () => {
      const tableNames = Object.keys(SCHEMA_INDEXES) as (keyof typeof SCHEMA_INDEXES)[];

      for (const tableName of tableNames) {
        const indexes = SCHEMA_INDEXES[tableName];

        for (const indexStr of indexes) {
          // Only check composite indexes
          if (indexStr.startsWith('[') && indexStr.endsWith(']')) {
            const fields = extractFieldsFromIndex(indexStr);

            for (const field of fields) {
              expect(
                isCamelCase(field),
                `Composite index field "${field}" in "${indexStr}" for table "${tableName}" should be camelCase`
              ).toBe(true);
            }
          }
        }
      }
    });

    it('should have no underscores in any index string', () => {
      const tableNames = Object.keys(SCHEMA_INDEXES) as (keyof typeof SCHEMA_INDEXES)[];

      for (const tableName of tableNames) {
        const indexes = SCHEMA_INDEXES[tableName];

        for (const indexStr of indexes) {
          // The index string itself should not contain underscores
          // (except for the + separator in composite indexes)
          const cleanedIndex = indexStr.replace(/[\[\]]/g, '');
          const parts = cleanedIndex.split('+');

          for (const part of parts) {
            expect(
              part.includes('_'),
              `Index "${indexStr}" in table "${tableName}" contains snake_case field "${part}"`
            ).toBe(false);
          }
        }
      }
    });
  });
});
