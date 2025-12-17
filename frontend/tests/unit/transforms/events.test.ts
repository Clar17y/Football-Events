import { describe, it, expect } from 'vitest';
import { dbToEvent, dbToEvents, eventWriteToDb } from '../../../src/db/transforms/events';
import type { EnhancedEvent } from '../../../src/db/schema';

describe('events transforms', () => {
  const mockDbEvent: EnhancedEvent = {
    id: 'event-123',
    matchId: 'match-456',
    tsServer: 1700000000000,
    periodNumber: 2,
    clockMs: 1234567,
    kind: 'goal',
    teamId: 'team-home',
    playerId: 'player-789',
    notes: 'Great goal',
    sentiment: 1,
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    createdByUserId: 'user-123',
    isDeleted: false,
    synced: true,
  };

  describe('dbToEvent', () => {
    it('transforms all fields correctly', () => {
      const result = dbToEvent(mockDbEvent);

      expect(result.id).toBe('event-123');
      expect(result.matchId).toBe('match-456');
      expect(result.periodNumber).toBe(2);
      expect(result.clockMs).toBe(1234567);
      expect(result.kind).toBe('goal');
      expect(result.teamId).toBe('team-home');
      expect(result.playerId).toBe('player-789');
      expect(result.notes).toBe('Great goal');
      expect(result.sentiment).toBe(1);
      expect(result.createdAt).toEqual(new Date(1700000000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-123');
      expect(result.is_deleted).toBe(false);
    });

    it('handles null/undefined optional fields', () => {
      const minimalEvent: EnhancedEvent = {
        id: 'event-minimal',
        matchId: 'match-1',
        tsServer: 1700000000000,
        periodNumber: 1,
        clockMs: 0,
        kind: 'ball_out',
        teamId: '',
        playerId: '',
        sentiment: 0,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      };

      const result = dbToEvent(minimalEvent);

      expect(result.teamId).toBeUndefined(); // empty string becomes undefined
      expect(result.playerId).toBeUndefined(); // empty string becomes undefined
      expect(result.notes).toBeUndefined();
    });

    it('handles soft delete fields', () => {
      const deletedEvent: EnhancedEvent = {
        ...mockDbEvent,
        isDeleted: true,
        deletedAt: 1700000002000,
        deletedByUserId: 'user-admin',
      };

      const result = dbToEvent(deletedEvent);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });

    it('handles different event kinds', () => {
      const kinds = ['goal', 'own_goal', 'assist', 'yellow_card', 'red_card', 'save', 'foul'] as const;

      for (const kind of kinds) {
        const event = { ...mockDbEvent, kind };
        const result = dbToEvent(event);
        expect(result.kind).toBe(kind);
      }
    });
  });

  describe('dbToEvents', () => {
    it('transforms array of events', () => {
      const events = [
        mockDbEvent,
        { ...mockDbEvent, id: 'event-456', kind: 'assist' as const },
      ];
      const result = dbToEvents(events);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('event-123');
      expect(result[1].id).toBe('event-456');
      expect(result[1].kind).toBe('assist');
    });

    it('handles empty array', () => {
      expect(dbToEvents([])).toEqual([]);
    });
  });

  describe('eventWriteToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        matchId: 'match-123',
        kind: 'goal' as const,
        periodNumber: 2,
        clockMs: 5000,
        teamId: 'team-home',
        playerId: 'player-10',
        notes: 'Header goal',
        sentiment: 1,
      };

      const result = eventWriteToDb(input);

      expect(result.matchId).toBe('match-123');
      expect(result.kind).toBe('goal');
      expect(result.periodNumber).toBe(2);
      expect(result.clockMs).toBe(5000);
      expect(result.teamId).toBe('team-home');
      expect(result.playerId).toBe('player-10');
      expect(result.notes).toBe('Header goal');
      expect(result.sentiment).toBe(1);
    });

    it('handles minimal input with defaults', () => {
      const input = {
        matchId: 'match-123',
        kind: 'ball_out' as const,
      };

      const result = eventWriteToDb(input);

      expect(result.matchId).toBe('match-123');
      expect(result.kind).toBe('ball_out');
      expect(result.periodNumber).toBe(1);
      expect(result.clockMs).toBe(0);
      expect(result.teamId).toBe('');
      expect(result.playerId).toBe('');
      expect(result.sentiment).toBe(0);
      expect(result.notes).toBeUndefined();
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        matchId: 'match-roundtrip',
        kind: 'goal' as const,
        periodNumber: 3,
        clockMs: 12345,
        teamId: 'team-1',
        playerId: 'player-1',
        notes: 'Test goal',
        sentiment: 1,
      };

      const dbFormat = eventWriteToDb(original);
      const stored: EnhancedEvent = {
        id: 'event-roundtrip',
        tsServer: Date.now(),
        ...dbFormat,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUserId: 'user-1',
        isDeleted: false,
        synced: false,
      } as EnhancedEvent;

      const readBack = dbToEvent(stored);

      expect(readBack.matchId).toBe(original.matchId);
      expect(readBack.kind).toBe(original.kind);
      expect(readBack.periodNumber).toBe(original.periodNumber);
      expect(readBack.clockMs).toBe(original.clockMs);
      expect(readBack.teamId).toBe(original.teamId);
      expect(readBack.playerId).toBe(original.playerId);
      expect(readBack.notes).toBe(original.notes);
      expect(readBack.sentiment).toBe(original.sentiment);
    });
  });
});
