/**
 * Event transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbEvent extends Event, so dbToEvent is essentially pass-through.
 */

import type { DbEvent } from '../schema';
import type { Event } from '@shared/types';
import type { EventKind } from '../../types/events';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB event record to frontend Event type
 * Since DbEvent extends Event, this is essentially a pass-through
 * that strips sync metadata and IndexedDB-specific fields.
 */
export function dbToEvent(e: DbEvent): Event {
  return {
    id: e.id,
    matchId: e.matchId,
    periodNumber: e.periodNumber,
    clockMs: e.clockMs,
    kind: e.kind,
    teamId: nullToUndefined(e.teamId),
    playerId: nullToUndefined(e.playerId),
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    createdByUserId: e.createdByUserId,
    deletedAt: e.deletedAt,
    deletedByUserId: nullToUndefined(e.deletedByUserId),
    isDeleted: toBool(e.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB event records
 */
export function dbToEvents(events: DbEvent[]): Event[] {
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
export function eventWriteToDb(data: EventWriteInput): Partial<DbEvent> {
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
export function dbEventToServerPayload(e: DbEvent): ServerEventPayload {
  return {
    matchId: e.matchId,
    kind: e.kind,
    periodNumber: e.periodNumber ?? 1,
    clockMs: e.clockMs ?? 0,
    teamId: nullToUndefined(e.teamId),
    playerId: e.playerId || null,
    notes: nullToUndefined(e.notes),
    sentiment: e.sentiment,
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API event response (camelCase - server now returns camelCase)
 */
export interface ServerEventResponse {
  id: string;
  matchId: string;
  periodNumber?: number;
  clockMs?: number;
  kind: EventKind;
  teamId?: string;
  playerId?: string;
  notes?: string;
  sentiment?: number;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API event to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverEventToDb(e: ServerEventResponse): DbEvent {
  const now = nowIso();
  return {
    id: e.id,
    matchId: e.matchId,
    periodNumber: e.periodNumber ?? 1,
    clockMs: e.clockMs ?? 0,
    kind: e.kind,
    teamId: e.teamId ?? '',
    playerId: e.playerId ?? '',
    notes: e.notes,
    sentiment: e.sentiment ?? 0,
    createdAt: e.createdAt ?? now,
    updatedAt: e.updatedAt ?? now,
    createdByUserId: e.createdByUserId ?? 'server',
    deletedAt: e.deletedAt,
    deletedByUserId: e.deletedByUserId,
    isDeleted: e.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
