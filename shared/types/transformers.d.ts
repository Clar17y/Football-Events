import type { PrismaPlayer, PrismaTeam, PrismaMatch, PrismaEvent, PrismaSeason, PrismaPosition, PrismaLineup, PrismaPlayerCreateInput, PrismaPlayerUpdateInput, PrismaTeamCreateInput, PrismaTeamUpdateInput, PrismaMatchCreateInput, PrismaMatchUpdateInput, PrismaEventCreateInput, PrismaSeasonCreateInput, PrismaSeasonUpdateInput, PrismaPositionCreateInput, PrismaPositionUpdateInput, PrismaLineupCreateInput, PrismaLineupUpdateInput } from './prisma';
import type { Player, Team, Match, Event, Season, Position, Lineup, PlayerCreateRequest, PlayerUpdateRequest, TeamCreateRequest, TeamUpdateRequest, MatchCreateRequest, MatchUpdateRequest, EventCreateRequest, SeasonCreateRequest, SeasonUpdateRequest, PositionCreateRequest, PositionUpdateRequest, LineupCreateRequest, LineupUpdateRequest } from './frontend';
export declare const transformPlayer: (prismaPlayer: PrismaPlayer) => Player;
export declare const transformTeam: (prismaTeam: PrismaTeam) => Team;
export declare const transformMatch: (prismaMatch: PrismaMatch) => Match;
export declare const transformEvent: (prismaEvent: PrismaEvent) => Event;
export declare const transformSeason: (prismaSeason: PrismaSeason) => Season;
export declare const transformPosition: (prismaPosition: PrismaPosition) => Position;
export declare const transformLineup: (prismaLineup: PrismaLineup) => Lineup;
export declare const transformPlayerCreateRequest: (request: PlayerCreateRequest) => PrismaPlayerCreateInput;
export declare const transformPlayerUpdateRequest: (request: PlayerUpdateRequest) => PrismaPlayerUpdateInput;
export declare const transformTeamCreateRequest: (request: TeamCreateRequest) => PrismaTeamCreateInput;
export declare const transformTeamUpdateRequest: (request: TeamUpdateRequest) => PrismaTeamUpdateInput;
export declare const transformMatchCreateRequest: (request: MatchCreateRequest) => PrismaMatchCreateInput;
export declare const transformMatchUpdateRequest: (request: MatchUpdateRequest) => PrismaMatchUpdateInput;
export declare const transformEventCreateRequest: (request: EventCreateRequest) => PrismaEventCreateInput;
export declare const transformSeasonCreateRequest: (request: SeasonCreateRequest) => PrismaSeasonCreateInput;
export declare const transformSeasonUpdateRequest: (request: SeasonUpdateRequest) => PrismaSeasonUpdateInput;
export declare const transformPositionCreateRequest: (request: PositionCreateRequest) => PrismaPositionCreateInput;
export declare const transformPositionUpdateRequest: (request: PositionUpdateRequest) => PrismaPositionUpdateInput;
export declare const transformLineupCreateRequest: (request: LineupCreateRequest) => PrismaLineupCreateInput;
export declare const transformLineupUpdateRequest: (request: LineupUpdateRequest) => PrismaLineupUpdateInput;
export declare const transformPlayers: (prismaPlayers: PrismaPlayer[]) => Player[];
export declare const transformTeams: (prismaTeams: PrismaTeam[]) => Team[];
export declare const transformMatches: (prismaMatches: PrismaMatch[]) => Match[];
export declare const transformEvents: (prismaEvents: PrismaEvent[]) => Event[];
export declare const transformSeasons: (prismaSeasons: PrismaSeason[]) => Season[];
export declare const transformPositions: (prismaPositions: PrismaPosition[]) => Position[];
export declare const transformLineups: (prismaLineups: PrismaLineup[]) => Lineup[];
export declare const safeTransformPlayer: (prismaPlayer: PrismaPlayer | null) => Player | null;
export declare const safeTransformTeam: (prismaTeam: PrismaTeam | null) => Team | null;
export declare const safeTransformMatch: (prismaMatch: PrismaMatch | null) => Match | null;
export declare const safeTransformSeason: (prismaSeason: PrismaSeason | null) => Season | null;
export declare const safeTransformPosition: (prismaPosition: PrismaPosition | null) => Position | null;
export declare const safeTransformLineup: (prismaLineup: PrismaLineup | null) => Lineup | null;
export declare const tryTransformPlayer: (prismaPlayer: unknown) => Player | null;
//# sourceMappingURL=transformers.d.ts.map