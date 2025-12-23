/**
 * Matches API quickStart Unit Tests
 * Tests the local-first quickStart implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QuickStartPayload } from '../../../src/services/api/matchesApi';

// Mock data stores
const mockTeams: any[] = [];
const mockSeasons: any[] = [];
const mockMatches: any[] = [];

// Mock the database
const mockDb = {
  teams: {
    toArray: vi.fn(() => Promise.resolve([...mockTeams])),
    get: vi.fn((id: string) => Promise.resolve(mockTeams.find(t => t.id === id))),
    filter: vi.fn((predicate: (t: any) => boolean) => ({
      first: vi.fn(() => Promise.resolve(mockTeams.filter(predicate)[0])),
      toArray: vi.fn(() => Promise.resolve(mockTeams.filter(predicate)))
    })),
    add: vi.fn((team: any) => {
      mockTeams.push(team);
      return Promise.resolve(team.id);
    }),
    put: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  seasons: {
    toArray: vi.fn(() => Promise.resolve([...mockSeasons])),
    get: vi.fn((id: string) => Promise.resolve(mockSeasons.find(s => s.id === id))),
    filter: vi.fn((predicate: (s: any) => boolean) => ({
      first: vi.fn(() => Promise.resolve(mockSeasons.filter(predicate)[0])),
      toArray: vi.fn(() => Promise.resolve(mockSeasons.filter(predicate)))
    })),
    add: vi.fn((season: any) => {
      mockSeasons.push(season);
      return Promise.resolve(season.id);
    }),
    put: vi.fn(),
    update: vi.fn()
  },
  matches: {
    toArray: vi.fn(() => Promise.resolve([...mockMatches])),
    get: vi.fn((id: string) => Promise.resolve(mockMatches.find(m => m.id === id))),
    filter: vi.fn((predicate: (m: any) => boolean) => ({
      first: vi.fn(() => Promise.resolve(mockMatches.filter(predicate)[0])),
      toArray: vi.fn(() => Promise.resolve(mockMatches.filter(predicate)))
    })),
    add: vi.fn((match: any) => {
      mockMatches.push(match);
      return Promise.resolve(match.id);
    }),
    put: vi.fn(),
    update: vi.fn()
  },
  matchState: {
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn()
  },
  matchPeriods: {
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        filter: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    add: vi.fn()
  }
};

// Mock the database module
vi.mock('../../../src/db/indexedDB', () => ({
  db: mockDb
}));

// Track data layer calls
const mockTeamsDataLayerCreate = vi.fn();
const mockSeasonsDataLayerCreate = vi.fn();
const mockMatchesDataLayerCreate = vi.fn();
const mockMatchesDataLayerUpdate = vi.fn();

// Mock the data layer
vi.mock('../../../src/services/dataLayer', () => ({
  teamsDataLayer: {
    create: (...args: any[]) => mockTeamsDataLayerCreate(...args),
    update: vi.fn(),
    delete: vi.fn()
  },
  seasonsDataLayer: {
    create: (...args: any[]) => mockSeasonsDataLayerCreate(...args),
    update: vi.fn(),
    delete: vi.fn()
  },
  matchesDataLayer: {
    create: (...args: any[]) => mockMatchesDataLayerCreate(...args),
    update: (...args: any[]) => mockMatchesDataLayerUpdate(...args),
    delete: vi.fn()
  }
}));

// Mock network utilities
vi.mock('../../../src/utils/network', () => ({
  isOnline: vi.fn(() => true),
  shouldUseOfflineFallback: vi.fn(() => false),
  getCurrentUserId: vi.fn(() => 'test-user-id')
}));

// Mock API client (should NOT be called in local-first quickStart)
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
};

vi.mock('../../../src/services/api/baseApi', () => ({
  default: mockApiClient,
  apiClient: mockApiClient
}));

// Mock window.dispatchEvent
const mockDispatchEvent = vi.fn();
vi.stubGlobal('dispatchEvent', mockDispatchEvent);

describe('matchesApi.quickStart - Local-First Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeams.length = 0;
    mockSeasons.length = 0;
    mockMatches.length = 0;
    
    // Reset data layer mocks with default implementations
    mockTeamsDataLayerCreate.mockImplementation(async (data: any) => {
      const team = {
        id: `team-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'test-user-id',
        isDeleted: false,
        synced: false
      };
      mockTeams.push(team);
      return team;
    });
    
    mockSeasonsDataLayerCreate.mockImplementation(async (data: any) => {
      const season = {
        id: `season-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'test-user-id',
        isDeleted: false,
        synced: false
      };
      mockSeasons.push(season);
      return season;
    });
    
    mockMatchesDataLayerCreate.mockImplementation(async (data: any) => {
      const match = {
        id: `match-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        matchId: `match-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...data,
        homeScore: 0,
        awayScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: 'test-user-id',
        isDeleted: false,
        synced: false
      };
      mockMatches.push(match);
      return match;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Local-First Behavior', () => {
    it('should NOT call server API directly', async () => {
      // Import after mocks are set up
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      // Set up existing team
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        kickoffTime: new Date().toISOString()
      };

      await matchesApi.quickStart(payload);

      // Verify NO server API calls were made
      expect(mockApiClient.post).not.toHaveBeenCalled();
      expect(mockApiClient.get).not.toHaveBeenCalled();
      expect(mockApiClient.put).not.toHaveBeenCalled();
    });

    it('should write to IndexedDB via data layer', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        kickoffTime: new Date().toISOString()
      };

      await matchesApi.quickStart(payload);

      // Verify data layer was called to create match
      expect(mockMatchesDataLayerCreate).toHaveBeenCalled();
    });

    it('should dispatch data:changed event after creation', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      await matchesApi.quickStart(payload);

      // Verify event was dispatched
      expect(mockDispatchEvent).toHaveBeenCalled();
    });

    it('should return immediately with locally-created match', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        kickoffTime: '2025-01-01T15:00:00.000Z'
      };

      const result = await matchesApi.quickStart(payload);

      // Verify result has expected structure
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.homeTeamId).toBeDefined();
      expect(result.awayTeamId).toBeDefined();
      expect(result.kickoffTime).toBe('2025-01-01T15:00:00.000Z');
    });
  });

  describe('Season Handling', () => {
    it('should use provided seasonId when available', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      mockSeasons.push({
        id: 'existing-season-id',
        label: '2024-2025 Season',
        isCurrent: true,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        seasonId: 'existing-season-id'
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.seasonId).toBe('existing-season-id');
      // Should NOT create a new season
      expect(mockSeasonsDataLayerCreate).not.toHaveBeenCalled();
    });

    it('should find existing current season when seasonId not provided', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      mockSeasons.push({
        id: 'current-season-id',
        label: '2024-2025 Season',
        isCurrent: true,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.seasonId).toBe('current-season-id');
      expect(mockSeasonsDataLayerCreate).not.toHaveBeenCalled();
    });

    it('should create default season when none exists', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      // No seasons exist
      mockSeasons.length = 0;

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      await matchesApi.quickStart(payload);

      // Should create a new season
      expect(mockSeasonsDataLayerCreate).toHaveBeenCalled();
      const createCall = mockSeasonsDataLayerCreate.mock.calls[0][0];
      expect(createCall.isCurrent).toBe(true);
      expect(createCall.label).toContain('Season');
    });
  });

  describe('Team Handling', () => {
    it('should use provided myTeamId', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.homeTeamId).toBe('my-team-id');
    });

    it('should find team by name when myTeamId not provided', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'found-team-id',
        name: 'My Named Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamName: 'My Named Team',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.homeTeamId).toBe('found-team-id');
    });

    it('should create team when myTeamName provided but not found', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      // No teams exist
      mockTeams.length = 0;

      const payload: QuickStartPayload = {
        myTeamName: 'New Team Name',
        opponentName: 'Opponent FC',
        isHome: true
      };

      await matchesApi.quickStart(payload);

      // Should create a new team
      expect(mockTeamsDataLayerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Team Name',
          isOpponent: false
        })
      );
    });

    it('should create opponent team with isOpponent: true', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'New Opponent FC',
        isHome: true
      };

      await matchesApi.quickStart(payload);

      // Should create opponent team with isOpponent: true
      expect(mockTeamsDataLayerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Opponent FC',
          isOpponent: true
        })
      );
    });

    it('should reuse existing opponent team by name', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push(
        {
          id: 'my-team-id',
          name: 'My Team',
          isDeleted: false,
          isOpponent: false,
          createdAt: new Date().toISOString(),
          createdByUserId: 'test-user-id'
        },
        {
          id: 'existing-opponent-id',
          name: 'Existing Opponent',
          isDeleted: false,
          isOpponent: true,
          createdAt: new Date().toISOString(),
          createdByUserId: 'test-user-id'
        }
      );

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Existing Opponent',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.awayTeamId).toBe('existing-opponent-id');
      // Should NOT create a new opponent team
      expect(mockTeamsDataLayerCreate).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Existing Opponent' })
      );
    });
  });

  describe('Home/Away Assignment', () => {
    it('should set myTeam as homeTeam when isHome is true', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.homeTeamId).toBe('my-team-id');
      expect(result.homeTeam?.name).toBe('My Team');
    });

    it('should set myTeam as awayTeam when isHome is false', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: false
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.awayTeamId).toBe('my-team-id');
      expect(result.awayTeam?.name).toBe('My Team');
    });
  });

  describe('Match Data', () => {
    it('should use provided kickoffTime', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const kickoffTime = '2025-06-15T15:00:00.000Z';
      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        kickoffTime
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.kickoffTime).toBe(kickoffTime);
    });

    it('should use provided competition and venue', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        competition: 'Premier League',
        venue: 'Wembley Stadium'
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.competition).toBe('Premier League');
      expect(result.venue).toBe('Wembley Stadium');
    });

    it('should use provided durationMinutes and periodFormat', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        durationMinutes: 90,
        periodFormat: 'half'
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.durationMinutes).toBe(90);
      expect(result.periodFormat).toBe('half');
    });

    it('should use default values when not provided', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      expect(result.durationMinutes).toBe(60);
      expect(result.periodFormat).toBe('quarter');
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
    });
  });

  describe('Return Value Structure', () => {
    it('should return match with team objects populated', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true
      };

      const result = await matchesApi.quickStart(payload);

      // Verify team objects are populated
      expect(result.homeTeam).toBeDefined();
      expect(result.homeTeam?.id).toBe('my-team-id');
      expect(result.homeTeam?.name).toBe('My Team');
      
      expect(result.awayTeam).toBeDefined();
      expect(result.awayTeam?.name).toBe('Opponent FC');
      expect(result.awayTeam?.isOpponent).toBe(true);
    });

    it('should return match with all required fields', async () => {
      const { matchesApi } = await import('../../../src/services/api/matchesApi');
      
      mockTeams.push({
        id: 'my-team-id',
        name: 'My Team',
        isDeleted: false,
        isOpponent: false,
        createdAt: new Date().toISOString(),
        createdByUserId: 'test-user-id'
      });

      const payload: QuickStartPayload = {
        myTeamId: 'my-team-id',
        opponentName: 'Opponent FC',
        isHome: true,
        notes: 'Test match notes'
      };

      const result = await matchesApi.quickStart(payload);

      // Verify all required fields
      expect(result.id).toBeDefined();
      expect(result.seasonId).toBeDefined();
      expect(result.kickoffTime).toBeDefined();
      expect(result.homeTeamId).toBeDefined();
      expect(result.awayTeamId).toBeDefined();
      expect(result.durationMinutes).toBeDefined();
      expect(result.periodFormat).toBeDefined();
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
      expect(result.notes).toBe('Test match notes');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.createdByUserId).toBeDefined();
      expect(result.isDeleted).toBe(false);
    });
  });
});
