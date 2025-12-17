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
    matchId: e.matchId,
    periodNumber: e.periodNumber,
    clockMs: e.clockMs,
    kind: e.kind,
    teamId: e.teamId || undefined,
    playerId: e.playerId || undefined,
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
    createdAt: toDate(e.createdAt) ?? new Date(),
    updatedAt: toDate(e.updatedAt),
    created_by_user_id: e.createdByUserId,
    deleted_at: toDate(e.deletedAt),
    deleted_by_user_id: nullToUndefined(e.deletedByUserId),
    is_deleted: toBool(e.isDeleted),
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
    matchId: data.matchId,
    kind: data.kind,
    periodNumber: data.periodNumber ?? 1,
    clockMs: data.clockMs ?? 0,
    teamId: data.teamId ?? '',
    playerId: data.playerId ?? '',
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
    matchId: e.matchId,
    kind: e.kind,
    periodNumber: e.periodNumber,
    clockMs: e.clockMs,
    teamId: e.teamId || undefined,
    playerId: e.playerId || null,
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
  };
}
