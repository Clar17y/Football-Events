import { describe, it, expect } from 'vitest';
import { dbToPlayer, dbToPlayers, playerWriteToDb } from '../../../src/db/transforms/players';
import type { DbPlayer } from '../../../src/db/schema';

describe('players transforms', () => {
  const mockDbPlayer: DbPlayer = {
    id: 'player-123',
    name: 'John Smith',
    squadNumber: 10,
    preferredPosition: 'MF',
    dateOfBirth: '2010-05-15',
    notes: 'Great midfielder',
    currentTeam: 'team-456',
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
    createdByUserId: 'user-789',
    isDeleted: false,
    synced: true,
  };

  describe('dbToPlayer', () => {
    it('transforms all fields correctly', () => {
      const result = dbToPlayer(mockDbPlayer);

      expect(result.id).toBe('player-123');
      expect(result.name).toBe('John Smith');
      expect(result.squadNumber).toBe(10);
      expect(result.preferredPosition).toBe('MF');
      expect(result.dateOfBirth).toBe('2010-05-15');
      expect(result.notes).toBe('Great midfielder');
      expect(result.currentTeam).toBe('team-456');
      expect(result.createdAt).toBe('2023-11-14T22:13:20.000Z');
      expect(result.updatedAt).toBe('2023-11-14T22:13:21.000Z');
      expect(result.createdByUserId).toBe('user-789');
      expect(result.isDeleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalPlayer: DbPlayer = {
        id: 'player-minimal',
        name: 'Jane Doe',
        createdAt: '2023-11-14T22:13:20.000Z',
        updatedAt: '2023-11-14T22:13:20.000Z',
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      };

      const result = dbToPlayer(minimalPlayer);

      expect(result.name).toBe('Jane Doe');
      expect(result.squadNumber).toBeUndefined();
      expect(result.preferredPosition).toBeUndefined();
      expect(result.dateOfBirth).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.currentTeam).toBeUndefined();
    });

    it('handles soft delete fields', () => {
      const deletedPlayer: DbPlayer = {
        ...mockDbPlayer,
        isDeleted: true,
        deletedAt: '2023-11-14T22:13:22.000Z',
        deletedByUserId: 'user-admin',
      };

      const result = dbToPlayer(deletedPlayer);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).toBe('2023-11-14T22:13:22.000Z');
      expect(result.deletedByUserId).toBe('user-admin');
    });
  });

  describe('dbToPlayers', () => {
    it('transforms array of players', () => {
      const players = [
        mockDbPlayer,
        { ...mockDbPlayer, id: 'player-456', name: 'Bob Jones' },
      ];
      const result = dbToPlayers(players);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('player-123');
      expect(result[1].id).toBe('player-456');
      expect(result[1].name).toBe('Bob Jones');
    });

    it('handles empty array', () => {
      expect(dbToPlayers([])).toEqual([]);
    });
  });

  describe('playerWriteToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        name: 'New Player',
        squadNumber: 7,
        preferredPosition: 'FW',
        dateOfBirth: '2012-03-20',
        notes: 'Promising striker',
        teamId: 'team-123',
      };

      const result = playerWriteToDb(input);

      expect(result.name).toBe('New Player');
      expect(result.squadNumber).toBe(7);
      expect(result.preferredPosition).toBe('FW');
      expect(result.dateOfBirth).toBe('2012-03-20');
      expect(result.notes).toBe('Promising striker');
      expect(result.currentTeam).toBe('team-123');
    });

    it('handles minimal input', () => {
      const input = { name: 'Minimal Player' };
      const result = playerWriteToDb(input);

      expect(result.name).toBe('Minimal Player');
      expect(result.squadNumber).toBeUndefined();
      expect(result.preferredPosition).toBeUndefined();
      expect(result.dateOfBirth).toBeUndefined();
      expect(result.currentTeam).toBeUndefined();
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        name: 'Roundtrip Player',
        squadNumber: 9,
        preferredPosition: 'FW',
        dateOfBirth: '2011-07-10',
        teamId: 'team-123',
      };

      const dbFormat = playerWriteToDb(original);
      const stored: DbPlayer = {
        id: 'player-roundtrip',
        ...dbFormat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as DbPlayer;

      const readBack = dbToPlayer(stored);

      expect(readBack.name).toBe(original.name);
      expect(readBack.squadNumber).toBe(original.squadNumber);
      expect(readBack.preferredPosition).toBe(original.preferredPosition);
      expect(readBack.dateOfBirth).toBe(original.dateOfBirth);
      expect(readBack.currentTeam).toBe(original.teamId);
    });
  });
});
