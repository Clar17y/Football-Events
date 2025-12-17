import { describe, it, expect } from 'vitest';
import { dbToMatch, dbToMatches, matchWriteToDb } from '../../../src/db/transforms/matches';
import type { EnhancedMatch } from '../../../src/db/schema';

describe('matches transforms', () => {
  const mockDbMatch: EnhancedMatch = {
    id: 'match-123',
    matchId: 'match-123',
    seasonId: 'season-456',
    kickoffTs: 1700000000000,
    competition: 'League Cup',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    venue: 'Main Stadium',
    durationMins: 60,
    periodFormat: 'quarter',
    homeScore: 2,
    awayScore: 1,
    notes: 'Great game',
    createdAt: 1699900000000,
    updatedAt: 1700000001000,
    createdByUserId: 'user-789',
    isDeleted: false,
    synced: true,
  };

  describe('dbToMatch', () => {
    it('transforms all fields correctly', () => {
      const result = dbToMatch(mockDbMatch);

      expect(result.id).toBe('match-123');
      expect(result.seasonId).toBe('season-456');
      expect(result.kickoffTime).toEqual(new Date(1700000000000));
      expect(result.competition).toBe('League Cup');
      expect(result.homeTeamId).toBe('team-home');
      expect(result.awayTeamId).toBe('team-away');
      expect(result.venue).toBe('Main Stadium');
      expect(result.durationMinutes).toBe(60);
      expect(result.periodFormat).toBe('quarter');
      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.notes).toBe('Great game');
      expect(result.createdAt).toEqual(new Date(1699900000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-789');
      expect(result.is_deleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalMatch: EnhancedMatch = {
        id: 'match-minimal',
        matchId: 'match-minimal',
        seasonId: 'season-1',
        kickoffTs: 1700000000000,
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        durationMins: 60,
        periodFormat: 'half',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
        homeScore: 0,
        awayScore: 0,
      };

      const result = dbToMatch(minimalMatch);

      expect(result.competition).toBeUndefined();
      expect(result.venue).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });

    it('defaults scores to 0 when null/undefined', () => {
      const matchNoScores = { ...mockDbMatch, homeScore: undefined, awayScore: null };
      const result = dbToMatch(matchNoScores as unknown as EnhancedMatch);

      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });

    it('handles soft delete fields', () => {
      const deletedMatch: EnhancedMatch = {
        ...mockDbMatch,
        isDeleted: true,
        deletedAt: 1700000002000,
        deletedByUserId: 'user-admin',
      };

      const result = dbToMatch(deletedMatch);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToMatches', () => {
    it('transforms array of matches', () => {
      const matches = [
        mockDbMatch,
        { ...mockDbMatch, id: 'match-456', competition: 'Friendly' },
      ];
      const result = dbToMatches(matches);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('match-123');
      expect(result[1].id).toBe('match-456');
      expect(result[1].competition).toBe('Friendly');
    });

    it('handles empty array', () => {
      expect(dbToMatches([])).toEqual([]);
    });
  });

  describe('matchWriteToDb', () => {
    it('transforms write input to db format with timestamp number', () => {
      const input = {
        seasonId: 'season-123',
        kickoffTime: 1700000000000,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        competition: 'Cup Final',
        venue: 'Stadium',
        durationMinutes: 90,
        periodFormat: 'half' as const,
        homeScore: 3,
        awayScore: 2,
        notes: 'Final match',
      };

      const result = matchWriteToDb(input);

      expect(result.seasonId).toBe('season-123');
      expect(result.kickoffTs).toBe(1700000000000);
      expect(result.homeTeamId).toBe('team-home');
      expect(result.awayTeamId).toBe('team-away');
      expect(result.competition).toBe('Cup Final');
      expect(result.venue).toBe('Stadium');
      expect(result.durationMins).toBe(90);
      expect(result.periodFormat).toBe('half');
      expect(result.homeScore).toBe(3);
      expect(result.awayScore).toBe(2);
      expect(result.notes).toBe('Final match');
    });

    it('transforms write input with ISO string kickoffTime', () => {
      const input = {
        seasonId: 'season-123',
        kickoffTime: '2024-01-15T14:00:00Z',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
      };

      const result = matchWriteToDb(input);
      expect(result.kickoffTs).toBe(new Date('2024-01-15T14:00:00Z').getTime());
    });

    it('handles minimal input with defaults', () => {
      const input = {
        seasonId: 'season-1',
        kickoffTime: 1700000000000,
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
      };

      const result = matchWriteToDb(input);

      expect(result.durationMins).toBe(60);
      expect(result.periodFormat).toBe('quarter');
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
      expect(result.competition).toBeUndefined();
      expect(result.venue).toBeUndefined();
      expect(result.notes).toBeUndefined();
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        seasonId: 'season-roundtrip',
        kickoffTime: 1700000000000,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        competition: 'Test League',
        venue: 'Test Stadium',
        durationMinutes: 80,
        periodFormat: 'half' as const,
        homeScore: 1,
        awayScore: 1,
        notes: 'Draw game',
      };

      const dbFormat = matchWriteToDb(original);
      const stored: EnhancedMatch = {
        id: 'match-roundtrip',
        matchId: 'match-roundtrip',
        ...dbFormat,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as EnhancedMatch;

      const readBack = dbToMatch(stored);

      expect(readBack.seasonId).toBe(original.seasonId);
      expect(readBack.kickoffTime.getTime()).toBe(original.kickoffTime);
      expect(readBack.homeTeamId).toBe(original.homeTeamId);
      expect(readBack.awayTeamId).toBe(original.awayTeamId);
      expect(readBack.competition).toBe(original.competition);
      expect(readBack.venue).toBe(original.venue);
      expect(readBack.durationMinutes).toBe(original.durationMinutes);
      expect(readBack.periodFormat).toBe(original.periodFormat);
      expect(readBack.homeScore).toBe(original.homeScore);
      expect(readBack.awayScore).toBe(original.awayScore);
      expect(readBack.notes).toBe(original.notes);
    });
  });
});
