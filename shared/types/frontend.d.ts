import type { EventKind } from './prisma';
export interface Player {
    id: string;
    name: string;
    squadNumber?: number;
    preferredPosition?: string;
    dateOfBirth?: Date;
    notes?: string;
    currentTeam?: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Team {
    id: string;
    name: string;
    homeKitPrimary?: string;
    homeKitSecondary?: string;
    awayKitPrimary?: string;
    awayKitSecondary?: string;
    logoUrl?: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Match {
    id: string;
    seasonId: string;
    kickoffTime: Date;
    competition?: string;
    homeTeamId: string;
    awayTeamId: string;
    venue?: string;
    durationMinutes: number;
    periodFormat: string;
    ourScore: number;
    opponentScore: number;
    notes?: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Event {
    id: string;
    matchId: string;
    seasonId: string;
    createdAt: Date;
    periodNumber?: number;
    clockMs?: number;
    kind: EventKind;
    teamId?: string;
    playerId?: string;
    notes?: string;
    sentiment: number;
    updatedAt?: Date;
}
export interface Season {
    id: string;
    label: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Position {
    code: string;
    longName: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Season {
    id: string;
    label: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Position {
    code: string;
    longName: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface Lineup {
    matchId: string;
    playerId: string;
    startMinute: number;
    endMinute?: number;
    position: string;
    createdAt: Date;
    updatedAt?: Date;
}
export interface PlayerCreateRequest {
    name: string;
    squadNumber?: number;
    preferredPosition?: string;
    dateOfBirth?: Date;
    notes?: string;
    currentTeam?: string;
}
export interface PlayerUpdateRequest {
    name?: string;
    squadNumber?: number;
    preferredPosition?: string;
    dateOfBirth?: Date;
    notes?: string;
    currentTeam?: string;
}
export interface TeamCreateRequest {
    name: string;
    homeKitPrimary?: string;
    homeKitSecondary?: string;
    awayKitPrimary?: string;
    awayKitSecondary?: string;
    logoUrl?: string;
}
export interface TeamUpdateRequest {
    name?: string;
    homeKitPrimary?: string;
    homeKitSecondary?: string;
    awayKitPrimary?: string;
    awayKitSecondary?: string;
    logoUrl?: string;
}
export interface MatchCreateRequest {
    seasonId: string;
    kickoffTime: Date;
    competition?: string;
    homeTeamId: string;
    awayTeamId: string;
    venue?: string;
    durationMinutes?: number;
    periodFormat?: string;
    notes?: string;
}
export interface MatchUpdateRequest {
    seasonId?: string;
    kickoffTime?: Date;
    competition?: string;
    homeTeamId?: string;
    awayTeamId?: string;
    venue?: string;
    durationMinutes?: number;
    periodFormat?: string;
    ourScore?: number;
    opponentScore?: number;
    notes?: string;
}
export interface EventCreateRequest {
    matchId: string;
    seasonId: string;
    periodNumber?: number;
    clockMs?: number;
    kind: EventKind;
    teamId?: string;
    playerId?: string;
    notes?: string;
    sentiment?: number;
}
export interface SeasonCreateRequest {
    label: string;
}
export interface SeasonUpdateRequest {
    label?: string;
}
export interface PositionCreateRequest {
    code: string;
    longName: string;
}
export interface PositionUpdateRequest {
    code?: string;
    longName?: string;
}
export interface LineupCreateRequest {
    matchId: string;
    playerId: string;
    startMinute?: number;
    endMinute?: number;
    position: string;
}
export interface LineupUpdateRequest {
    startMinute?: number;
    endMinute?: number;
    position?: string;
}
export interface PlayerWithTeam extends Player {
    team?: Team;
}
export interface MatchWithTeams extends Match {
    homeTeam: Team;
    awayTeam: Team;
    season: Season;
}
export interface EventWithDetails extends Event {
    player?: Player;
    team?: Team;
    match: Match;
}
export interface LineupWithDetails extends Lineup {
    player: Player;
    positionDetails?: Position;
}
export interface MatchWithFullDetails extends MatchWithTeams {
    lineup: LineupWithDetails[];
    events: EventWithDetails[];
}
export interface PlayerWithPosition extends Player {
    position?: Position;
}
export interface SeasonWithStats extends Season {
    matchCount: number;
    playerCount: number;
    teamCount: number;
}
export type EntityId = string;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type FormMode = 'create' | 'edit' | 'view';
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
//# sourceMappingURL=frontend.d.ts.map