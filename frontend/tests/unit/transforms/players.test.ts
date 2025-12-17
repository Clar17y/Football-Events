import { describe, it, expect } from 'vitest';
import { dbToPlayer, dbToPlayers, playerWriteToDb } from '../../../src/db/transforms/players';
import type { EnhancedPlayer } from '../../../src/db/schema';

describe('players transforms', () => {
  const mockDbPlayer: EnhancedPlayer = {
    id: 'player-123',
    fullName: 'John Smith',
    squadNumber: 10,
    preferredPos: 'MF',
    dob: '2010-05-15',
    notes: 'Great midfielder',
    currentTeam: 'team-456',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
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
      expect(result.dateOfBirth).toEqual(new Date('2010-05-15'));
      expect(result.notes).toBe('Great midfielder');
      expect(result.currentTeam).toBe('team-456');
      expect(result.createdAt).toEqual(new Date(1700000000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-789');
      expect(result.is_deleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalPlayer: EnhancedPlayer = {
        id: 'player-minimal',
        fullName: 'Jane Doe',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
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
      const deletedPlayer: EnhancedPlayer = {
        ...mockDbPlayer,
        isDeleted: true,
        deletedAt: 1700000002000,
        deletedByUserId: 'user-admin',
      };

      const result = dbToPlayer(deletedPlayer);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToPlayers', () => {
    it('transforms array of players', () => {
      const players = [
        mockDbPlayer,
        { ...mockDbPlayer, id: 'player-456', fullName: 'Bob Jones' },
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

      expect(result.fullName).toBe('New Player');
      expect(result.squadNumber).toBe(7);
      expect(result.preferredPos).toBe('FW');
      expect(result.dob).toBe('2012-03-20');
      expect(result.notes).toBe('Promising striker');
      expect(result.currentTeam).toBe('team-123');
    });

    it('handles minimal input', () => {
      const input = { name: 'Minimal Player' };
      const result = playerWriteToDb(input);

      expect(result.fullName).toBe('Minimal Player');
      expect(result.squadNumber).toBeUndefined();
      expect(result.preferredPos).toBeUndefined();
      expect(result.dob).toBeUndefined();
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
      const stored: EnhancedPlayer = {
        id: 'player-roundtrip',
        ...dbFormat,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as EnhancedPlayer;

      const readBack = dbToPlayer(stored);

      expect(readBack.name).toBe(original.name);
      expect(readBack.squadNumber).toBe(original.squadNumber);
      expect(readBack.preferredPosition).toBe(original.preferredPosition);
      expect(readBack.dateOfBirth).toEqual(new Date(original.dateOfBirth));
      expect(readBack.currentTeam).toBe(original.teamId);
    });
  });
});
