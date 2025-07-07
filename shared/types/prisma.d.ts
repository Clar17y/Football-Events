export type { Player as PrismaPlayer, Team as PrismaTeam, Match as PrismaMatch, } from '@prisma/client';
export type PrismaSeason = {
    season_id: string;
    label: string;
    created_at: Date;
    updated_at?: Date | null;
};
export type PrismaPosition = {
    pos_code: string;
    long_name: string;
    created_at: Date;
    updated_at?: Date | null;
};
export type PrismaLineup = {
    match_id: string;
    player_id: string;
    start_min: number;
    end_min?: number | null;
    position: string;
    created_at: Date;
    updated_at?: Date | null;
};
export type EventKind = 'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal';
export type PrismaPlayerCreateInput = {
    name: string;
    squad_number?: number | null;
    preferred_pos?: string | null;
    dob?: Date | null;
    notes?: string | null;
    current_team?: string | null;
};
export type PrismaPlayerUpdateInput = {
    name?: string;
    squad_number?: number | null;
    preferred_pos?: string | null;
    dob?: Date | null;
    notes?: string | null;
    current_team?: string | null;
};
export type PrismaTeamCreateInput = {
    name: string;
    home_kit_primary?: string | null;
    home_kit_secondary?: string | null;
    away_kit_primary?: string | null;
    away_kit_secondary?: string | null;
    logo_url?: string | null;
};
export type PrismaTeamUpdateInput = {
    name?: string;
    home_kit_primary?: string | null;
    home_kit_secondary?: string | null;
    away_kit_primary?: string | null;
    away_kit_secondary?: string | null;
    logo_url?: string | null;
};
export type PrismaMatchCreateInput = {
    season_id: string;
    kickoff_ts: Date;
    competition?: string | null;
    home_team_id: string;
    away_team_id: string;
    venue?: string | null;
    duration_mins?: number;
    period_format?: string;
    our_score?: number;
    opponent_score?: number;
    notes?: string | null;
};
export type PrismaMatchUpdateInput = {
    season_id?: string;
    kickoff_ts?: Date;
    competition?: string | null;
    home_team_id?: string;
    away_team_id?: string;
    venue?: string | null;
    duration_mins?: number;
    period_format?: string;
    our_score?: number;
    opponent_score?: number;
    notes?: string | null;
};
export type PrismaEvent = {
    id: string;
    match_id: string;
    season_id: string;
    created_at: Date;
    period_number?: number | null;
    clock_ms?: number | null;
    kind: EventKind;
    team_id?: string | null;
    player_id?: string | null;
    notes?: string | null;
    sentiment: number;
    updated_at?: Date | null;
};
export type PrismaEventCreateInput = {
    match_id: string;
    season_id: string;
    period_number?: number | null;
    clock_ms?: number | null;
    kind: EventKind;
    team_id?: string | null;
    player_id?: string | null;
    notes?: string | null;
    sentiment?: number;
};
export type PrismaSeasonCreateInput = {
    label: string;
};
export type PrismaSeasonUpdateInput = {
    label?: string;
};
export type PrismaPositionCreateInput = {
    pos_code: string;
    long_name: string;
};
export type PrismaPositionUpdateInput = {
    pos_code?: string;
    long_name?: string;
};
export type PrismaLineupCreateInput = {
    match_id: string;
    player_id: string;
    start_min?: number;
    end_min?: number | null;
    position: string;
};
export type PrismaLineupUpdateInput = {
    start_min?: number;
    end_min?: number | null;
    position?: string;
};
//# sourceMappingURL=prisma.d.ts.map