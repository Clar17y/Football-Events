import { describe, it, expect } from 'vitest';
import { dbToMatch, dbToMatches, matchWriteToDb } from '../../../src/db/transforms/matches';
import type { DbMatch } from '../../../src/db/schema';

describe('matches transforms', () => {
  const mockDbMatch: DbMatch = {
    id: 'match-123',
    matchId: 'match-123',
    seasonId: 'season-456',
    kickoffTime: '2023-11-14T22:13:20.000Z',
    competition: 'League Cup',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    venue: 'Main Stadium',
    durationMinutes: 60,
    periodFormat: 'quarter',
    homeScore: 2,
    awayScore: 1,
    notes: 'Great game',
    createdAt: '2023-11-13T18:26:40.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
    createdByUserId: 'user-789',
    isDeleted: false,
    synced: true,
  };

  describe('dbToMatch', () => {
    it('transforms all fields correctly', () => {
      const result = dbToMatch(mockDbMatch);

      expect(result.id).toBe('match-123');
      expect(result.seasonId).toBe('season-456');
      expect(result.kickoffTime).toBe('2023-11-14T22:13:20.000Z');
      expect(result.competition).toBe('League Cup');
      expect(result.homeTeamId).toBe('team-home');
      expect(result.awayTeamId).toBe('team-away');
      expect(result.venue).toBe('Main Stadium');
      expect(result.durationMinutes).toBe(60);
      expect(result.periodFormat).toBe('quarter');
      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.notes).toBe('Great game');
      expect(result.createdAt).toBe('2023-11-13T18:26:40.000Z');
      expect(result.updatedAt).toBe('2023-11-14T22:13:21.000Z');
      expect(result.createdByUserId).toBe('user-789');
      expect(result.isDeleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalMatch: DbMatch = {
        id: 'match-minimal',
        matchId: 'match-minimal',
        seasonId: 'season-1',
        kickoffTime: '2023-11-14T22:13:20.000Z',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        durationMinutes: 60,
        periodFormat: 'half',
        createdAt: '2023-11-14T22:13:20.000Z',
        updatedAt: '2023-11-14T22:13:20.000Z',
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
      const result = dbToMatch(matchNoScores as unknown as DbMatch);

      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });

    it('handles soft delete fields', () => {
      const deletedMatch: DbMatch = {
        ...mockDbMatch,
        isDeleted: true,
        deletedAt: '2023-11-14T22:13:22.000Z',
        deletedByUserId: 'user-admin',
      };

      const result = dbToMatch(deletedMatch);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).toBe('2023-11-14T22:13:22.000Z');
      expect(result.deletedByUserId).toBe('user-admin');
    });
  });

  describe('dbToMatches', () => {
    it('transforms array of matches', () => {
      const matches = [
        mockDbMatch,
        { ...mockDbMatch, id: 'match-456', matchId: 'match-456', competition: 'Friendly' },
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
    it('transforms write input to db format with ISO string', () => {
      const input = {
        seasonId: 'season-123',
        kickoffTime: '2023-11-14T22:13:20.000Z',
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
      expect(result.kickoffTime).toBe('2023-11-14T22:13:20.000Z');
      expect(result.homeTeamId).toBe('team-home');
      expect(result.awayTeamId).toBe('team-away');
      expect(result.competition).toBe('Cup Final');
      expect(result.venue).toBe('Stadium');
      expect(result.durationMinutes).toBe(90);
      expect(result.periodFormat).toBe('half');
      expect(result.homeScore).toBe(3);
      expect(result.awayScore).toBe(2);
      expect(result.notes).toBe('Final match');
    });

    it('handles minimal input with defaults', () => {
      const input = {
        seasonId: 'season-1',
        kickoffTime: '2023-11-14T22:13:20.000Z',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
      };

      const result = matchWriteToDb(input);

      expect(result.durationMinutes).toBe(60);
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
        kickoffTime: '2023-11-14T22:13:20.000Z',
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
      const stored: DbMatch = {
        id: 'match-roundtrip',
        matchId: 'match-roundtrip',
        ...dbFormat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as DbMatch;

      const readBack = dbToMatch(stored);

      expect(readBack.seasonId).toBe(original.seasonId);
      expect(readBack.kickoffTime).toBe(original.kickoffTime);
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
