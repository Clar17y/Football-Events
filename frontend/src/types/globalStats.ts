/**
 * Global (platform-wide) statistics types.
 *
 * Global stats are computed server-side and cached client-side for offline access.
 */

export interface GlobalStatsData {
  total_teams: number;
  active_teams: number;
  total_players: number;
  total_matches: number;
  matches_played: number;
  active_matches: number;
  matches_today: number;
  last_updated: string;
  degraded?: boolean;
}

/**
 * Cached global stats record stored in IndexedDB.
 * Single-row table with id = 'current'.
 */
export interface GlobalStats {
  id: 'current';
  data: GlobalStatsData;
  lastUpdated: number; // Unix timestamp (ms)
}

