/**
 * Unit tests for Sync Service
 *
 * Tests the sync functions for all tables using direct API client calls.
 * The sync service now uses apiClient directly instead of API service methods.
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

vi.mock('../../../src/services/api/matchesApi', () => ({
  matchesApi: {
    startMatch: vi.fn(),
    pauseMatch: vi.fn(),
    completeMatch: vi.fn(),
    getMatchState: vi.fn(),
    startPeriod: vi.fn(),
    deleteMatch: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/lineupsApi', () => ({
  lineupsApi: {
    create: vi.fn(),
    deleteByKey: vi.fn(),
  },
}));

vi.mock('../../../src/services/api/defaultLineupsApi', () => ({
  defaultLineupsApi: {
    saveDefaultLineup: vi.fn(),
    deleteDefaultLineup: vi.fn(),
  },
}));

vi.mock('../../../src/services/importService', () => ({
  isGuestId: vi.fn((id: string) => id?.startsWith('guest-')),
  hasGuestData: vi.fn(() => Promise.resolve(false)),
}));

// Import after mocks are set up
import { syncService, type SyncProgress } from '../../../src/services/syncService';
import { apiClient } from '../../../src/services/api/baseApi';
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
    (apiClient.post as Mock).mockResolvedValue({ data: { id: 'server-id' } });
    (apiClient.put as Mock).mockResolvedValue({ data: { id: 'server-id' } });
    (apiClient.delete as Mock).mockResolvedValue({});
    (lineupsApi.create as Mock).mockResolvedValue({ data: { id: 'server-lineup-id' } });
    (defaultLineupsApi.saveDefaultLineup as Mock).mockResolvedValue({ success: true });

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      // Add unsynced season with guest user (should be excluded)
      await db.seasons.add({
        id: 'season-2',
        seasonId: 'season-2',
        label: 'Guest Season',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'guest-456',
        isDeleted: false,
        synced: false,
      } as any);

      const result = await syncService.flushOnce();

      // Only the authenticated user's season should be synced via apiClient.post
      expect(apiClient.post).toHaveBeenCalledWith(
        '/seasons',
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: true,
      } as any);

      await syncService.flushOnce();

      // Should not call post for already synced seasons
      expect(apiClient.post).not.toHaveBeenCalledWith('/seasons', expect.anything());
    });
  });

  describe('syncTeams', () => {
    it('should sync unsynced teams excluding guest records', async () => {
      await db.teams.add({
        id: 'team-1',
        teamId: 'team-1',
        name: 'Test Team',
        homeKitPrimary: '#ff0000',
        homeKitSecondary: '#0000ff',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await db.teams.add({
        id: 'team-2',
        teamId: 'team-2',
        name: 'Guest Team',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'guest-456',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/teams',
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
        name: 'Test Player',
        squadNumber: 10,
        preferredPosition: 'MID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/players',
        expect.objectContaining({ name: 'Test Player' })
      );

      const player = await db.players.get('player-1');
      expect(player?.synced).toBe(true);
    });

    it('should sync unsynced players with team using players-with-team endpoint', async () => {
      await db.players.add({
        id: 'player-1',
        name: 'Team Player',
        squadNumber: 7,
        preferredPosition: 'FWD',
        currentTeam: 'team-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'user-123',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/players-with-team',
        expect.objectContaining({
          name: 'Team Player',
          teamId: 'team-123',
        })
      );
    });

    it('should exclude guest players from sync', async () => {
      await db.players.add({
        id: 'player-1',
        name: 'Guest Player',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'guest-789',
        isDeleted: false,
        synced: false,
      } as any);

      await syncService.flushOnce();

      expect(apiClient.post).not.toHaveBeenCalledWith('/players', expect.anything());
      expect(apiClient.post).not.toHaveBeenCalledWith('/players-with-team', expect.anything());
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
        kickoffTime: new Date().toISOString(),
        durationMinutes: 60,
        periodFormat: 'quarter',
        homeScore: 0,
        awayScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        startMinute: 0,
        position: 'CM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

  describe('getPendingCounts', () => {
    it('should return correct pending counts for all tables', async () => {
      // Add unsynced records for authenticated user
      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);
      await db.seasons.add({
        id: 's2', seasonId: 's2', label: 'S2', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await db.teams.add({
        id: 't1', teamId: 't1', name: 'T1', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      // Add guest record (should not be counted)
      await db.players.add({
        id: 'p1', name: 'Guest Player', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'guest-123', isDeleted: false, synced: false,
      } as any);

      // Add synced record (should not be counted)
      await db.matches.add({
        id: 'm1', matchId: 'm1', seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2',
        kickoffTime: new Date().toISOString(), durationMinutes: 60, periodFormat: 'quarter',
        homeScore: 0, awayScore: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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
        id: 's1', seasonId: 's1', label: 'S1', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      await syncService.flushOnce();

      window.removeEventListener('sync:progress', handler);

      // Should have emitted at least 2 progress events (start and end)
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should not sync when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      const result = await syncService.flushOnce();

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });

    it('should not sync when not authenticated', async () => {
      (apiClient.isAuthenticated as Mock).mockReturnValue(false);

      await db.seasons.add({
        id: 's1', seasonId: 's1', label: 'S1', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), createdByUserId: 'user-1', isDeleted: false, synced: false,
      } as any);

      const result = await syncService.flushOnce();

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });
  });
});
