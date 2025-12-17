import { describe, it, expect } from 'vitest';
import { dbToSeason, dbToSeasons, seasonWriteToDb } from '../../../src/db/transforms/seasons';
import type { EnhancedSeason } from '../../../src/db/schema';

describe('seasons transforms', () => {
  const mockDbSeason: EnhancedSeason = {
    id: 'season-123',
    season_id: 'season-123',
    label: '2024 Spring Season',
    start_date: '2024-03-01',
    end_date: '2024-06-30',
    is_current: true,
    description: 'Spring league season',
    created_at: 1700000000000,
    updated_at: 1700000001000,
    created_by_user_id: 'user-456',
    is_deleted: false,
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
      expect(result.createdAt).toEqual(new Date(1700000000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-456');
      expect(result.is_deleted).toBe(false);
    });

    it('uses season_id over id when both present', () => {
      const season = { ...mockDbSeason, id: 'id-1', season_id: 'season-id-1' };
      const result = dbToSeason(season);
      expect(result.id).toBe('season-id-1');
      expect(result.seasonId).toBe('season-id-1');
    });

    it('falls back to id when season_id is missing', () => {
      const season = { ...mockDbSeason, season_id: undefined };
      const result = dbToSeason(season);
      expect(result.id).toBe('season-123');
    });

    it('handles null/undefined optional fields', () => {
      const minimalSeason: EnhancedSeason = {
        id: 'season-minimal',
        season_id: 'season-minimal',
        label: 'Minimal Season',
        created_at: 1700000000000,
        updated_at: 1700000000000,
        created_by_user_id: 'user-1',
        is_deleted: false,
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
      const deletedSeason: EnhancedSeason = {
        ...mockDbSeason,
        is_deleted: true,
        deleted_at: 1700000002000,
        deleted_by_user_id: 'user-admin',
      };

      const result = dbToSeason(deletedSeason);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToSeasons', () => {
    it('transforms array of seasons', () => {
      const seasons = [
        mockDbSeason,
        { ...mockDbSeason, id: 'season-456', label: 'Fall Season' },
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
      expect(result.start_date).toBe('2024-09-01');
      expect(result.end_date).toBe('2024-12-15');
      expect(result.is_current).toBe(true);
      expect(result.description).toBe('Fall league');
    });

    it('handles minimal input', () => {
      const input = { label: 'Minimal Season' };
      const result = seasonWriteToDb(input);

      expect(result.label).toBe('Minimal Season');
      expect(result.start_date).toBeUndefined();
      expect(result.end_date).toBeUndefined();
      expect(result.is_current).toBe(false);
      expect(result.description).toBeUndefined();
    });

    it('defaults isCurrent to false', () => {
      const input = { label: 'Test' };
      expect(seasonWriteToDb(input).is_current).toBe(false);
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
      const stored: EnhancedSeason = {
        id: 'season-roundtrip',
        season_id: 'season-roundtrip',
        ...dbFormat,
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      } as EnhancedSeason;

      const readBack = dbToSeason(stored);

      expect(readBack.label).toBe(original.label);
      expect(readBack.startDate).toBe(original.startDate);
      expect(readBack.endDate).toBe(original.endDate);
      expect(readBack.isCurrent).toBe(original.isCurrent);
      expect(readBack.description).toBe(original.description);
    });
  });
});
