/**
 * Event transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedEvent } from '../schema';
import type { Event } from '@shared/types';
import type { EventKind } from '../../types/events';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB event record to frontend Event type
 */
export function dbToEvent(e: EnhancedEvent): Event {
  return {
    id: e.id,
    matchId: e.match_id,
    periodNumber: e.period_number,
    clockMs: e.clock_ms,
    kind: e.kind,
    teamId: e.team_id || undefined,
    playerId: e.player_id || undefined,
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
    createdAt: toDate(e.created_at) ?? new Date(),
    updatedAt: toDate(e.updated_at),
    created_by_user_id: e.created_by_user_id,
    deleted_at: toDate(e.deleted_at),
    deleted_by_user_id: nullToUndefined(e.deleted_by_user_id),
    is_deleted: toBool(e.is_deleted),
  };
}

/**
 * Transform multiple IndexedDB event records
 */
export function dbToEvents(events: EnhancedEvent[]): Event[] {
  return events.map(dbToEvent);
}

/**
 * Input shape for creating/updating events (frontend camelCase)
 */
export interface EventWriteInput {
  matchId: string;
  kind: EventKind;
  periodNumber?: number;
  clockMs?: number;
  teamId?: string;
  playerId?: string;
  notes?: string;
  sentiment?: number;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function eventWriteToDb(data: EventWriteInput): Partial<EnhancedEvent> {
  return {
    match_id: data.matchId,
    kind: data.kind,
    period_number: data.periodNumber ?? 1,
    clock_ms: data.clockMs ?? 0,
    team_id: data.teamId ?? '',
    player_id: data.playerId ?? '',
    notes: data.notes,
    sentiment: data.sentiment ?? 0,
  };
}

// ============================================================================
// SYNC SERVICE TRANSFORMS (IndexedDB → Server API)
// ============================================================================

/**
 * Server API event payload (camelCase)
 */
export interface ServerEventPayload {
  matchId: string;
  kind: string;
  periodNumber: number;
  clockMs: number;
  teamId?: string;
  playerId?: string | null;
  notes?: string;
  sentiment?: number;
}

/**
 * Transform IndexedDB event to Server API payload for sync
 */
export function dbEventToServerPayload(e: EnhancedEvent): ServerEventPayload {
  return {
    matchId: e.match_id,
    kind: e.kind,
    periodNumber: e.period_number,
    clockMs: e.clock_ms,
    teamId: e.team_id || undefined,
    playerId: e.player_id || null,
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
  };
}
