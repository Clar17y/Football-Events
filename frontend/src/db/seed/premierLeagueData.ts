/**
 * Premier League Test Data Module
 * 
 * This module provides typed access to real Premier League data
 * fetched from football-data.org API.
 */

// Import raw JSON data
import teamsData2024 from './pl-2024-teams.json';
import matchesData2024 from './pl-2024-matches.json';
import matchesData2023 from './pl-2023-matches.json';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiPlayer {
    id: number;
    name: string;
    position: string | null;
    dateOfBirth: string | null;
    nationality: string;
}

export interface ApiTeam {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
    address?: string;
    website?: string;
    founded?: number;
    clubColors?: string;
    venue?: string;
    squad: ApiPlayer[];
}

export interface ApiMatch {
    id: number;
    utcDate: string;
    status: string;
    matchday: number;
    homeTeam: {
        id: number;
        name: string;
        shortName: string;
        tla: string;
        crest: string;
    };
    awayTeam: {
        id: number;
        name: string;
        shortName: string;
        tla: string;
        crest: string;
    };
    score: {
        winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
        fullTime: {
            home: number | null;
            away: number | null;
        };
        halfTime: {
            home: number | null;
            away: number | null;
        };
    };
}

export interface ApiTeamsResponse {
    count: number;
    teams: ApiTeam[];
    season: {
        id: number;
        startDate: string;
        endDate: string;
    };
}

export interface ApiMatchesResponse {
    resultSet: {
        count: number;
        first: string;
        last: string;
    };
    matches: ApiMatch[];
}

// ============================================================================
// Data Access Functions
// ============================================================================

/**
 * Get all Premier League teams with squads
 */
export function getTeams(): ApiTeam[] {
    return (teamsData2024 as ApiTeamsResponse).teams;
}

/**
 * Get a team by ID
 */
export function getTeamById(id: number): ApiTeam | undefined {
    return getTeams().find(t => t.id === id);
}

/**
 * Get matches for a specific season
 */
export function getMatches(season: 2023 | 2024): ApiMatch[] {
    const data = season === 2024 ? matchesData2024 : matchesData2023;
    return (data as ApiMatchesResponse).matches.filter(m => m.status === 'FINISHED');
}

/**
 * Get all finished matches across both seasons
 */
export function getAllMatches(): ApiMatch[] {
    return [...getMatches(2023), ...getMatches(2024)];
}

// ============================================================================
// Color Mapping
// ============================================================================

/**
 * Map club colors string to hex colors
 */
export function parseClubColors(clubColors: string | undefined): { primary: string; secondary: string } {
    const colorMap: Record<string, string> = {
        'red': '#DC0714',
        'white': '#FFFFFF',
        'claret': '#7A263A',
        'sky blue': '#95BFE5',
        'royal blue': '#034694',
        'blue': '#0057B8',
        'navy blue': '#132257',
        'gold': '#FFD700',
        'yellow': '#FFCD00',
        'black': '#000000',
        'orange': '#F58220',
        'green': '#00A650',
        'light blue': '#6CABDD',
        'maroon': '#800000',
        'purple': '#6C1D45',
        'amber': '#FFC659',
    };

    if (!clubColors) {
        return { primary: '#1976D2', secondary: '#FFFFFF' };
    }

    const parts = clubColors.toLowerCase().split('/').map(s => s.trim());
    const primary = colorMap[parts[0]] || '#1976D2';
    const secondary = colorMap[parts[1]] || '#FFFFFF';

    return { primary, secondary };
}

// ============================================================================
// Position Mapping
// ============================================================================

/**
 * Map API position to app position format
 */
export function mapPosition(apiPosition: string | null): string {
    if (!apiPosition) return 'CM';

    const positionMap: Record<string, string> = {
        'goalkeeper': 'GK',
        'centre-back': 'CB',
        'right-back': 'RB',
        'left-back': 'LB',
        'defensive midfield': 'CDM',
        'central midfield': 'CM',
        'attacking midfield': 'CAM',
        'left midfield': 'LM',
        'right midfield': 'RM',
        'left winger': 'LW',
        'right winger': 'RW',
        'centre-forward': 'ST',
        'second striker': 'ST',
        // Generic positions
        'defence': 'CB',
        'midfield': 'CM',
        'offence': 'ST',
    };

    return positionMap[apiPosition.toLowerCase()] || 'CM';
}

// ============================================================================
// Test User Generation
// ============================================================================

/**
 * Generate a test user ID for a team
 */
export function getTestUserId(teamTla: string): string {
    return `test-user-${teamTla.toLowerCase()}`;
}

/**
 * Get all test user IDs
 */
export function getAllTestUserIds(): string[] {
    return getTeams().map(t => getTestUserId(t.tla));
}
