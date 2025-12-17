/**
 * Lineup transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedLineup } from '../schema';
import type { Lineup } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB lineup record to frontend Lineup type
 */
export function dbToLineup(l: EnhancedLineup): Lineup {
  return {
    id: l.id,
    matchId: l.matchId,
    playerId: l.playerId,
    startMinute: l.startMin,
    endMinute: nullToUndefined(l.endMin),
    position: l.position,
    createdAt: toDate(l.createdAt) ?? new Date(),
    updatedAt: toDate(l.updatedAt),
    created_by_user_id: l.createdByUserId,
    deleted_at: toDate(l.deletedAt),
    deleted_by_user_id: nullToUndefined(l.deletedByUserId),
    is_deleted: toBool(l.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB lineup records
 */
export function dbToLineups(lineups: EnhancedLineup[]): Lineup[] {
  return lineups.map(dbToLineup);
}

/**
 * Input shape for creating/updating lineups (frontend camelCase)
 */
export interface LineupWriteInput {
  matchId: string;
  playerId: string;
  startMin: number;
  endMin?: number;
  position: string;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function lineupWriteToDb(data: LineupWriteInput): Partial<EnhancedLineup> {
  return {
    matchId: data.matchId,
    playerId: data.playerId,
    startMin: data.startMin,
    endMin: data.endMin,
    position: data.position,
  };
}

/**
 * Generate composite ID for lineup records
 * Format: matchId-playerId-startMin
 */
export function generateLineupId(matchId: string, playerId: string, startMin: number): string {
  return `${matchId}-${playerId}-${startMin}`;
}
