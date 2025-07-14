/**
 * Type transformation functions between Prisma database types and frontend types
 * These functions handle field name mapping and data structure conversion
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
} from './frontend';

// ============================================================================
// PRISMA TO FRONTEND TRANSFORMERS
// ============================================================================

export const transformPlayer = (prismaPlayer: PrismaPlayer): Player => ({
  id: prismaPlayer.id,
  name: prismaPlayer.name,
  squadNumber: prismaPlayer.squad_number ?? undefined,
  preferredPosition: prismaPlayer.preferred_pos ?? undefined,
  dateOfBirth: prismaPlayer.dob ?? undefined,
  notes: prismaPlayer.notes ?? undefined,
  currentTeam: prismaPlayer.current_team ?? undefined,
  createdAt: prismaPlayer.created_at,
  updatedAt: prismaPlayer.updated_at ?? undefined,
});

export const transformTeam = (prismaTeam: PrismaTeam): Team => ({
  id: prismaTeam.id,
  name: prismaTeam.name,
  homeKitPrimary: prismaTeam.home_kit_primary ?? undefined,
  homeKitSecondary: prismaTeam.home_kit_secondary ?? undefined,
  awayKitPrimary: prismaTeam.away_kit_primary ?? undefined,
  awayKitSecondary: prismaTeam.away_kit_secondary ?? undefined,
  logoUrl: prismaTeam.logo_url ?? undefined,
  createdAt: prismaTeam.created_at,
  updatedAt: prismaTeam.updated_at ?? undefined,
});

export const transformMatch = (prismaMatch: PrismaMatch): Match => ({
  id: prismaMatch.match_id,
  seasonId: prismaMatch.season_id,
  kickoffTime: prismaMatch.kickoff_ts,
  competition: prismaMatch.competition ?? undefined,
  homeTeamId: prismaMatch.home_team_id,
  awayTeamId: prismaMatch.away_team_id,
  venue: prismaMatch.venue ?? undefined,
  durationMinutes: prismaMatch.duration_mins,
  periodFormat: prismaMatch.period_format,
  ourScore: prismaMatch.our_score,
  opponentScore: prismaMatch.opponent_score,
  notes: prismaMatch.notes ?? undefined,
  createdAt: prismaMatch.created_at,
  updatedAt: prismaMatch.updated_at ?? undefined,
});

export const transformEvent = (prismaEvent: PrismaEvent): Event => ({
  id: prismaEvent.id,
  matchId: prismaEvent.matchId,
  seasonId: prismaEvent.season_id,
  createdAt: prismaEvent.created_at,
  periodNumber: prismaEvent.period_number ?? undefined,
  clockMs: prismaEvent.clockMs ?? undefined,
  kind: prismaEvent.kind,
  teamId: prismaEvent.teamId ?? undefined,
  playerId: prismaEvent.playerId ?? undefined,
  notes: prismaEvent.notes ?? undefined,
  sentiment: prismaEvent.sentiment ?? 0,
  updatedAt: prismaEvent.updated_at ?? undefined,
});

export const transformSeason = (prismaSeason: PrismaSeason): Season => ({
  seasonId: prismaSeason.season_id,
  label: prismaSeason.label,
  startDate: prismaSeason.start_date ? prismaSeason.start_date.toISOString().split('T')[0] : undefined,
  endDate: prismaSeason.end_date ? prismaSeason.end_date.toISOString().split('T')[0] : undefined,
  isCurrent: prismaSeason.is_current ?? false,
  description: prismaSeason.description ?? undefined,
  createdAt: prismaSeason.created_at,
  updatedAt: prismaSeason.updated_at ?? undefined,
});

export const transformPosition = (prismaPosition: PrismaPosition): Position => ({
  code: prismaPosition.pos_code,
  longName: prismaPosition.long_name,
  createdAt: prismaPosition.created_at,
  updatedAt: prismaPosition.updated_at ?? undefined,
});

export const transformLineup = (prismaLineup: PrismaLineup): Lineup => ({
  matchId: prismaLineup.match_id,
  playerId: prismaLineup.player_id,
  startMinute: prismaLineup.start_min,
  endMinute: prismaLineup.end_min ?? undefined,
  position: prismaLineup.position,
  createdAt: prismaLineup.created_at,
  updatedAt: prismaLineup.updated_at ?? undefined,
});

// ============================================================================
// FRONTEND TO PRISMA TRANSFORMERS (for API requests)
// ============================================================================

export const transformPlayerCreateRequest = (
  request: PlayerCreateRequest
): PrismaPlayerCreateInput => ({
  name: request.name,
  squad_number: request.squadNumber ?? null,
  preferred_pos: request.preferredPosition ?? null,
  dob: request.dateOfBirth ?? null,
  notes: request.notes ?? null,
  current_team: request.currentTeam ?? null,
});

export const transformPlayerUpdateRequest = (
  request: PlayerUpdateRequest
): PrismaPlayerUpdateInput => {
  const update: PrismaPlayerUpdateInput = {};
  
  if (request.name !== undefined) update.name = request.name;
  if (request.squadNumber !== undefined) update.squad_number = request.squadNumber;
  if (request.preferredPosition !== undefined) update.preferred_pos = request.preferredPosition;
  if (request.dateOfBirth !== undefined) update.dob = request.dateOfBirth;
  if (request.notes !== undefined) update.notes = request.notes;
  if (request.currentTeam !== undefined) update.current_team = request.currentTeam;
  
  return update;
};

export const transformTeamCreateRequest = (
  request: TeamCreateRequest
): PrismaTeamCreateInput => ({
  name: request.name,
  home_kit_primary: request.homeKitPrimary ?? null,
  home_kit_secondary: request.homeKitSecondary ?? null,
  away_kit_primary: request.awayKitPrimary ?? null,
  away_kit_secondary: request.awayKitSecondary ?? null,
  logo_url: request.logoUrl ?? null,
});

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
  request: MatchCreateRequest
): PrismaMatchCreateInput => ({
  season_id: request.seasonId,
  kickoff_ts: request.kickoffTime,
  competition: request.competition ?? null,
  venue: request.venue ?? null,
  duration_mins: request.durationMinutes ?? 50,
  period_format: request.periodFormat ?? 'quarter',
  notes: request.notes ?? null,
  home_team_id: request.homeTeamId,
  away_team_id: request.awayTeamId
});

export const transformMatchUpdateRequest = (
  request: MatchUpdateRequest
): PrismaMatchUpdateInput => {
  const update: PrismaMatchUpdateInput = {};
  
  if (request.seasonId !== undefined) update.season_id = request.seasonId;
  if (request.kickoffTime !== undefined) update.kickoff_ts = request.kickoffTime;
  if (request.competition !== undefined) update.competition = request.competition;
  if (request.homeTeamId !== undefined) update.home_team_id = request.homeTeamId;
  if (request.awayTeamId !== undefined) update.away_team_id = request.awayTeamId;
  if (request.venue !== undefined) update.venue = request.venue;
  if (request.durationMinutes !== undefined) update.duration_mins = request.durationMinutes;
  if (request.periodFormat !== undefined) update.period_format = request.periodFormat;
  if (request.ourScore !== undefined) update.our_score = request.ourScore;
  if (request.opponentScore !== undefined) update.opponent_score = request.opponentScore;
  if (request.notes !== undefined) update.notes = request.notes;
  
  return update;
};

export const transformEventCreateRequest = (
  request: EventCreateRequest
): any => ({
  matchId: request.matchId,
  season_id: request.seasonId,
  period_number: request.periodNumber ?? null,
  clockMs: request.clockMs ?? null,
  kind: request.kind,
  teamId: request.teamId ?? null,
  playerId: request.playerId ?? null,
  notes: request.notes ?? null,
  sentiment: request.sentiment ?? 0,
});

export const transformSeasonCreateRequest = (
  request: SeasonCreateRequest
): PrismaSeasonCreateInput => ({
  label: request.label,
  start_date: new Date(request.startDate),
  end_date: new Date(request.endDate),
  is_current: request.isCurrent ?? false,
  description: request.description ?? null,
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
  request: LineupCreateRequest
): PrismaLineupCreateInput => ({
  match_id: request.matchId,
  player_id: request.playerId,
  start_min: request.startMinute ?? 0,
  end_min: request.endMinute ?? null,
  position: request.position,
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
  request: AwardCreateRequest
): PrismaAwardCreateInput => ({
  season_id: request.seasonId,
  player_id: request.playerId,
  category: request.category,
  notes: request.notes ?? null,
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
  request: MatchAwardCreateRequest
): PrismaMatchAwardCreateInput => ({
  match_id: request.matchId,
  player_id: request.playerId,
  category: request.category,
  notes: request.notes ?? null,
});

export const transformMatchAwardUpdateRequest = (
  request: MatchAwardUpdateRequest
): PrismaMatchAwardUpdateInput => {
  const update: PrismaMatchAwardUpdateInput = {};
  if (request.category !== undefined) update.category = request.category;
  if (request.notes !== undefined) update.notes = request.notes;
  return update;
};

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
  createdAt: prismaAward.created_at,
  updatedAt: prismaAward.updated_at !== null ? prismaAward.updated_at : undefined,
});

export const transformMatchAward = (prismaMatchAward: PrismaMatchAward): MatchAward => ({
  id: prismaMatchAward.match_award_id,
  matchId: prismaMatchAward.match_id,
  playerId: prismaMatchAward.player_id,
  category: prismaMatchAward.category,
  notes: prismaMatchAward.notes !== null ? prismaMatchAward.notes : undefined,
  createdAt: prismaMatchAward.created_at,
  updatedAt: prismaMatchAward.updated_at !== null ? prismaMatchAward.updated_at : undefined,
});

export const transformAwards = (prismaAwards: PrismaAward[]): Award[] =>
  prismaAwards.map(transformAward);

export const transformMatchAwards = (prismaMatchAwards: PrismaMatchAward[]): MatchAward[] =>
  prismaMatchAwards.map(transformMatchAward);

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