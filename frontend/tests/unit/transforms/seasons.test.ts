import { describe, it, expect } from 'vitest';
import { dbToSeason, dbToSeasons, seasonWriteToDb } from '../../../src/db/transforms/seasons';
import type { DbSeason } from '../../../src/db/schema';

describe('seasons transforms', () => {
  const mockDbSeason: DbSeason = {
    id: 'season-123',
    seasonId: 'season-123',
    label: '2024 Spring Season',
    startDate: '2024-03-01',
    endDate: '2024-06-30',
    isCurrent: true,
    description: 'Spring league season',
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
    createdByUserId: 'user-456',
    isDeleted: false,
    synced: true,
  };

  describe('dbToSeason', () => {
    it('transforms all fields correctly', () => {
      const result = dbToSeason(mockDbSeason);

      expect(result.id).toBe('season-123');
      expect(result.seasonId).toBe('season-123');
      expect(result.label).toBe('2024 Spring Season');
      expect(result.startDate).toBe('2024-03-01');
      expect(result.endDate).toBe('2024-06-30');
      expect(result.isCurrent).toBe(true);
      expect(result.description).toBe('Spring league season');
      expect(result.createdAt).toBe('2023-11-14T22:13:20.000Z');
      expect(result.updatedAt).toBe('2023-11-14T22:13:21.000Z');
      expect(result.createdByUserId).toBe('user-456');
      expect(result.isDeleted).toBe(false);
    });

    it('uses id as primary identifier', () => {
      const season = { ...mockDbSeason, id: 'id-1', seasonId: 'season-id-1' };
      const result = dbToSeason(season);
      expect(result.id).toBe('id-1');
      expect(result.seasonId).toBe('season-id-1');
    });

    it('falls back to id when seasonId is missing', () => {
      const season = { ...mockDbSeason, seasonId: undefined as any };
      const result = dbToSeason(season);
      expect(result.id).toBe('season-123');
      expect(result.seasonId).toBe('season-123');
    });

    it('handles null/undefined optional fields', () => {
      const minimalSeason: DbSeason = {
        id: 'season-minimal',
        seasonId: 'season-minimal',
        label: 'Minimal Season',
        isCurrent: false,
        createdAt: '2023-11-14T22:13:20.000Z',
        updatedAt: '2023-11-14T22:13:20.000Z',
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      };

      const result = dbToSeason(minimalSeason);

      expect(result.label).toBe('Minimal Season');
      expect(result.startDate).toBeUndefined();
      expect(result.endDate).toBeUndefined();
      expect(result.isCurrent).toBe(false);
      expect(result.description).toBeUndefined();
    });

    it('handles soft delete fields', () => {
      const deletedSeason: DbSeason = {
        ...mockDbSeason,
        isDeleted: true,
        deletedAt: '2023-11-14T22:13:22.000Z',
        deletedByUserId: 'user-admin',
      };

      const result = dbToSeason(deletedSeason);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).toBe('2023-11-14T22:13:22.000Z');
      expect(result.deletedByUserId).toBe('user-admin');
    });
  });

  describe('dbToSeasons', () => {
    it('transforms array of seasons', () => {
      const seasons = [
        mockDbSeason,
        { ...mockDbSeason, id: 'season-456', seasonId: 'season-456', label: 'Fall Season' },
      ];
      const result = dbToSeasons(seasons);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('season-123');
      expect(result[1].label).toBe('Fall Season');
    });

    it('handles empty array', () => {
      expect(dbToSeasons([])).toEqual([]);
    });
  });

  describe('seasonWriteToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        label: 'New Season',
        startDate: '2024-09-01',
        endDate: '2024-12-15',
        isCurrent: true,
        description: 'Fall league',
      };

      const result = seasonWriteToDb(input);

      expect(result.label).toBe('New Season');
      expect(result.startDate).toBe('2024-09-01');
      expect(result.endDate).toBe('2024-12-15');
      expect(result.isCurrent).toBe(true);
      expect(result.description).toBe('Fall league');
    });

    it('handles minimal input', () => {
      const input = { label: 'Minimal Season' };
      const result = seasonWriteToDb(input);

      expect(result.label).toBe('Minimal Season');
      expect(result.startDate).toBeUndefined();
      expect(result.endDate).toBeUndefined();
      expect(result.isCurrent).toBe(false);
      expect(result.description).toBeUndefined();
    });

    it('defaults isCurrent to false', () => {
      const input = { label: 'Test' };
      expect(seasonWriteToDb(input).isCurrent).toBe(false);
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        label: 'Roundtrip Season',
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        isCurrent: true,
        description: 'Test season',
      };

      const dbFormat = seasonWriteToDb(original);
      const stored: DbSeason = {
        id: 'season-roundtrip',
        seasonId: 'season-roundtrip',
        ...dbFormat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as DbSeason;

      const readBack = dbToSeason(stored);

      expect(readBack.label).toBe(original.label);
      expect(readBack.startDate).toBe(original.startDate);
      expect(readBack.endDate).toBe(original.endDate);
      expect(readBack.isCurrent).toBe(original.isCurrent);
      expect(readBack.description).toBe(original.description);
    });
  });
});
