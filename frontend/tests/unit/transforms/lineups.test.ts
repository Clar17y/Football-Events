import { describe, it, expect } from 'vitest';
import { dbToLineup, dbToLineups, lineupWriteToDb, generateLineupId } from '../../../src/db/transforms/lineups';
import type { EnhancedLineup } from '../../../src/db/schema';

describe('lineups transforms', () => {
  const mockDbLineup: EnhancedLineup = {
    id: 'match-123-player-456-0',
    match_id: 'match-123',
    player_id: 'player-456',
    start_min: 0,
    end_min: 45,
    position: 'MF',
    created_at: 1700000000000,
    updated_at: 1700000001000,
    created_by_user_id: 'user-789',
    is_deleted: false,
    synced: true,
  };

  describe('dbToLineup', () => {
    it('transforms all fields correctly', () => {
      const result = dbToLineup(mockDbLineup);

      expect(result.id).toBe('match-123-player-456-0');
      expect(result.matchId).toBe('match-123');
      expect(result.playerId).toBe('player-456');
      expect(result.startMinute).toBe(0);
      expect(result.endMinute).toBe(45);
      expect(result.position).toBe('MF');
      expect(result.createdAt).toEqual(new Date(1700000000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-789');
      expect(result.is_deleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const activeLineup: EnhancedLineup = {
        id: 'lineup-active',
        match_id: 'match-1',
        player_id: 'player-1',
        start_min: 0,
        position: 'GK',
        created_at: 1700000000000,
        updated_at: 1700000000000,
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      };

      const result = dbToLineup(activeLineup);

      expect(result.endMinute).toBeUndefined(); // Player still on field
    });

    it('handles soft delete fields', () => {
      const deletedLineup: EnhancedLineup = {
        ...mockDbLineup,
        is_deleted: true,
        deleted_at: 1700000002000,
        deleted_by_user_id: 'user-admin',
      };

      const result = dbToLineup(deletedLineup);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToLineups', () => {
    it('transforms array of lineups', () => {
      const lineups = [
        mockDbLineup,
        { ...mockDbLineup, id: 'match-123-player-789-0', player_id: 'player-789', position: 'FW' },
      ];
      const result = dbToLineups(lineups);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('match-123-player-456-0');
      expect(result[1].playerId).toBe('player-789');
      expect(result[1].position).toBe('FW');
    });

    it('handles empty array', () => {
      expect(dbToLineups([])).toEqual([]);
    });
  });

  describe('lineupWriteToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        matchId: 'match-123',
        playerId: 'player-456',
        startMin: 0,
        endMin: 60,
        position: 'DF',
      };

      const result = lineupWriteToDb(input);

      expect(result.match_id).toBe('match-123');
      expect(result.player_id).toBe('player-456');
      expect(result.start_min).toBe(0);
      expect(result.end_min).toBe(60);
      expect(result.position).toBe('DF');
    });

    it('handles active player (no endMin)', () => {
      const input = {
        matchId: 'match-123',
        playerId: 'player-456',
        startMin: 0,
        position: 'MF',
      };

      const result = lineupWriteToDb(input);

      expect(result.end_min).toBeUndefined();
    });
  });

  describe('generateLineupId', () => {
    it('generates correct composite ID format', () => {
      const id = generateLineupId('match-123', 'player-456', 0);
      expect(id).toBe('match-123-player-456-0');
    });

    it('handles different start minutes', () => {
      expect(generateLineupId('match-1', 'player-1', 0)).toBe('match-1-player-1-0');
      expect(generateLineupId('match-1', 'player-1', 45)).toBe('match-1-player-1-45');
      expect(generateLineupId('match-1', 'player-1', 60)).toBe('match-1-player-1-60');
    });

    it('handles UUIDs in components', () => {
      const id = generateLineupId(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'f9e8d7c6-b5a4-3210-9876-543210fedcba',
        15
      );
      expect(id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890-f9e8d7c6-b5a4-3210-9876-543210fedcba-15');
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        matchId: 'match-roundtrip',
        playerId: 'player-roundtrip',
        startMin: 0,
        endMin: 90,
        position: 'MF',
      };

      const dbFormat = lineupWriteToDb(original);
      const stored: EnhancedLineup = {
        id: generateLineupId(original.matchId, original.playerId, original.startMin),
        ...dbFormat,
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      } as EnhancedLineup;

      const readBack = dbToLineup(stored);

      expect(readBack.matchId).toBe(original.matchId);
      expect(readBack.playerId).toBe(original.playerId);
      expect(readBack.startMinute).toBe(original.startMin);
      expect(readBack.endMinute).toBe(original.endMin);
      expect(readBack.position).toBe(original.position);
    });

    it('handles substitution scenario', () => {
      // Player starts at 0, subbed off at 60
      const firstHalf = {
        matchId: 'match-sub',
        playerId: 'player-starter',
        startMin: 0,
        endMin: 60,
        position: 'FW',
      };

      // Substitute comes on at 60
      const substitute = {
        matchId: 'match-sub',
        playerId: 'player-sub',
        startMin: 60,
        position: 'FW',
      };

      const dbFirstHalf = lineupWriteToDb(firstHalf);
      const dbSubstitute = lineupWriteToDb(substitute);

      expect(dbFirstHalf.end_min).toBe(60);
      expect(dbSubstitute.start_min).toBe(60);
      expect(dbSubstitute.end_min).toBeUndefined();

      const firstHalfId = generateLineupId(firstHalf.matchId, firstHalf.playerId, firstHalf.startMin);
      const subId = generateLineupId(substitute.matchId, substitute.playerId, substitute.startMin);

      expect(firstHalfId).toBe('match-sub-player-starter-0');
      expect(subId).toBe('match-sub-player-sub-60');
    });
  });
});
