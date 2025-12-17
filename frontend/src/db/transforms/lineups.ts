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
    matchId: l.match_id,
    playerId: l.player_id,
    startMinute: l.start_min,
    endMinute: nullToUndefined(l.end_min),
    position: l.position,
    createdAt: toDate(l.created_at) ?? new Date(),
    updatedAt: toDate(l.updated_at),
    created_by_user_id: l.created_by_user_id,
    deleted_at: toDate(l.deleted_at),
    deleted_by_user_id: nullToUndefined(l.deleted_by_user_id),
    is_deleted: toBool(l.is_deleted),
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
    match_id: data.matchId,
    player_id: data.playerId,
    start_min: data.startMin,
    end_min: data.endMin,
    position: data.position,
  };
}

/**
 * Generate composite ID for lineup records
 * Format: match_id-player_id-start_min
 */
export function generateLineupId(matchId: string, playerId: string, startMin: number): string {
  return `${matchId}-${playerId}-${startMin}`;
}
