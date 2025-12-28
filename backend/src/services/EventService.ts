import { PrismaClient } from '@prisma/client';
import { 
  transformEvent, 
  transformEventCreateRequest, 
  transformEvents,
  safeTransformEvent
} from '@shared/types';
import { createOrRestoreSoftDeleted } from '../utils/softDeleteUtils';
import type { 
  Event, 
  EventCreateRequest,
  EventUpdateRequest
} from '@shared/types';
import { QuotaService } from './QuotaService';

export interface GetEventsOptions {
  page: number;
  limit: number;
  search?: string;
  matchId?: string;
  seasonId?: string;
  playerId?: string;
  teamId?: string;
  kind?: string;
}

export interface PaginatedEvents {
  data: Event[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface BatchEventRequest {
  create?: EventCreateRequest[];
  update?: { id: string; data: EventUpdateRequest }[];
  delete?: string[];
}

export interface BatchEventResult {
  created: { success: number; failed: number; errors: Array<{ data: EventCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
}

export class EventService {
  private prisma: PrismaClient;
  private quotaService: QuotaService;

  constructor() {
    this.prisma = new PrismaClient();
    this.quotaService = new QuotaService(this.prisma);
  }

  async getEvents(userId: string, userRole: string, options: GetEventsOptions): Promise<PaginatedEvents> {
    const { page, limit, search, matchId, seasonId, playerId, teamId, kind } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted events
    };
    
    if (search) {
      where.OR = [
        {
          notes: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          kind: {
            contains: search,
            mode: 'insensitive' as const
          }
        }
      ];
    }
    
    if (matchId) {
      where.match_id = matchId;
    }
    
    if (seasonId) {
      // Filter by season through match relationship
      where.matches = {
        season_id: seasonId
      };
    }
    
    if (playerId) {
      where.player_id = playerId;
    }
    
    if (teamId) {
      where.team_id = teamId;
    }
    
    if (kind) {
      where.kind = kind;
    }

    // Non-admin users can only see events from matches they can access
    if (userRole !== 'ADMIN') {
      const accessibleMatchIds = await this.getAccessibleMatchIds(userId);
      where.match_id = { in: accessibleMatchIds };
    }

    // Get events and total count
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { match_id: 'desc' },
          { clock_ms: 'asc' },
          { created_at: 'asc' }
        ],
        include: {
          created_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      }),
      this.prisma.event.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformEvents(events),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  async getEventById(id: string, userId: string, userRole: string): Promise<Event | null> {
    const where: any = { 
      id,
      is_deleted: false 
    };

    // Non-admin users can only see events from matches they can access
    if (userRole !== 'ADMIN') {
      const accessibleMatchIds = await this.getAccessibleMatchIds(userId);
      where.match_id = { in: accessibleMatchIds };
    }

    const event = await this.prisma.event.findFirst({
      where,
      include: {
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    return safeTransformEvent(event);
  }

  async createEvent(data: EventCreateRequest, userId: string, userRole: string): Promise<Event> {
    if (!data.teamId) {
      const error = new Error('Team ID is required for all events') as any;
      error.statusCode = 400;
      throw error;
    }

    // Validate that user can create events for this match (only match creator or admin)
    const matchWhere: any = { match_id: data.matchId, is_deleted: false };
    if (userRole !== 'ADMIN') {
      matchWhere.created_by_user_id = userId;
    }

    const match = await this.prisma.match.findFirst({
      where: matchWhere,
      select: { home_team_id: true, away_team_id: true }
    });

    if (!match) {
      const error = new Error('Match not found or access denied') as any;
      error.statusCode = 403;
      throw error;
    }

    if (data.teamId !== match.home_team_id && data.teamId !== match.away_team_id) {
      const error = new Error('Team does not belong to this match') as any;
      error.statusCode = 400;
      throw error;
    }

    if (data.playerId) {
      const playerTeam = await this.prisma.player_teams.findFirst({
        where: {
          team_id: data.teamId,
          player_id: data.playerId,
          is_active: true,
          is_deleted: false,
          player: { is_deleted: false }
        }
      });

      if (!playerTeam) {
        const error = new Error('Player does not belong to the specified team') as any;
        error.statusCode = 400;
        throw error;
      }
    }

    // Transform the request data
    const prismaInput = transformEventCreateRequest(data, userId);
    
    // Add user ownership
    const eventData = {
      ...prismaInput,
      created_by_user_id: userId
    };

    // If the client provides an ID, treat creation as idempotent for local-first sync:
    // return the existing event instead of creating duplicates.
    let existingById: any | null = null;
    if (data.id) {
      existingById = await this.prisma.event.findUnique({ where: { id: data.id } });
      if (existingById && !existingById.is_deleted) {
        if (existingById.match_id !== data.matchId) {
          const error = new Error('Event ID already exists for a different match') as any;
          error.statusCode = 409;
          throw error;
        }
        return transformEvent(existingById);
      }
    }

    await this.quotaService.assertCanCreateEvent({
      userId,
      userRole,
      matchId: data.matchId,
      kind: data.kind
    });

    // Create unique constraint for event (match + team + player + kind + clock)
    const uniqueConstraints: any = { match_id: data.matchId };
    if (data.teamId) uniqueConstraints.team_id = data.teamId;
    if (data.playerId) uniqueConstraints.player_id = data.playerId;
    if (data.kind) uniqueConstraints.kind = data.kind;
    if (data.clockMs !== undefined) uniqueConstraints.clock_ms = data.clockMs;

    let createdEvent: any;

    if (data.id) {
      if (existingById && existingById.is_deleted) {
        // Restore by ID (avoid attempting to update the primary key field)
        const { id: _id, ...rest } = eventData as any;
        createdEvent = await this.prisma.event.update({
          where: { id: data.id },
          data: {
            ...rest,
            is_deleted: false,
            deleted_at: null,
            deleted_by_user_id: null,
            updated_at: new Date(),
            created_by_user_id: userId,
          }
        });
      } else {
        createdEvent = await this.prisma.event.create({
          data: eventData as any,
        });
      }
    } else {
      // Use the soft delete utility to create or restore (natural-key based)
      createdEvent = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'event',
        uniqueConstraints,
        createData: eventData,
        userId: userId,
        transformer: (rawEvent: any) => rawEvent
      });
    }

    // Get the event with includes for proper transformation
    const eventWithIncludes = await this.prisma.event.findUnique({
      where: { id: createdEvent.id },
      include: {
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    const transformed = transformEvent(eventWithIncludes!);
    // Broadcast to SSE subscribers (include teamName and playerName)
    try {
      const { sseHub } = await import('../utils/sse');
      // Resolve teamName from match teams
      const matchInfo = await this.prisma.match.findUnique({
        where: { match_id: data.matchId },
        select: {
          home_team_id: true,
          away_team_id: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        }
      });
      let teamName: string | undefined = undefined;
      if (matchInfo && transformed.teamId) {
        teamName = transformed.teamId === matchInfo.home_team_id ? matchInfo.homeTeam?.name : transformed.teamId === matchInfo.away_team_id ? matchInfo.awayTeam?.name : undefined;
      }
      // Resolve playerName if present
      let playerName: string | undefined = undefined;
      if (transformed.playerId) {
        const player = await this.prisma.player.findUnique({ where: { id: transformed.playerId }, select: { name: true } });
        playerName = player?.name;
      }
      // Determine periodType from active period if available
      let periodType: string | undefined = undefined;
      try {
        const active = await this.prisma.match_periods.findFirst({
          where: { match_id: data.matchId, started_at: { not: null }, ended_at: null, is_deleted: false },
          select: { period_type: true }
        });
        periodType = active?.period_type;
      } catch {}
      sseHub.broadcast(data.matchId, 'event_created', { event: {
        id: transformed.id,
        kind: transformed.kind,
        teamId: transformed.teamId || null,
        teamName,
        playerId: transformed.playerId || null,
        playerName,
        periodType,
        periodNumber: transformed.periodNumber || null,
        clockMs: transformed.clockMs || 0,
        sentiment: transformed.sentiment || 0,
        notes: transformed.notes || null,
        createdAt: transformed.createdAt,
      }});
    } catch {}
    // Recompute and persist match score (home/away)
    try {
      const { ScoreService } = await import('./ScoreService');
      await ScoreService.recomputeAndPersistScore(this.prisma as any, data.matchId);
    } catch {}
    return transformed;
  }

  async updateEvent(id: string, data: EventUpdateRequest, userId: string, userRole: string): Promise<Event | null> {
    try {
      // Handle upsert logic - if event doesn't exist, create it
      const existingEvent = await this.prisma.event.findFirst({
        where: { 
          id,
          is_deleted: false 
        }
      });

      if (!existingEvent) {
        // For upsert, we need the full data to create
        if (this.isCompleteEventData(data)) {
          const createData = { id, ...data } as EventCreateRequest;
          return await this.createEvent(createData, userId, userRole);
        } else {
          return null; // Cannot create with partial data
        }
      }

      // Validate that user can modify events for this match (only match creator or admin)
      const matchWhere: any = { match_id: existingEvent.match_id, is_deleted: false };
      if (userRole !== 'ADMIN') {
        matchWhere.created_by_user_id = userId;
      }
      const match = await this.prisma.match.findFirst({
        where: matchWhere,
        select: { home_team_id: true, away_team_id: true }
      });
      if (!match) {
        return null; // Match not found or access denied
      }

      const teamId = data.teamId ?? existingEvent.team_id;
      if (!teamId) {
        const error = new Error('Team ID is required for all events') as any;
        error.statusCode = 400;
        throw error;
      }

      if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
        const error = new Error('Team does not belong to this match') as any;
        error.statusCode = 400;
        throw error;
      }

      const playerId = data.playerId === null ? null : (data.playerId ?? existingEvent.player_id);
      if (playerId) {
        const playerTeam = await this.prisma.player_teams.findFirst({
          where: {
            team_id: teamId,
            player_id: playerId,
            is_active: true,
            is_deleted: false,
            player: { is_deleted: false }
          }
        });

        if (!playerTeam) {
          const error = new Error('Player does not belong to the specified team') as any;
          error.statusCode = 400;
          throw error;
        }
      }

      if (data.kind !== undefined && data.kind !== existingEvent.kind) {
        await this.quotaService.assertCanUpdateEventKind({
          userId,
          userRole,
          matchId: existingEvent.match_id,
          existingKind: existingEvent.kind as any,
          nextKind: data.kind
        });
      }

      // Update existing event
      const prismaInput: any = {};
      
      if (data.kind !== undefined) prismaInput.kind = data.kind;
      if (data.teamId !== undefined) prismaInput.team_id = data.teamId;
      if (data.playerId !== undefined) prismaInput.player_id = data.playerId;
      if (data.periodNumber !== undefined) prismaInput.period_number = data.periodNumber;
      if (data.clockMs !== undefined) prismaInput.clock_ms = data.clockMs;
      if (data.notes !== undefined) prismaInput.notes = data.notes;
      if (data.sentiment !== undefined) prismaInput.sentiment = data.sentiment;
      
      // Always update the updated_at timestamp
      prismaInput.updated_at = new Date();

      const event = await this.prisma.event.update({
        where: { id },
        data: prismaInput,
        include: {
          created_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      });

      return transformEvent(event);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Event not found
      }
      throw error;
    }
  }

  async deleteEvent(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if event exists and user has permission
      const existingEvent = await this.prisma.event.findFirst({
        where: { 
          id,
          is_deleted: false 
        }
      });

      if (!existingEvent) {
        return false; // Event not found
      }

      // Validate that user can modify events for this match (only match creator or admin)
      if (userRole !== 'ADMIN') {
        const canModifyEvents = await this.canUserModifyMatch(existingEvent.match_id, userId);
        if (!canModifyEvents) {
          return false; // Access denied
        }
      }

      // Soft delete the event
      const deleted = await this.prisma.event.update({
        where: { id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });
      // Fire SSE deletion
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(deleted.match_id, 'event_deleted', { id });
      } catch {}
      // Recompute and persist score
      try {
        const { ScoreService } = await import('./ScoreService');
        await ScoreService.recomputeAndPersistScore(this.prisma as any, deleted.match_id);
      } catch {}
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Event not found
      }
      throw error;
    }
  }

  async getEventsByMatch(matchId: string, userId: string, userRole: string): Promise<Event[]> {
    // Check if user can access this match
    if (userRole !== 'ADMIN') {
      const accessibleMatchIds = await this.getAccessibleMatchIds(userId);
      if (!accessibleMatchIds.includes(matchId)) {
        return []; // Return empty array if no access
      }
    }

    const events = await this.prisma.event.findMany({
      where: { 
        match_id: matchId,
        is_deleted: false 
      },
      orderBy: [
        { clock_ms: 'asc' },
        { created_at: 'asc' }
      ],
      include: {
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    return transformEvents(events);
  }

  async getEventsBySeason(seasonId: string, userId: string, userRole: string): Promise<Event[]> {
    const where: any = {
      matches: {
        season_id: seasonId
      },
      is_deleted: false
    };

    // Non-admin users can only see events from matches they can access
    if (userRole !== 'ADMIN') {
      const accessibleMatchIds = await this.getAccessibleMatchIds(userId);
      where.match_id = { in: accessibleMatchIds };
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: [
        { match_id: 'desc' },
        { clock_ms: 'asc' },
        { created_at: 'asc' }
      ],
      include: {
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    return transformEvents(events);
  }

  async getEventsByPlayer(playerId: string, userId: string, userRole: string): Promise<Event[]> {
    const where: any = {
      playerId,
      is_deleted: false
    };

    // Non-admin users can only see events from matches they can access
    if (userRole !== 'ADMIN') {
      const accessibleMatchIds = await this.getAccessibleMatchIds(userId);
      where.match_id = { in: accessibleMatchIds };
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: [
        { match_id: 'desc' },
        { clock_ms: 'asc' },
        { created_at: 'asc' }
      ],
      include: {
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    return transformEvents(events);
  }

  async batchEvents(operations: BatchEventRequest, userId: string, userRole: string): Promise<BatchEventResult> {
    const result: BatchEventResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createEvent(createData, userId, userRole);
          result.created.success++;
        } catch (error: any) {
          result.created.failed++;
          result.created.errors.push({
            data: createData,
            error: error.message || 'Unknown error during creation'
          });
        }
      }
    }

    // Process updates
    if (operations.update && operations.update.length > 0) {
      for (const updateOp of operations.update) {
        try {
          const updated = await this.updateEvent(updateOp.id, updateOp.data, userId, userRole);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Event not found or access denied'
            });
          }
        } catch (error: any) {
          result.updated.failed++;
          result.updated.errors.push({
            id: updateOp.id,
            error: error.message || 'Unknown error during update'
          });
        }
      }
    }

    // Process deletes
    if (operations.delete && operations.delete.length > 0) {
      for (const deleteId of operations.delete) {
        try {
          const deleted = await this.deleteEvent(deleteId, userId, userRole);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Event not found or access denied'
            });
          }
        } catch (error: any) {
          result.deleted.failed++;
          result.deleted.errors.push({
            id: deleteId,
            error: error.message || 'Unknown error during deletion'
          });
        }
      }
    }

    return result;
  }

  private isCompleteEventData(data: EventUpdateRequest): boolean {
    // Check if we have the minimum required fields to create an event
    return !!(data.matchId && data.kind && data.teamId);
  }

  /**
   * Get all match IDs that a user can access (matches they created or involving their teams)
   */
  private async getAccessibleMatchIds(userId: string): Promise<string[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        is_deleted: false,
        created_by_user_id: userId, // Matches they created
      },
      select: { match_id: true }
    });

    return matches.map(match => match.match_id);
  }

  /**
   * Check if user can modify a specific match (only match creator)
   */
  private async canUserModifyMatch(matchId: string, userId: string): Promise<boolean> {
    const match = await this.prisma.match.findFirst({
      where: {
        match_id: matchId,
        created_by_user_id: userId,
        is_deleted: false
      }
    });

    return !!match;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
