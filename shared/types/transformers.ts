/**
 * Backend Transform Layer - Prisma ↔ API Response
 *
 * These functions transform between Prisma database types and API response types.
 * Used by backend services to format API responses.
 *
 * IMPORTANT: The frontend has its own transform layer at:
 *   frontend/src/db/transforms/
 * which handles IndexedDB ↔ Frontend type conversions.
 *
 * Transform directions in this file:
 * - transformXxx: Prisma → API response (for GET endpoints)
 * - transformXxxCreateRequest: API request → Prisma create input (for POST)
 * - transformXxxUpdateRequest: API request → Prisma update input (for PUT)
 */

import type {
  PrismaPlayer,
  PrismaTeam,
  PrismaMatch,
  PrismaEvent,
  PrismaSeason,
  PrismaPosition,
  PrismaLineup,
  PrismaAward,
  PrismaMatchAward,
  PrismaPlayerTeam,
  PrismaMatchState,
  PrismaMatchPeriod,
  PrismaPlayerCreateInput,
  PrismaPlayerUpdateInput,
  PrismaTeamCreateInput,
  PrismaTeamUpdateInput,
  PrismaMatchCreateInput,
  PrismaMatchUpdateInput,
  PrismaEventCreateInput,
  PrismaSeasonCreateInput,
  PrismaSeasonUpdateInput,
  PrismaPositionCreateInput,
  PrismaPositionUpdateInput,
  PrismaLineupCreateInput,
  PrismaLineupUpdateInput,
  PrismaAwardCreateInput,
  PrismaAwardUpdateInput,
  PrismaMatchAwardCreateInput,
  PrismaMatchAwardUpdateInput,
  PrismaPlayerTeamCreateInput,
  PrismaPlayerTeamUpdateInput,
  PrismaMatchStateCreateInput,
  PrismaMatchStateUpdateInput,
  PrismaMatchPeriodCreateInput,
  PrismaMatchPeriodUpdateInput,
} from './prisma';

import type {
  Player,
  Team,
  Match,
  Event,
  Season,
  Position,
  Lineup,
  Award,
  MatchAward,
  PlayerTeam,
  MatchState,
  MatchPeriod,
  PlayerCreateRequest,
  PlayerUpdateRequest,
  TeamCreateRequest,
  TeamUpdateRequest,
  MatchCreateRequest,
  MatchUpdateRequest,
  EventCreateRequest,
  SeasonCreateRequest,
  SeasonUpdateRequest,
  PositionCreateRequest,
  PositionUpdateRequest,
  LineupCreateRequest,
  LineupUpdateRequest,
  AwardCreateRequest,
  AwardUpdateRequest,
  MatchAwardCreateRequest,
  MatchAwardUpdateRequest,
  PlayerTeamCreateRequest,
  PlayerTeamUpdateRequest,
  StartMatchRequest,
  PauseMatchRequest,
  ResumeMatchRequest,
  CompleteMatchRequest,
  CancelMatchRequest,
  StartPeriodRequest,
  EndPeriodRequest,
  MatchStateResponse,
  MatchStatusResponse,
  LiveMatchesResponse,
} from './frontend';

// ============================================================================
// UTILITY FUNCTIONS FOR DATE SERIALIZATION
// ============================================================================

/**
 * Convert a Date or null/undefined to ISO string or undefined
 */
const toIsoString = (date: Date | null | undefined): string | undefined =>
  date ? date.toISOString() : undefined;

/**
 * Convert a Date to ISO string (required field)
 */
const toIsoStringRequired = (date: Date): string => date.toISOString();

/**
 * Convert a Date to ISO date string (YYYY-MM-DD) or undefined
 */
const toIsoDateString = (date: Date | null | undefined): string | undefined =>
  date ? date.toISOString().split('T')[0] : undefined;

// ============================================================================
// PRISMA TO FRONTEND TRANSFORMERS
// ============================================================================

export const transformPlayer = (prismaPlayer: PrismaPlayer): Player => ({
  id: prismaPlayer.id,
  name: prismaPlayer.name,
  squadNumber: prismaPlayer.squad_number ?? undefined,
  preferredPosition: prismaPlayer.preferred_pos ?? undefined,
  dateOfBirth: toIsoDateString(prismaPlayer.dob),
  notes: prismaPlayer.notes ?? undefined,
  createdAt: toIsoStringRequired(prismaPlayer.created_at),
  updatedAt: toIsoString(prismaPlayer.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaPlayer.created_by_user_id,
  deletedAt: toIsoString(prismaPlayer.deleted_at),
  deletedByUserId: prismaPlayer.deleted_by_user_id ?? undefined,
  isDeleted: prismaPlayer.is_deleted,
});

export const transformTeam = (prismaTeam: PrismaTeam): Team => ({
  id: prismaTeam.id,
  name: prismaTeam.name,
  homeKitPrimary: prismaTeam.home_kit_primary ?? undefined,
  homeKitSecondary: prismaTeam.home_kit_secondary ?? undefined,
  awayKitPrimary: prismaTeam.away_kit_primary ?? undefined,
  awayKitSecondary: prismaTeam.away_kit_secondary ?? undefined,
  logoUrl: prismaTeam.logo_url ?? undefined,
  createdAt: toIsoStringRequired(prismaTeam.created_at),
  updatedAt: toIsoString(prismaTeam.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaTeam.created_by_user_id,
  deletedAt: toIsoString(prismaTeam.deleted_at),
  deletedByUserId: prismaTeam.deleted_by_user_id ?? undefined,
  isDeleted: prismaTeam.is_deleted,
  // Visibility (camelCase)
  isOpponent: (prismaTeam as any).is_opponent ?? false,
});

export const transformMatch = (prismaMatch: PrismaMatch): Match => ({
  id: prismaMatch.match_id,
  seasonId: prismaMatch.season_id,
  kickoffTime: toIsoStringRequired(prismaMatch.kickoff_ts),
  competition: prismaMatch.competition ?? undefined,
  homeTeamId: prismaMatch.home_team_id,
  awayTeamId: prismaMatch.away_team_id,
  homeTeam: (prismaMatch as any).homeTeam ? transformTeam((prismaMatch as any).homeTeam) : undefined,
  awayTeam: (prismaMatch as any).awayTeam ? transformTeam((prismaMatch as any).awayTeam) : undefined,
  venue: prismaMatch.venue ?? undefined,
  durationMinutes: prismaMatch.duration_mins,
  periodFormat: prismaMatch.period_format,
  homeScore: (prismaMatch as any).home_score ?? 0,
  awayScore: (prismaMatch as any).away_score ?? 0,
  // deprecated fields for compatibility (will be removed after full migration)
  ourScore: (prismaMatch as any).our_score ?? undefined,
  opponentScore: (prismaMatch as any).opponent_score ?? undefined,
  notes: prismaMatch.notes ?? undefined,
  createdAt: toIsoStringRequired(prismaMatch.created_at),
  updatedAt: toIsoString(prismaMatch.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaMatch.created_by_user_id,
  deletedAt: toIsoString(prismaMatch.deleted_at),
  deletedByUserId: prismaMatch.deleted_by_user_id ?? undefined,
  isDeleted: prismaMatch.is_deleted,
});

export const transformEvent = (prismaEvent: PrismaEvent): Event => ({
  id: prismaEvent.id,
  matchId: prismaEvent.match_id,
  createdAt: toIsoStringRequired(prismaEvent.created_at),
  periodNumber: prismaEvent.period_number ?? undefined,
  clockMs: prismaEvent.clock_ms ?? undefined,
  kind: prismaEvent.kind,
  teamId: prismaEvent.team_id ?? undefined,
  playerId: prismaEvent.player_id ?? undefined,
  notes: prismaEvent.notes ?? undefined,
  sentiment: prismaEvent.sentiment ?? 0,
  updatedAt: toIsoString(prismaEvent.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaEvent.created_by_user_id,
  deletedAt: toIsoString(prismaEvent.deleted_at),
  deletedByUserId: prismaEvent.deleted_by_user_id ?? undefined,
  isDeleted: prismaEvent.is_deleted,
});

export const transformSeason = (prismaSeason: PrismaSeason): Season => ({
  id: prismaSeason.season_id,        // For compatibility
  seasonId: prismaSeason.season_id,
  label: prismaSeason.label,
  startDate: toIsoDateString(prismaSeason.start_date),
  endDate: toIsoDateString(prismaSeason.end_date),
  isCurrent: prismaSeason.is_current ?? false,
  description: prismaSeason.description ?? undefined,
  createdAt: toIsoStringRequired(prismaSeason.created_at),
  updatedAt: toIsoString(prismaSeason.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaSeason.created_by_user_id,
  deletedAt: toIsoString(prismaSeason.deleted_at),
  deletedByUserId: prismaSeason.deleted_by_user_id ?? undefined,
  isDeleted: prismaSeason.is_deleted,
});

export const transformPosition = (prismaPosition: PrismaPosition): Position => ({
  code: prismaPosition.pos_code,
  longName: prismaPosition.long_name,
  createdAt: toIsoStringRequired(prismaPosition.created_at),
  updatedAt: toIsoString(prismaPosition.updated_at),
});

export const transformLineup = (prismaLineup: PrismaLineup): Lineup => ({
  id: prismaLineup.id,
  matchId: prismaLineup.match_id,
  playerId: prismaLineup.player_id,
  startMinute: prismaLineup.start_min,
  endMinute: prismaLineup.end_min ?? undefined,
  position: prismaLineup.position,
  createdAt: toIsoStringRequired(prismaLineup.created_at),
  updatedAt: toIsoString(prismaLineup.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaLineup.created_by_user_id,
  deletedAt: toIsoString(prismaLineup.deleted_at),
  deletedByUserId: prismaLineup.deleted_by_user_id ?? undefined,
  isDeleted: prismaLineup.is_deleted,
});

export const transformPlayerTeam = (prismaPlayerTeam: PrismaPlayerTeam): PlayerTeam => ({
  id: prismaPlayerTeam.id,
  playerId: prismaPlayerTeam.player_id,
  teamId: prismaPlayerTeam.team_id,
  startDate: toIsoDateString(prismaPlayerTeam.start_date) ?? '', // YYYY-MM-DD format
  endDate: toIsoDateString(prismaPlayerTeam.end_date),
  createdAt: toIsoStringRequired(prismaPlayerTeam.created_at),
  updatedAt: toIsoString(prismaPlayerTeam.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaPlayerTeam.created_by_user_id,
  deletedAt: toIsoString(prismaPlayerTeam.deleted_at),
  deletedByUserId: prismaPlayerTeam.deleted_by_user_id ?? undefined,
  isDeleted: prismaPlayerTeam.is_deleted,
});

// ============================================================================
// FRONTEND TO PRISMA TRANSFORMERS (for API requests)
// ============================================================================

export const transformPlayerCreateRequest = (
  request: PlayerCreateRequest,
  created_by_user_id: string
): PrismaPlayerCreateInput => ({
  name: request.name,
  squad_number: request.squadNumber ?? null,
  preferred_pos: request.preferredPosition ?? null,
  dob: request.dateOfBirth ? new Date(request.dateOfBirth) : null,
  notes: request.notes ?? null,
  created_by_user_id,
});

export const transformPlayerUpdateRequest = (
  request: PlayerUpdateRequest
): PrismaPlayerUpdateInput => {
  const update: PrismaPlayerUpdateInput = {};
  
  if (request.name !== undefined) update.name = request.name;
  if (request.squadNumber !== undefined) update.squad_number = request.squadNumber;
  if (request.preferredPosition !== undefined) update.preferred_pos = request.preferredPosition;
  if (request.dateOfBirth !== undefined) {
    update.dob = request.dateOfBirth ? new Date(request.dateOfBirth) : null;
  }
  if (request.notes !== undefined) update.notes = request.notes;
  
  return update;
};

export const transformTeamCreateRequest = (
  request: TeamCreateRequest,
  created_by_user_id: string
): PrismaTeamCreateInput => {
  
  const result = {
    name: request.name,
    is_opponent: (request as any).isOpponent ?? false,
    home_kit_primary: request.homeKitPrimary ?? null,
    home_kit_secondary: request.homeKitSecondary ?? null,
    away_kit_primary: request.awayKitPrimary ?? null,
    away_kit_secondary: request.awayKitSecondary ?? null,
    logo_url: request.logoUrl ?? null,
    created_by_user_id,
  };

  return result;
};

export const transformTeamUpdateRequest = (
  request: TeamUpdateRequest
): PrismaTeamUpdateInput => {
  const update: PrismaTeamUpdateInput = {};
  
  if (request.name !== undefined) update.name = request.name;
  if (request.homeKitPrimary !== undefined) update.home_kit_primary = request.homeKitPrimary;
  if (request.homeKitSecondary !== undefined) update.home_kit_secondary = request.homeKitSecondary;
  if (request.awayKitPrimary !== undefined) update.away_kit_primary = request.awayKitPrimary;
  if (request.awayKitSecondary !== undefined) update.away_kit_secondary = request.awayKitSecondary;
  if (request.logoUrl !== undefined) update.logo_url = request.logoUrl;
  
  return update;
};

export const transformMatchCreateRequest = (
  request: MatchCreateRequest,
  created_by_user_id: string
): PrismaMatchCreateInput => ({
  season_id: request.seasonId,
  kickoff_ts: new Date(request.kickoffTime),
  competition: request.competition ?? null,
  venue: request.venue ?? null,
  duration_mins: request.durationMinutes ?? 50,
  period_format: request.periodFormat ?? 'quarter',
  notes: request.notes ?? null,
  home_team_id: request.homeTeamId,
  away_team_id: request.awayTeamId,
  created_by_user_id,
});

export const transformMatchUpdateRequest = (
  request: MatchUpdateRequest
): PrismaMatchUpdateInput => {
  const update: PrismaMatchUpdateInput = {};
  
  if (request.seasonId !== undefined) update.season_id = request.seasonId;
  if (request.kickoffTime !== undefined) update.kickoff_ts = new Date(request.kickoffTime);
  if (request.competition !== undefined) update.competition = request.competition;
  if (request.homeTeamId !== undefined) update.home_team_id = request.homeTeamId;
  if (request.awayTeamId !== undefined) update.away_team_id = request.awayTeamId;
  if (request.venue !== undefined) update.venue = request.venue;
  if (request.durationMinutes !== undefined) update.duration_mins = request.durationMinutes;
  if (request.periodFormat !== undefined) update.period_format = request.periodFormat;
  if (request.homeScore !== undefined) update.home_score = request.homeScore;
  if (request.awayScore !== undefined) update.away_score = request.awayScore;
  if (request.notes !== undefined) update.notes = request.notes;
  
  return update;
};

export const transformEventCreateRequest = (
  request: EventCreateRequest,
  created_by_user_id: string
): PrismaEventCreateInput => ({
  ...(request.id ? { id: request.id } : {}),
  match_id: request.matchId,
  period_number: request.periodNumber ?? null,
  clock_ms: request.clockMs ?? null,
  kind: request.kind,
  team_id: request.teamId ?? null,
  player_id: request.playerId ?? null,
  notes: request.notes ?? null,
  sentiment: request.sentiment ?? 0,
  created_by_user_id,
});

export const transformSeasonCreateRequest = (
  request: SeasonCreateRequest,
  created_by_user_id: string
): PrismaSeasonCreateInput => ({
  label: request.label,
  start_date: new Date(request.startDate),
  end_date: new Date(request.endDate),
  is_current: request.isCurrent ?? false,
  description: request.description ?? null,
  created_by_user_id,
});

export const transformSeasonUpdateRequest = (
  request: SeasonUpdateRequest
): PrismaSeasonUpdateInput => {
  const update: PrismaSeasonUpdateInput = {};
  if (request.label !== undefined) update.label = request.label;
  if (request.startDate !== undefined) update.start_date = new Date(request.startDate);
  if (request.endDate !== undefined) update.end_date = new Date(request.endDate);
  if (request.isCurrent !== undefined) update.is_current = request.isCurrent;
  if (request.description !== undefined) update.description = request.description;
  return update;
};

export const transformPositionCreateRequest = (
  request: PositionCreateRequest
): PrismaPositionCreateInput => ({
  pos_code: request.code,
  long_name: request.longName,
});

export const transformPositionUpdateRequest = (
  request: PositionUpdateRequest
): PrismaPositionUpdateInput => {
  const update: PrismaPositionUpdateInput = {};
  if (request.code !== undefined) update.pos_code = request.code;
  if (request.longName !== undefined) update.long_name = request.longName;
  return update;
};

export const transformLineupCreateRequest = (
  request: LineupCreateRequest,
  created_by_user_id: string
): PrismaLineupCreateInput => ({
  match_id: request.matchId,
  player_id: request.playerId,
  start_min: request.startMinute ?? 0,
  end_min: request.endMinute ?? null,
  position: request.position,
  created_by_user_id,
});

export const transformLineupUpdateRequest = (
  request: LineupUpdateRequest
): PrismaLineupUpdateInput => {
  const update: PrismaLineupUpdateInput = {};
  if (request.startMinute !== undefined) update.start_min = request.startMinute;
  if (request.endMinute !== undefined) update.end_min = request.endMinute;
  if (request.position !== undefined) update.position = request.position;
  return update;
};

export const transformAwardCreateRequest = (
  request: AwardCreateRequest,
  created_by_user_id: string
): PrismaAwardCreateInput => ({
  season_id: request.seasonId,
  player_id: request.playerId,
  category: request.category,
  notes: request.notes ?? null,
  created_by_user_id,
});

export const transformAwardUpdateRequest = (
  request: AwardUpdateRequest
): PrismaAwardUpdateInput => {
  const update: PrismaAwardUpdateInput = {};
  if (request.category !== undefined) update.category = request.category;
  if (request.notes !== undefined) update.notes = request.notes;
  return update;
};

export const transformMatchAwardCreateRequest = (
  request: MatchAwardCreateRequest,
  created_by_user_id: string
): PrismaMatchAwardCreateInput => ({
  match_id: request.matchId,
  player_id: request.playerId,
  category: request.category,
  notes: request.notes ?? null,
  created_by_user_id,
});

export const transformMatchAwardUpdateRequest = (
  request: MatchAwardUpdateRequest
): PrismaMatchAwardUpdateInput => {
  const update: PrismaMatchAwardUpdateInput = {};
  if (request.category !== undefined) update.category = request.category;
  if (request.notes !== undefined) update.notes = request.notes;
  return update;
};

export const transformPlayerTeamCreateRequest = (
  request: PlayerTeamCreateRequest,
  created_by_user_id: string
): PrismaPlayerTeamCreateInput => ({
  player_id: request.playerId,
  team_id: request.teamId,
  start_date: new Date(request.startDate),
  end_date: request.endDate ? new Date(request.endDate) : null,
  created_by_user_id,
});

export const transformPlayerTeamUpdateRequest = (
  request: PlayerTeamUpdateRequest
): PrismaPlayerTeamUpdateInput => {
  const update: PrismaPlayerTeamUpdateInput = {};
  if (request.playerId !== undefined) update.player_id = request.playerId;
  if (request.teamId !== undefined) update.team_id = request.teamId;
  if (request.startDate !== undefined) update.start_date = new Date(request.startDate);
  if (request.endDate !== undefined) update.end_date = request.endDate ? new Date(request.endDate) : null;
  return update;
};

// ============================================================================
// MATCH STATE AND PERIOD TRANSFORMERS
// ============================================================================

export const transformStartMatchRequest = (
  request: StartMatchRequest,
  created_by_user_id: string
): PrismaMatchStateCreateInput => ({
  match_id: request.matchId,
  status: 'live',
  match_started_at: new Date(),
  total_elapsed_seconds: 0,
  created_by_user_id,
});

export const transformStartPeriodRequest = (
  request: StartPeriodRequest,
  created_by_user_id: string
): PrismaMatchPeriodCreateInput => ({
  match_id: request.matchId,
  period_number: request.periodNumber,
  period_type: request.periodType?.toLowerCase() || 'regular',
  started_at: new Date(),
  created_by_user_id,
});

export const transformMatchStateToResponse = (
  matchState: MatchState,
  currentPeriod?: MatchPeriod,
  allPeriods: MatchPeriod[] = []
): MatchStateResponse => ({
  matchState,
  currentPeriod,
  allPeriods,
});

export const transformMatchStateToStatusResponse = (
  matchState: MatchState,
  currentPeriodElapsedSeconds?: number
): MatchStatusResponse => ({
  matchId: matchState.matchId,
  status: matchState.status,
  currentPeriod: matchState.currentPeriod,
  currentPeriodType: matchState.currentPeriodType,
  totalElapsedSeconds: matchState.totalElapsedSeconds,
  currentPeriodElapsedSeconds,
  isLive: matchState.status === 'LIVE',
});

export const transformToLiveMatchesResponse = (
  liveMatches: Array<{
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    status: 'LIVE' | 'PAUSED';
    currentPeriod?: number;
    totalElapsedSeconds: number;
  }>
): LiveMatchesResponse => ({
  matches: liveMatches,
});

// ============================================================================
// ARRAY TRANSFORMERS
// ============================================================================

export const transformPlayers = (prismaPlayers: PrismaPlayer[]): Player[] =>
  prismaPlayers.map(transformPlayer);

export const transformTeams = (prismaTeams: PrismaTeam[]): Team[] =>
  prismaTeams.map(transformTeam);

export const transformMatches = (prismaMatches: PrismaMatch[]): Match[] =>
  prismaMatches.map(transformMatch);

export const transformEvents = (prismaEvents: PrismaEvent[]): Event[] =>
  prismaEvents.map(transformEvent);

export const transformSeasons = (prismaSeasons: PrismaSeason[]): Season[] =>
  prismaSeasons.map(transformSeason);

export const transformPositions = (prismaPositions: PrismaPosition[]): Position[] =>
  prismaPositions.map(transformPosition);

export const transformLineups = (prismaLineups: PrismaLineup[]): Lineup[] =>
  prismaLineups.map(transformLineup);

export const transformAward = (prismaAward: PrismaAward): Award => ({
  id: prismaAward.award_id,
  seasonId: prismaAward.season_id,
  playerId: prismaAward.player_id,
  category: prismaAward.category,
  notes: prismaAward.notes !== null ? prismaAward.notes : undefined,
  createdAt: toIsoStringRequired(prismaAward.created_at),
  updatedAt: toIsoString(prismaAward.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaAward.created_by_user_id,
  deletedAt: toIsoString(prismaAward.deleted_at),
  deletedByUserId: prismaAward.deleted_by_user_id ?? undefined,
  isDeleted: prismaAward.is_deleted,
});

export const transformMatchAward = (prismaMatchAward: PrismaMatchAward): MatchAward => ({
  id: prismaMatchAward.match_award_id,
  matchId: prismaMatchAward.match_id,
  playerId: prismaMatchAward.player_id,
  category: prismaMatchAward.category,
  notes: prismaMatchAward.notes !== null ? prismaMatchAward.notes : undefined,
  createdAt: toIsoStringRequired(prismaMatchAward.created_at),
  updatedAt: toIsoString(prismaMatchAward.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaMatchAward.created_by_user_id,
  deletedAt: toIsoString(prismaMatchAward.deleted_at),
  deletedByUserId: prismaMatchAward.deleted_by_user_id ?? undefined,
  isDeleted: prismaMatchAward.is_deleted,
});

export const transformAwards = (prismaAwards: PrismaAward[]): Award[] =>
  prismaAwards.map(transformAward);

export const transformMatchAwards = (prismaMatchAwards: PrismaMatchAward[]): MatchAward[] =>
  prismaMatchAwards.map(transformMatchAward);

export const transformPlayerTeams = (prismaPlayerTeams: PrismaPlayerTeam[]): PlayerTeam[] =>
  prismaPlayerTeams.map(transformPlayerTeam);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safely transform a nullable Prisma entity to frontend type
 */
export const safeTransformPlayer = (prismaPlayer: PrismaPlayer | null): Player | null =>
  prismaPlayer ? transformPlayer(prismaPlayer) : null;

export const safeTransformTeam = (prismaTeam: PrismaTeam | null): Team | null =>
  prismaTeam ? transformTeam(prismaTeam) : null;

export const safeTransformMatch = (prismaMatch: PrismaMatch | null): Match | null =>
  prismaMatch ? transformMatch(prismaMatch) : null;

export const safeTransformSeason = (prismaSeason: PrismaSeason | null): Season | null =>
  prismaSeason ? transformSeason(prismaSeason) : null;

export const safeTransformPosition = (prismaPosition: PrismaPosition | null): Position | null =>
  prismaPosition ? transformPosition(prismaPosition) : null;

export const safeTransformLineup = (prismaLineup: PrismaLineup | null): Lineup | null =>
  prismaLineup ? transformLineup(prismaLineup) : null;

export const safeTransformEvent = (prismaEvent: PrismaEvent | null): Event | null =>
  prismaEvent ? transformEvent(prismaEvent) : null;

export const safeTransformAward = (prismaAward: PrismaAward | null): Award | null =>
  prismaAward ? transformAward(prismaAward) : null;

export const safeTransformMatchAward = (prismaMatchAward: PrismaMatchAward | null): MatchAward | null =>
  prismaMatchAward ? transformMatchAward(prismaMatchAward) : null;

export const safeTransformPlayerTeam = (prismaPlayerTeam: PrismaPlayerTeam | null): PlayerTeam | null =>
  prismaPlayerTeam ? transformPlayerTeam(prismaPlayerTeam) : null;

export const transformMatchState = (prismaMatchState: PrismaMatchState): MatchState => ({
  id: prismaMatchState.id,
  matchId: prismaMatchState.match_id,
  status: prismaMatchState.status.toUpperCase() as 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED',
  currentPeriod: prismaMatchState.current_period || undefined,
  currentPeriodType: prismaMatchState.current_period_type ? prismaMatchState.current_period_type.toUpperCase() as 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' : undefined,
  matchStartedAt: toIsoString(prismaMatchState.match_started_at),
  matchEndedAt: toIsoString(prismaMatchState.match_ended_at),
  totalElapsedSeconds: prismaMatchState.total_elapsed_seconds,
  createdAt: toIsoStringRequired(prismaMatchState.created_at),
  updatedAt: toIsoString(prismaMatchState.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaMatchState.created_by_user_id,
  deletedAt: toIsoString(prismaMatchState.deleted_at),
  deletedByUserId: prismaMatchState.deleted_by_user_id ?? undefined,
  isDeleted: prismaMatchState.is_deleted,
});

export const transformMatchPeriod = (prismaMatchPeriod: PrismaMatchPeriod): MatchPeriod => ({
  id: prismaMatchPeriod.id,
  matchId: prismaMatchPeriod.match_id,
  periodNumber: prismaMatchPeriod.period_number,
  periodType: prismaMatchPeriod.period_type.toUpperCase() as 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT',
  startedAt: toIsoString(prismaMatchPeriod.started_at),
  endedAt: toIsoString(prismaMatchPeriod.ended_at),
  durationSeconds: prismaMatchPeriod.duration_seconds || undefined,
  createdAt: toIsoStringRequired(prismaMatchPeriod.created_at),
  updatedAt: toIsoString(prismaMatchPeriod.updated_at),
  // Authentication and soft delete fields (camelCase)
  createdByUserId: prismaMatchPeriod.created_by_user_id,
  deletedAt: toIsoString(prismaMatchPeriod.deleted_at),
  deletedByUserId: prismaMatchPeriod.deleted_by_user_id ?? undefined,
  isDeleted: prismaMatchPeriod.is_deleted,
});

export const transformMatchStates = (prismaMatchStates: PrismaMatchState[]): MatchState[] =>
  prismaMatchStates.map(transformMatchState);

export const transformMatchPeriods = (prismaMatchPeriods: PrismaMatchPeriod[]): MatchPeriod[] =>
  prismaMatchPeriods.map(transformMatchPeriod);

export const safeTransformMatchState = (prismaMatchState: PrismaMatchState | null): MatchState | null =>
  prismaMatchState ? transformMatchState(prismaMatchState) : null;

export const safeTransformMatchPeriod = (prismaMatchPeriod: PrismaMatchPeriod | null): MatchPeriod | null =>
  prismaMatchPeriod ? transformMatchPeriod(prismaMatchPeriod) : null;

/**
 * Transform with error handling
 */
export const tryTransformPlayer = (prismaPlayer: unknown): Player | null => {
  try {
    return transformPlayer(prismaPlayer as PrismaPlayer);
  } catch (error) {
    console.error('Failed to transform player:', error);
    return null;
  }
};
