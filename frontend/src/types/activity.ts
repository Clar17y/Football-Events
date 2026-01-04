/**
 * Activity types for the offline-first Recent Activity feed.
 * Used by useLocalRecentActivity hook and RecentActivity component.
 */

export interface ActivityItem {
    id: string;
    type: 'team' | 'player' | 'season' | 'match' | 'event' | 'lineup';
    action: string;
    description: string;
    title?: string;
    entityId: string;
    entityName: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
}

export interface ActivityFilters {
    teams: boolean;
    players: boolean;
    seasons: boolean;
    matches: boolean;
    events: boolean;
    lineups: boolean;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
    teams: true,
    players: true,
    seasons: true,
    matches: true,
    events: true,
    lineups: true
};
