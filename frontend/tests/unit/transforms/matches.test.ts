import { describe, it, expect } from 'vitest';
import { dbToMatch, dbToMatches, matchWriteToDb } from '../../../src/db/transforms/matches';
import type { EnhancedMatch } from '../../../src/db/schema';

describe('matches transforms', () => {
  const mockDbMatch: EnhancedMatch = {
    id: 'match-123',
    match_id: 'match-123',
    season_id: 'season-456',
    kickoff_ts: 1700000000000,
    competition: 'League Cup',
    home_team_id: 'team-home',
    away_team_id: 'team-away',
    venue: 'Main Stadium',
    duration_mins: 60,
    period_format: 'quarter',
    home_score: 2,
    away_score: 1,
    notes: 'Great game',
    created_at: 1699900000000,
    updated_at: 1700000001000,
    created_by_user_id: 'user-789',
    is_deleted: false,
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
        match_id: 'match-minimal',
        season_id: 'season-1',
        kickoff_ts: 1700000000000,
        home_team_id: 'team-1',
        away_team_id: 'team-2',
        duration_mins: 60,
        period_format: 'half',
        created_at: 1700000000000,
        updated_at: 1700000000000,
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      };

      const result = dbToMatch(minimalMatch);

      expect(result.competition).toBeUndefined();
      expect(result.venue).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });

    it('defaults scores to 0 when null/undefined', () => {
      const matchNoScores = { ...mockDbMatch, home_score: undefined, away_score: null };
      const result = dbToMatch(matchNoScores as unknown as EnhancedMatch);

      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });

    it('handles soft delete fields', () => {
      const deletedMatch: EnhancedMatch = {
        ...mockDbMatch,
        is_deleted: true,
        deleted_at: 1700000002000,
        deleted_by_user_id: 'user-admin',
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

      expect(result.season_id).toBe('season-123');
      expect(result.kickoff_ts).toBe(1700000000000);
      expect(result.home_team_id).toBe('team-home');
      expect(result.away_team_id).toBe('team-away');
      expect(result.competition).toBe('Cup Final');
      expect(result.venue).toBe('Stadium');
      expect(result.duration_mins).toBe(90);
      expect(result.period_format).toBe('half');
      expect(result.home_score).toBe(3);
      expect(result.away_score).toBe(2);
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
      expect(result.kickoff_ts).toBe(new Date('2024-01-15T14:00:00Z').getTime());
    });

    it('handles minimal input with defaults', () => {
      const input = {
        seasonId: 'season-1',
        kickoffTime: 1700000000000,
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
      };

      const result = matchWriteToDb(input);

      expect(result.duration_mins).toBe(60);
      expect(result.period_format).toBe('quarter');
      expect(result.home_score).toBe(0);
      expect(result.away_score).toBe(0);
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
        match_id: 'match-roundtrip',
        ...dbFormat,
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by_user_id: 'user-1',
        is_deleted: false,
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
