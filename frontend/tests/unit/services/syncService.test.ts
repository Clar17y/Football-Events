/**
 * Unit tests for Sync Service
 *
 * Tests the sync functions for all tables:
 * - syncSeasons, syncTeams, syncPlayers, syncMatches, syncLineups, syncDefaultLineups
 * - flushOnce with correct dependency order
 * - Sync progress tracking
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 4.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { db } from '../../../src/db/indexedDB';

// Mock all API modules before importing syncService
vi.mock('../../../src/services/api/baseApi', () => ({
  apiClient: {
    isAuthenticated: vi.fn(() => true),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  default: {
    isAuthenticated: vi.fn(() => true),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/seasonsApi', () => ({
  seasonsApi: {
    createSeason: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/teamsApi', () => ({
  teamsApi: {
    createTeam: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/playersApi', () => ({
  playersApi: {
    createPlayer: vi.fn(),
    createPlayerWithTeam: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/lineupsApi', () => ({
  lineupsApi: {
    create: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/defaultLineupsApi', () => ({
  defaultLineupsApi: {
    saveDefaultLineup: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/eventsApi', () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/matchesApi', () => ({
  matchesApi: {
    startMatch: vi.fn(),
    pauseMatch: vi.fn(),
    completeMatch: vi.fn(),
    getMatchState: vi.fn(),
    startPeriod: vi.fn(),
  },
}));

vi.mock('../../../src/services/importService', () => ({
  isGuestId: vi.fn((id: string) => id?.startsWith('guest-')),
  hasGuestData: vi.fn(() => Promise.resolve(false)),
}));

// Import after mocks are set up
import { syncService, type SyncProgress } from '../../../src/services/syncService';
import { apiClient } from '../../../src/services/api/baseApi';
import { seasonsApi } from '../../../src/services/api/seasonsApi';
import { teamsApi } from '../../../src/services/api/teamsApi';
import { playersApi } from '../../../src/services/api/playersApi';
import { lineupsApi } from '../../../src/services/api/lineupsApi';
import { defaultLineupsApi } from '../../../src/services/api/defaultLineupsApi';

describe('Sync Service Unit Tests', () => {
  beforeEach(async () => {
    // Initialize the database
    await db.open();

    // Clear all tables before each test
    await db.seasons.clear();
    await db.teams.clear();
    await db.players.clear();
    await db.matches.clear();
    await db.lineup.clear();
    await db.defaultLineups.clear();
    await db.events.clear();
    await db.matchPeriods.clear();
    await db.matchState.clear();

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    (apiClient.isAuthenticated as Mock).mockReturnValue(true);
    (seasonsApi.createSeason as Mock).mockResolvedValue({ data: { id: 'server-season-id' } });
    (teamsApi.createTeam as Mock).mockResolvedValue({ data: { id: 'server-team-id' } });
    (playersApi.createPlayer as Mock).mockResolvedValue({ data: { id: 'server-player-id' } });
    (playersApi.createPlayerWithTeam as Mock).mockResolvedValue({ data: { id: 'server-player-id' } });
    (lineupsApi.create as Mock).mockResolvedValue({ data: { id: 'server-lineup-id' } });
    (defaultLineupsApi.saveDefaultLineup as Mock).mockResolvedValue({ success: true });
    (apiClient.post as Mock).mockResolvedValue({ data: { id: 'server-match-id' } });

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  afterEach(async () => {
    // Clean up after each test
    await db.seasons.clear();
    await db.teams.clear();
    await db.players.clear();
    await db.matches.clear();
    await db.lineup.clear();
    await db.defaultLineups.clear();
    await db.events.clear();
    await db.matchPeriods.clear();
    await db.matchState.clear();
  });

  describe('syncSeasons', () => {
    it('should sync unsynced seasons excluding guest records', async () => {
      // Add unsynced season with authenticated user
      await db.seasons.add({
        id: 'season-1',
        seasonId: 'season-1',
        label: 'Test Season',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      // Add unsynced season with guest user (should be excluded)
      await db.seasons.add({
        id: 'season-2',
        seasonId: 'season-2',
        label: 'Guest Season',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'guest-456',
        isDeleted: false,
        synced: false,
      } as any);

      const result = await syncService.flushOnce();

      // Only the authenticated user's season should be synced
      expect(seasonsApi.createSeason).toHaveBeenCalledTimes(1);
      expect(seasonsApi.createSeason).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Test Season' })
      );

      // Verify the synced flag was updated
      const season1 = await db.seasons.get('season-1');
      expect(season1?.synced).toBe(true);

      // Guest season should remain unsynced
      const season2 = await db.seasons.get('season-2');
      expect(season2?.synced).toBe(false);
    });

    it('should not sync already synced seasons', async () => {
      await db.seasons.add({
        id: 'season-1',
        seasonId: 'season-1',
        label: 'Already Synced',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: true,
      } as any);

      await syncService.flushOnce();

      expect(seasonsApi.createSeason).not.toHaveBeenCalled();
    });
  });

  describe('syncTeams', () => {
    it('should sync unsynced teams excluding guest records', async () => {
      await db.teams.add({
        id: 'team-1',
        teamId: 'team-1',
        name: 'Test Team',
        colorPrimary: '#ff0000',
        colorSecondary: '#0000ff',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await db.teams.add({
        id: 'team-2',
        teamId: 'team-2',
        name: 'Guest Team',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'guest-456',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(teamsApi.createTeam).toHaveBeenCalledTimes(1);
      expect(teamsApi.createTeam).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Team' })
      );

      const team1 = await db.teams.get('team-1');
      expect(team1?.synced).toBe(true);

      const team2 = await db.teams.get('team-2');
      expect(team2?.synced).toBe(false);
    });
  });

  describe('syncPlayers', () => {
    it('should sync unsynced players without team', async () => {
      await db.players.add({
        id: 'player-1',
        fullName: 'Test Player',
        squadNumber: 10,
        preferredPos: 'MID',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(playersApi.createPlayer).toHaveBeenCalledTimes(1);
      expect(playersApi.createPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Player' })
      );

      const player = await db.players.get('player-1');
      expect(player?.synced).toBe(true);
    });

    it('should sync unsynced players with team using createPlayerWithTeam', async () => {
      await db.players.add({
        id: 'player-1',
        fullName: 'Team Player',
        squadNumber: 7,
        preferredPos: 'FWD',
        currentTeam: 'team-123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(playersApi.createPlayerWithTeam).toHaveBeenCalledTimes(1);
      expect(playersApi.createPlayerWithTeam).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Team Player',
          teamId: 'team-123',
        })
      );
    });

    it('should exclude guest players from sync', async () => {
      await db.players.add({
        id: 'player-1',
        fullName: 'Guest Player',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'guest-789',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(playersApi.createPlayer).not.toHaveBeenCalled();
      expect(playersApi.createPlayerWithTeam).not.toHaveBeenCalled();
    });
  });

  describe('syncMatches', () => {
    it('should sync unsynced matches excluding guest records', async () => {
      await db.matches.add({
        id: 'match-1',
        matchId: 'match-1',
        seasonId: 'season-1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        kickoffTs: Date.now(),
        durationMins: 60,
        periodFormat: 'quarter',
        homeScore: 0,
        awayScore: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/matches',
        expect.objectContaining({
          seasonId: 'season-1',
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
        })
      );

      const match = await db.matches.get('match-1');
      expect(match?.synced).toBe(true);
    });
  });

  describe('syncLineups', () => {
    it('should sync unsynced lineups excluding guest records', async () => {
      await db.lineup.add({
        id: 'lineup-1',
        matchId: 'match-1',
        playerId: 'player-1',
        startMin: 0,
        position: 'CM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(lineupsApi.create).toHaveBeenCalledTimes(1);
      expect(lineupsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: 'match-1',
          playerId: 'player-1',
          position: 'CM',
        })
      );

      const lineup = await db.lineup.get('lineup-1');
      expect(lineup?.synced).toBe(true);
    });
  });

  describe('syncDefaultLineups', () => {
    it('should sync unsynced default lineups excluding guest records', async () => {
      await db.defaultLineups.add({
        id: 'default-lineup-1',
        teamId: 'team-1',
        formation: [{ playerId: 'p1', position: 'GK', pitchX: 50, pitchY: 90 }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(defaultLineupsApi.saveDefaultLineup).toHaveBeenCalledTimes(1);
      expect(defaultLineupsApi.saveDefaultLineup).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
        })
      );

      const defaultLineup = await db.defaultLineups.get('default-lineup-1');
      expect(defaultLineup?.synced).toBe(true);
    });
  });

  describe('flushOnce - Dependency Order', () => {
    it('should sync tables in correct dependency order', async () => {
      const callOrder: string[] = [];

      (seasonsApi.createSeason as Mock).mockImplementation(() => {
        callOrder.push('seasons');
        return Promise.resolve({ data: { id: 'server-season' } });
      });

      (teamsApi.createTeam as Mock).mockImplementation(() => {
        callOrder.push('teams');
        return Promise.resolve({ data: { id: 'server-team' } });
      });

      (playersApi.createPlayer as Mock).mockImplementation(() => {
        callOrder.push('players');
        return Promise.resolve({ data: { id: 'server-player' } });
      });

      (apiClient.post as Mock).mockImplementation((url: string) => {
        if (url === '/matches') {
          callOrder.push('matches');
        }
        return Promise.resolve({ data: { id: 'server-match' } });
      });

      (lineupsApi.create as Mock).mockImplementation(() => {
        callOrder.push('lineups');
        return Promise.resolve({ data: { id: 'server-lineup' } });
      });

      (defaultLineupsApi.saveDefaultLineup as Mock).mockImplementation(() => {
        callOrder.push('defaultLineups');
        return Promise.resolve({ success: true });
      });

      // Add one record to each table
      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.teams.add({
        id: 't1', teamId: 't1', name: 'T1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.players.add({
        id: 'p1', fullName: 'P1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.matches.add({
        id: 'm1', matchId: 'm1', seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2',
        kickoffTs: Date.now(), durationMins: 60, periodFormat: 'quarter',
        homeScore: 0, awayScore: 0, createdAt: Date.now(), updatedAt: Date.now(),
        createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.lineup.add({
        id: 'l1', matchId: 'm1', playerId: 'p1', startMin: 0, position: 'CM',
        createdAt: Date.now(), updatedAt: Date.now(),
        createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.defaultLineups.add({
        id: 'dl1', teamId: 't1', formation: [],
        createdAt: Date.now(), updatedAt: Date.now(),
        createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await syncService.flushOnce();

      // Verify order: seasons → teams → players → matches → lineups → defaultLineups
      expect(callOrder).toEqual(['seasons', 'teams', 'players', 'matches', 'lineups', 'defaultLineups']);
    });
  });

  describe('getPendingCounts', () => {
    it('should return correct pending counts for all tables', async () => {
      // Add unsynced records for authenticated user
      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);
      await db.seasons.add({
        id: 's2', seasonId: 's2', label: 'S2', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.teams.add({
        id: 't1', teamId: 't1', name: 'T1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      // Add guest record (should not be counted)
      await db.players.add({
        id: 'p1', fullName: 'Guest Player', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'guest-123', isDeleted: false, synced: false,
      } as any);

      // Add synced record (should not be counted)
      await db.matches.add({
        id: 'm1', matchId: 'm1', seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2',
        kickoffTs: Date.now(), durationMins: 60, periodFormat: 'quarter',
        homeScore: 0, awayScore: 0, createdAt: Date.now(), updatedAt: Date.now(),
        createdByUserId: 'user-1', isDeleted: false, synced: true,
      } as any);

      const progress = await syncService.getPendingCounts();

      expect(progress.seasons).toBe(2);
      expect(progress.teams).toBe(1);
      expect(progress.players).toBe(0); // Guest player excluded
      expect(progress.matches).toBe(0); // Already synced
      expect(progress.total).toBe(3); // 2 seasons + 1 team
    });
  });

  describe('Sync Progress Events', () => {
    it('should emit sync:progress events during flushOnce', async () => {
      const progressEvents: SyncProgress[] = [];
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent<SyncProgress>;
        progressEvents.push(customEvent.detail);
      };
      window.addEventListener('sync:progress', handler);

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await syncService.flushOnce();

      window.removeEventListener('sync:progress', handler);

      // Should have emitted at least 2 progress events (start and end)
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should continue syncing other records when one fails', async () => {
      // First call fails, second succeeds
      (seasonsApi.createSeason as Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { id: 'server-season' } });

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'Fail Season', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.seasons.add({
        id: 's2', seasonId: 's2', label: 'Success Season', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      const result = await syncService.flushOnce();

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].table).toBe('seasons');
    });

    it('should not sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      const result = await syncService.flushOnce();

      expect(seasonsApi.createSeason).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });

    it('should not sync when not authenticated', async () => {
      (apiClient.isAuthenticated as Mock).mockReturnValue(false);

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: Date.now(),
        updatedAt: Date.now(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      const result = await syncService.flushOnce();

      expect(seasonsApi.createSeason).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });
  });
});
