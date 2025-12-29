import { describe, it, expect } from 'vitest';
import { dbToLineup, dbToLineups, lineupWriteToDb, generateLineupId } from '../../../src/db/transforms/lineups';
import type { DbLineup } from '../../../src/db/schema';

describe('lineups transforms', () => {
  const mockDbLineup: DbLineup = {
    id: 'match-123-player-456-0',
    matchId: 'match-123',
    playerId: 'player-456',
    startMinute: 0,
    endMinute: 45,
    position: 'MF',
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
    createdByUserId: 'user-789',
    isDeleted: false,
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
      expect(result.createdAt).toBe('2023-11-14T22:13:20.000Z');
      expect(result.updatedAt).toBe('2023-11-14T22:13:21.000Z');
      expect(result.createdByUserId).toBe('user-789');
      expect(result.isDeleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const activeLineup: DbLineup = {
        id: 'lineup-active',
        matchId: 'match-1',
        playerId: 'player-1',
        startMinute: 0,
        position: 'GK',
        createdAt: '2023-11-14T22:13:20.000Z',
        updatedAt: '2023-11-14T22:13:20.000Z',
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      };

      const result = dbToLineup(activeLineup);

      expect(result.endMinute).toBeUndefined(); // Player still on field
    });

    it('handles soft delete fields', () => {
      const deletedLineup: DbLineup = {
        ...mockDbLineup,
        isDeleted: true,
        deletedAt: '2023-11-14T22:13:22.000Z',
        deletedByUserId: 'user-admin',
      };

      const result = dbToLineup(deletedLineup);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).toBe('2023-11-14T22:13:22.000Z');
      expect(result.deletedByUserId).toBe('user-admin');
    });
  });

  describe('dbToLineups', () => {
    it('transforms array of lineups', () => {
      const lineups = [
        mockDbLineup,
        { ...mockDbLineup, id: 'match-123-player-789-0', playerId: 'player-789', position: 'FW' },
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
        startMinute: 0,
        endMinute: 60,
        position: 'DF',
      };

      const result = lineupWriteToDb(input);

      expect(result.matchId).toBe('match-123');
      expect(result.playerId).toBe('player-456');
      expect(result.startMinute).toBe(0);
      expect(result.endMinute).toBe(60);
      expect(result.position).toBe('DF');
    });

    it('handles active player (no endMinute)', () => {
      const input = {
        matchId: 'match-123',
        playerId: 'player-456',
        startMinute: 0,
        position: 'MF',
      };

      const result = lineupWriteToDb(input);

      expect(result.endMinute).toBeUndefined();
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
        startMinute: 0,
        endMinute: 90,
        position: 'MF',
      };

      const dbFormat = lineupWriteToDb(original);
      const stored: DbLineup = {
        id: generateLineupId(original.matchId, original.playerId, original.startMinute),
        ...dbFormat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as DbLineup;

      const readBack = dbToLineup(stored);

      expect(readBack.matchId).toBe(original.matchId);
      expect(readBack.playerId).toBe(original.playerId);
      expect(readBack.startMinute).toBe(original.startMinute);
      expect(readBack.endMinute).toBe(original.endMinute);
      expect(readBack.position).toBe(original.position);
    });

    it('handles substitution scenario', () => {
      // Player starts at 0, subbed off at 60
      const firstHalf = {
        matchId: 'match-sub',
        playerId: 'player-starter',
        startMinute: 0,
        endMinute: 60,
        position: 'FW',
      };

      // Substitute comes on at 60
      const substitute = {
        matchId: 'match-sub',
        playerId: 'player-sub',
        startMinute: 60,
        position: 'FW',
      };

      const dbFirstHalf = lineupWriteToDb(firstHalf);
      const dbSubstitute = lineupWriteToDb(substitute);

      expect(dbFirstHalf.endMinute).toBe(60);
      expect(dbSubstitute.startMinute).toBe(60);
      expect(dbSubstitute.endMinute).toBeUndefined();

      const firstHalfId = generateLineupId(firstHalf.matchId, firstHalf.playerId, firstHalf.startMinute);
      const subId = generateLineupId(substitute.matchId, substitute.playerId, substitute.startMinute);

      expect(firstHalfId).toBe('match-sub-player-starter-0');
      expect(subId).toBe('match-sub-player-sub-60');
    });
  });
});
