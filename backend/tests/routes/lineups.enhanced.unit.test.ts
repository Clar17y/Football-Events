/**
 * Enhanced Lineup Routes Unit Tests
 * 
 * Unit tests for the enhanced lineup route functionality including
 * substitution endpoints and positioning data handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the LineupService
vi.mock('../../src/services/LineupService');

// Mock the middleware modules
vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', role: 'USER' };
    next();
  }
}));

vi.mock('../../src/middleware/uuidValidation', () => ({
  validateUUID: () => (req: any, res: any, next: any) => next()
}));

vi.mock('../../src/middleware/validation', () => ({
  validateRequest: (schema: any) => (req: any, res: any, next: any) => next()
}));

import { LineupService } from '../../src/services/LineupService';
import lineupsRouter from '../../src/routes/v1/lineups';

describe('Enhanced Lineup Routes Unit Tests', () => {
  let app: express.Application;
  let mockLineupService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/lineups', lineupsRouter);

    // Reset mocks
    vi.clearAllMocks();
    mockLineupService = vi.mocked(LineupService).prototype;
  });

  describe('GET /api/v1/lineups/match/:matchId/current', () => {
    it('should call getCurrentLineup with correct parameters', async () => {
      const mockCurrentLineup = [
        {
          id: 'lineup-1',
          matchId: 'match-1',
          playerId: 'player-1',
          position: 'GK',
          pitchX: 50.0,
          pitchY: 5.0,
          startMinute: 0
        }
      ];

      mockLineupService.getCurrentLineup = vi.fn().mockResolvedValue(mockCurrentLineup);

      const response = await request(app)
        .get('/api/v1/lineups/match/match-1/current')
        .query({ currentTime: '15' })
        .expect(200);

      expect(mockLineupService.getCurrentLineup).toHaveBeenCalledWith(
        'match-1',
        15,
        'test-user-id',
        'USER'
      );
      expect(response.body).toEqual(mockCurrentLineup);
    });

    it('should default currentTime to 0 when not provided', async () => {
      mockLineupService.getCurrentLineup = vi.fn().mockResolvedValue([]);

      await request(app)
        .get('/api/v1/lineups/match/match-1/current')
        .expect(200);

      expect(mockLineupService.getCurrentLineup).toHaveBeenCalledWith(
        'match-1',
        0,
        'test-user-id',
        'USER'
      );
    });

    it('should return 400 for invalid currentTime', async () => {
      const response = await request(app)
        .get('/api/v1/lineups/match/match-1/current')
        .query({ currentTime: 'invalid' })
        .expect(400);

      expect(response.body.error).toBe('Invalid current time');
      expect(response.body.message).toBe('Current time must be a valid number');
    });
  });

  describe('GET /api/v1/lineups/match/:matchId/active-at/:timeMinutes', () => {
    it('should call getActivePlayersAtTime with correct parameters', async () => {
      const mockActivePlayers = [
        {
          playerId: 'player-1',
          position: 'GK',
          pitchX: 50.0,
          pitchY: 5.0
        }
      ];

      mockLineupService.getActivePlayersAtTime = vi.fn().mockResolvedValue(mockActivePlayers);

      const response = await request(app)
        .get('/api/v1/lineups/match/match-1/active-at/30')
        .expect(200);

      expect(mockLineupService.getActivePlayersAtTime).toHaveBeenCalledWith(
        'match-1',
        30,
        'test-user-id',
        'USER'
      );
      expect(response.body).toEqual(mockActivePlayers);
    });

    it('should return 400 for invalid time parameter', async () => {
      const response = await request(app)
        .get('/api/v1/lineups/match/match-1/active-at/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid time');
      expect(response.body.message).toBe('Time must be a valid number');
    });
  });

  describe('POST /api/v1/lineups/match/:matchId/substitute', () => {
    it('should call makeSubstitution with correct parameters', async () => {
      const mockSubstitutionResult = {
        playerOffLineup: { id: 'lineup-1', endMinute: 30 },
        playerOnLineup: { id: 'lineup-2', startMinute: 30 },
        timelineEvents: [
          { id: 'event-1', kind: 'substitution_off' },
          { id: 'event-2', kind: 'substitution_on' }
        ]
      };

      mockLineupService.makeSubstitution = vi.fn().mockResolvedValue(mockSubstitutionResult);

      const substitutionData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: 30,
        substitutionReason: 'Tactical change'
      };

      const response = await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(substitutionData)
        .expect(201);

      expect(mockLineupService.makeSubstitution).toHaveBeenCalledWith(
        'match-1',
        'player-1',
        'player-2',
        'ST',
        30,
        'test-user-id',
        'USER',
        'Tactical change'
      );
      expect(response.body).toEqual(mockSubstitutionResult);
    });

    it('should call makeSubstitution without substitutionReason when not provided', async () => {
      const mockSubstitutionResult = {
        playerOffLineup: { id: 'lineup-1', endMinute: 30 },
        playerOnLineup: { id: 'lineup-2', startMinute: 30 },
        timelineEvents: []
      };

      mockLineupService.makeSubstitution = vi.fn().mockResolvedValue(mockSubstitutionResult);

      const substitutionData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: 30
      };

      await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(substitutionData)
        .expect(201);

      expect(mockLineupService.makeSubstitution).toHaveBeenCalledWith(
        'match-1',
        'player-1',
        'player-2',
        'ST',
        30,
        'test-user-id',
        'USER',
        undefined
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidData = {
        playerOffId: 'player-1'
        // Missing playerOnId, position, currentTime
      };

      const response = await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('playerOnId, position, and currentTime are required');
    });

    it('should return 400 when currentTime is negative', async () => {
      const invalidData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: -5
      };

      const response = await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('currentTime must be a non-negative number');
    });

    it('should return 400 when currentTime is not a number', async () => {
      const invalidData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: 'invalid'
      };

      const response = await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('currentTime must be a non-negative number');
    });

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Player not on pitch');
      mockLineupService.makeSubstitution = vi.fn().mockRejectedValue(serviceError);

      const substitutionData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: 30
      };

      await request(app)
        .post('/api/v1/lineups/match/match-1/substitute')
        .send(substitutionData)
        .expect(500);
    });
  });

  describe('Route parameter validation', () => {
    it('should handle UUID validation for matchId in current lineup endpoint', async () => {
      mockLineupService.getCurrentLineup = vi.fn().mockResolvedValue([]);

      await request(app)
        .get('/api/v1/lineups/match/valid-uuid/current')
        .expect(200);

      expect(mockLineupService.getCurrentLineup).toHaveBeenCalled();
    });

    it('should handle UUID validation for matchId in active players endpoint', async () => {
      mockLineupService.getActivePlayersAtTime = vi.fn().mockResolvedValue([]);

      await request(app)
        .get('/api/v1/lineups/match/valid-uuid/active-at/30')
        .expect(200);

      expect(mockLineupService.getActivePlayersAtTime).toHaveBeenCalled();
    });

    it('should handle UUID validation for matchId in substitution endpoint', async () => {
      mockLineupService.makeSubstitution = vi.fn().mockResolvedValue({
        playerOffLineup: {},
        playerOnLineup: {},
        timelineEvents: []
      });

      const substitutionData = {
        playerOffId: 'player-1',
        playerOnId: 'player-2',
        position: 'ST',
        currentTime: 30
      };

      await request(app)
        .post('/api/v1/lineups/match/valid-uuid/substitute')
        .send(substitutionData)
        .expect(201);

      expect(mockLineupService.makeSubstitution).toHaveBeenCalled();
    });
  });
});