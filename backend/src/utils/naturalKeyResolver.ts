import { PrismaClient } from '@prisma/client';

export interface ResolvedPlayerTeamKeys {
  playerId: string;
  teamId: string;
  playerName: string;
  teamName: string;
}

export interface ResolvedPlayerKeys {
  playerId: string;
  playerName: string;
}

export interface ResolvedTeamKeys {
  teamId: string;
  teamName: string;
}

export interface ResolvedSeasonKeys {
  seasonId: string;
  seasonLabel: string;
}

export interface ResolvedMatchKeys {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffTime: Date;
}

export interface PlayerTeamNaturalKey {
  playerName: string;
  teamName: string;
}

export interface PlayerNaturalKey {
  playerName: string;
}

export interface TeamNaturalKey {
  teamName: string;
}

export interface SeasonNaturalKey {
  seasonLabel: string;
}

export interface MatchNaturalKey {
  homeTeamName: string;
  awayTeamName: string;
  kickoffTime: string; // ISO string
}

export class NaturalKeyResolverError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'MULTIPLE_MATCHES' | 'ACCESS_DENIED' | 'INVALID_INPUT',
    public entity: string,
    public searchCriteria: any
  ) {
    super(message);
    this.name = 'NaturalKeyResolverError';
  }
}

export class NaturalKeyResolver {
  private prisma: PrismaClient;

  // Allow DI of Prisma to reuse existing client in services
  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ============================================================================
  // PLAYER RESOLUTION
  // ============================================================================

  async resolvePlayerByName(playerName: string, userId: string, userRole: string): Promise<string> {
    const where: any = {
      name: {
        equals: playerName,
        mode: 'insensitive' as const
      },
      is_deleted: false
    };

    // Non-admin users can only access players they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const players = await this.prisma.player.findMany({
      where,
      select: { id: true, name: true }
    });

    if (players.length === 0) {
      throw new NaturalKeyResolverError(
        `Player with name "${playerName}" not found or access denied`,
        'NOT_FOUND',
        'Player',
        { playerName }
      );
    }

    if (players.length > 1) {
      throw new NaturalKeyResolverError(
        `Multiple players found with name "${playerName}". Please use unique player names or UUIDs.`,
        'MULTIPLE_MATCHES',
        'Player',
        { playerName, matches: players.map(p => ({ id: p.id, name: p.name })) }
      );
    }

    return players[0]!.id;
  }

  async resolveMultiplePlayers(playerNames: string[], userId: string, userRole: string): Promise<ResolvedPlayerKeys[]> {
    const where: any = {
      name: {
        in: playerNames,
        mode: 'insensitive' as const
      },
      is_deleted: false
    };

    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const players = await this.prisma.player.findMany({
      where,
      select: { id: true, name: true }
    });

    const resolved: ResolvedPlayerKeys[] = [];
    const playerMap = new Map(players.map(p => [p.name.toLowerCase(), p]));

    for (const playerName of playerNames) {
      const player = playerMap.get(playerName.toLowerCase());
      if (!player) {
        throw new NaturalKeyResolverError(
          `Player with name "${playerName}" not found or access denied`,
          'NOT_FOUND',
          'Player',
          { playerName }
        );
      }
      resolved.push({
        playerId: player.id,
        playerName: player.name
      });
    }

    return resolved;
  }

  // ============================================================================
  // TEAM RESOLUTION
  // ============================================================================

  async resolveTeamByName(teamName: string, userId: string, userRole: string, opts?: { isOpponent?: boolean }): Promise<string> {
    const name = (teamName ?? '').trim();
    const where: any = {
      name: {
        equals: name,
        mode: 'insensitive' as const
      },
      is_deleted: false
    };

    if (typeof opts?.isOpponent === 'boolean') {
      where.is_opponent = opts.isOpponent;
    }

    // Non-admin users can only access teams they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const teams = await this.prisma.team.findMany({
      where,
      select: { id: true, name: true }
    });

    if (teams.length === 0) {
      throw new NaturalKeyResolverError(
        `Team with name "${name}" not found or access denied`,
        'NOT_FOUND',
        'Team',
        { teamName: name, ...(opts && { isOpponent: opts.isOpponent }) }
      );
    }

    if (teams.length > 1) {
      throw new NaturalKeyResolverError(
        `Multiple teams found with name "${name}". Please use unique team names or UUIDs.`,
        'MULTIPLE_MATCHES',
        'Team',
        { teamName: name, matches: teams.map(t => ({ id: t.id, name: t.name })) }
      );
    }

    return teams[0]!.id;
  }

  async resolveMultipleTeams(teamNames: string[], userId: string, userRole: string, opts?: { isOpponent?: boolean }): Promise<ResolvedTeamKeys[]> {
    const names = teamNames.map(n => (n ?? '').trim());
    const where: any = {
      name: {
        in: names,
        mode: 'insensitive' as const
      },
      is_deleted: false
    };

    if (typeof opts?.isOpponent === 'boolean') {
      where.is_opponent = opts.isOpponent;
    }

    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const teams = await this.prisma.team.findMany({
      where,
      select: { id: true, name: true }
    });

    const resolved: ResolvedTeamKeys[] = [];
    const teamMap = new Map(teams.map(t => [t.name.toLowerCase(), t]));

    for (const teamName of names) {
      const team = teamMap.get(teamName.toLowerCase());
      if (!team) {
        throw new NaturalKeyResolverError(
          `Team with name "${teamName}" not found or access denied`,
          'NOT_FOUND',
          'Team',
          { teamName, ...(opts && { isOpponent: opts.isOpponent }) }
        );
      }
      resolved.push({
        teamId: team.id,
        teamName: team.name
      });
    }

    return resolved;
  }

  // ============================================================================
  // SEASON RESOLUTION
  // ============================================================================

  async resolveSeasonByLabel(seasonLabel: string, userId: string, userRole: string): Promise<string> {
    const where: any = {
      label: {
        equals: seasonLabel,
        mode: 'insensitive' as const
      },
      is_deleted: false
    };

    // Non-admin users can only access seasons they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const seasons = await this.prisma.seasons.findMany({
      where,
      select: { season_id: true, label: true }
    });

    if (seasons.length === 0) {
      throw new NaturalKeyResolverError(
        `Season with label "${seasonLabel}" not found or access denied`,
        'NOT_FOUND',
        'Season',
        { seasonLabel }
      );
    }

    if (seasons.length > 1) {
      throw new NaturalKeyResolverError(
        `Multiple seasons found with label "${seasonLabel}". Please use unique season labels or UUIDs.`,
        'MULTIPLE_MATCHES',
        'Season',
        { seasonLabel, matches: seasons.map(s => ({ id: s.season_id, label: s.label })) }
      );
    }

    return seasons[0]!.season_id;
  }

  // ============================================================================
  // MATCH RESOLUTION
  // ============================================================================

  async resolveMatchByTeamsAndTime(homeTeamName: string, awayTeamName: string, kickoffTime: string, userId: string, userRole: string): Promise<string> {
    // First resolve team names to IDs
    const [homeTeamId, awayTeamId] = await Promise.all([
      this.resolveTeamByName(homeTeamName, userId, userRole),
      this.resolveTeamByName(awayTeamName, userId, userRole)
    ]);

    const kickoffDate = new Date(kickoffTime);
    if (isNaN(kickoffDate.getTime())) {
      throw new NaturalKeyResolverError(
        `Invalid kickoff time format: "${kickoffTime}". Please use ISO date format.`,
        'INVALID_INPUT',
        'Match',
        { homeTeamName, awayTeamName, kickoffTime }
      );
    }

    const where: any = {
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_ts: kickoffDate,
      is_deleted: false
    };

    // Non-admin users can only access matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const matches = await this.prisma.match.findMany({
      where,
      select: { match_id: true, kickoff_ts: true }
    });

    if (matches.length === 0) {
      throw new NaturalKeyResolverError(
        `Match between "${homeTeamName}" vs "${awayTeamName}" at "${kickoffTime}" not found or access denied`,
        'NOT_FOUND',
        'Match',
        { homeTeamName, awayTeamName, kickoffTime }
      );
    }

    if (matches.length > 1) {
      throw new NaturalKeyResolverError(
        `Multiple matches found between "${homeTeamName}" vs "${awayTeamName}" at "${kickoffTime}".`,
        'MULTIPLE_MATCHES',
        'Match',
        { homeTeamName, awayTeamName, kickoffTime, matches: matches.map(m => ({ id: m.match_id, kickoff: m.kickoff_ts })) }
      );
    }

    return matches[0]!.match_id;
  }

  // ============================================================================
  // COMBINED PLAYER-TEAM RESOLUTION
  // ============================================================================

  async resolvePlayerTeamKeys(playerName: string, teamName: string, userId: string, userRole: string): Promise<ResolvedPlayerTeamKeys> {
    const [playerId, teamId] = await Promise.all([
      this.resolvePlayerByName(playerName, userId, userRole),
      this.resolveTeamByName(teamName, userId, userRole)
    ]);

    return {
      playerId,
      teamId,
      playerName,
      teamName
    };
  }

  async resolveMultiplePlayerTeamKeys(requests: PlayerTeamNaturalKey[], userId: string, userRole: string): Promise<ResolvedPlayerTeamKeys[]> {
    // Extract unique player and team names
    const uniquePlayerNames = [...new Set(requests.map(r => r.playerName))];
    const uniqueTeamNames = [...new Set(requests.map(r => r.teamName))];

    // Resolve all players and teams in batch
    const [resolvedPlayers, resolvedTeams] = await Promise.all([
      this.resolveMultiplePlayers(uniquePlayerNames, userId, userRole),
      this.resolveMultipleTeams(uniqueTeamNames, userId, userRole)
    ]);

    // Create lookup maps
    const playerMap = new Map(resolvedPlayers.map(p => [p.playerName.toLowerCase(), p.playerId]));
    const teamMap = new Map(resolvedTeams.map(t => [t.teamName.toLowerCase(), t.teamId]));

    // Resolve each request
    return requests.map(request => {
      const playerId = playerMap.get(request.playerName.toLowerCase());
      const teamId = teamMap.get(request.teamName.toLowerCase());

      if (!playerId || !teamId) {
        throw new NaturalKeyResolverError(
          `Failed to resolve player "${request.playerName}" or team "${request.teamName}"`,
          'NOT_FOUND',
          'PlayerTeam',
          request
        );
      }

      return {
        playerId,
        teamId,
        playerName: request.playerName,
        teamName: request.teamName
      };
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if a request contains natural keys vs UUIDs
   */
  static hasNaturalKeys(data: any): boolean {
    return !!(data.playerName || data.teamName || data.seasonLabel || data.homeTeamName || data.awayTeamName);
  }

  /**
   * Check if a string is a valid UUID
   */
  static isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  async disconnect(): Promise<void> {
    // Only disconnect if we created the client locally
    // Note: We cannot reliably detect ownership; keep as no-op for injected clients
    try { await this.prisma.$disconnect(); } catch {}
  }
}
