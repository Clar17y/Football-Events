import { describe, it, expect } from 'vitest';
import { dbToTeam, dbToTeams, teamWriteToDb } from '../../../src/db/transforms/teams';
import type { DbTeam } from '../../../src/db/schema';

describe('teams transforms', () => {
  const mockDbTeam: DbTeam = {
    id: 'team-123',
    teamId: 'team-123',
    name: 'Test FC',
    homeKitPrimary: '#ff0000',
    homeKitSecondary: '#ffffff',
    awayKitPrimary: '#0000ff',
    awayKitSecondary: '#ffff00',
    colorPrimary: '#ff0000',
    colorSecondary: '#ffffff',
    awayColorPrimary: '#0000ff',
    awayColorSecondary: '#ffff00',
    logoUrl: 'https://example.com/logo.png',
    isOpponent: false,
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
    createdByUserId: 'user-456',
    isDeleted: false,
    synced: true,
  };

  describe('dbToTeam', () => {
    it('transforms all fields correctly', () => {
      const result = dbToTeam(mockDbTeam);

      expect(result.id).toBe('team-123');
      expect(result.name).toBe('Test FC');
      expect(result.homeKitPrimary).toBe('#ff0000');
      expect(result.homeKitSecondary).toBe('#ffffff');
      expect(result.awayKitPrimary).toBe('#0000ff');
      expect(result.awayKitSecondary).toBe('#ffff00');
      expect(result.logoUrl).toBe('https://example.com/logo.png');
      expect(result.isOpponent).toBe(false);
      expect(result.createdAt).toBe('2023-11-14T22:13:20.000Z');
      expect(result.updatedAt).toBe('2023-11-14T22:13:21.000Z');
      expect(result.createdByUserId).toBe('user-456');
      expect(result.isDeleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalTeam: DbTeam = {
        id: 'team-minimal',
        teamId: 'team-minimal',
        name: 'Minimal FC',
        createdAt: '2023-11-14T22:13:20.000Z',
        updatedAt: '2023-11-14T22:13:20.000Z',
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
        isOpponent: false,
      };

      const result = dbToTeam(minimalTeam);

      expect(result.homeKitPrimary).toBeUndefined();
      expect(result.homeKitSecondary).toBeUndefined();
      expect(result.awayKitPrimary).toBeUndefined();
      expect(result.awayKitSecondary).toBeUndefined();
      expect(result.logoUrl).toBeUndefined();
      expect(result.isOpponent).toBe(false);
    });

    it('converts isOpponent to boolean', () => {
      const opponentTeam = { ...mockDbTeam, isOpponent: true };
      expect(dbToTeam(opponentTeam).isOpponent).toBe(true);

      const nonOpponentTeam = { ...mockDbTeam, isOpponent: undefined as unknown as boolean };
      expect(dbToTeam(nonOpponentTeam).isOpponent).toBe(false);
    });

    it('handles soft delete fields', () => {
      const deletedTeam: DbTeam = {
        ...mockDbTeam,
        isDeleted: true,
        deletedAt: '2023-11-14T22:13:22.000Z',
        deletedByUserId: 'user-admin',
      };

      const result = dbToTeam(deletedTeam);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).toBe('2023-11-14T22:13:22.000Z');
      expect(result.deletedByUserId).toBe('user-admin');
    });
  });

  describe('dbToTeams', () => {
    it('transforms array of teams', () => {
      const teams = [mockDbTeam, { ...mockDbTeam, id: 'team-456', teamId: 'team-456', name: 'Another FC' }];
      const result = dbToTeams(teams);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('team-123');
      expect(result[1].id).toBe('team-456');
      expect(result[1].name).toBe('Another FC');
    });

    it('handles empty array', () => {
      expect(dbToTeams([])).toEqual([]);
    });
  });

  describe('teamWriteToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        name: 'New Team',
        homeKitPrimary: '#ff0000',
        homeKitSecondary: '#ffffff',
        awayKitPrimary: '#0000ff',
        awayKitSecondary: '#ffff00',
        logoUrl: 'https://example.com/logo.png',
        isOpponent: true,
      };

      const result = teamWriteToDb(input);

      expect(result.name).toBe('New Team');
      expect(result.homeKitPrimary).toBe('#ff0000');
      expect(result.homeKitSecondary).toBe('#ffffff');
      expect(result.awayKitPrimary).toBe('#0000ff');
      expect(result.awayKitSecondary).toBe('#ffff00');
      expect(result.logoUrl).toBe('https://example.com/logo.png');
      expect(result.isOpponent).toBe(true);
      // Legacy aliases
      expect(result.colorPrimary).toBe('#ff0000');
      expect(result.colorSecondary).toBe('#ffffff');
      expect(result.awayColorPrimary).toBe('#0000ff');
      expect(result.awayColorSecondary).toBe('#ffff00');
    });

    it('handles minimal input', () => {
      const input = { name: 'Minimal Team' };
      const result = teamWriteToDb(input);

      expect(result.name).toBe('Minimal Team');
      expect(result.homeKitPrimary).toBeUndefined();
      expect(result.isOpponent).toBe(false);
    });

    it('defaults isOpponent to false', () => {
      const input = { name: 'Test' };
      expect(teamWriteToDb(input).isOpponent).toBe(false);
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        name: 'Roundtrip FC',
        homeKitPrimary: '#ff0000',
        homeKitSecondary: '#ffffff',
        isOpponent: false,
      };

      const dbFormat = teamWriteToDb(original);
      const stored: DbTeam = {
        id: 'team-roundtrip',
        teamId: 'team-roundtrip',
        ...dbFormat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as DbTeam;

      const readBack = dbToTeam(stored);

      expect(readBack.name).toBe(original.name);
      expect(readBack.homeKitPrimary).toBe(original.homeKitPrimary);
      expect(readBack.homeKitSecondary).toBe(original.homeKitSecondary);
      expect(readBack.isOpponent).toBe(original.isOpponent);
    });
  });
});
