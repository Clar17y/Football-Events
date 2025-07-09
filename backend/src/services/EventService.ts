import { PrismaClient } from '@prisma/client';
import { 
  transformEvent, 
  transformEventCreateRequest, 
  transformEvents,
  safeTransformEvent
} from '@shared/types';
import type { 
  Event, 
  EventCreateRequest,
  EventUpdateRequest
} from '@shared/types';

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

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getEvents(options: GetEventsOptions): Promise<PaginatedEvents> {
    const { page, limit, search, matchId, seasonId, playerId, teamId, kind } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
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
      where.matchId = matchId;
    }
    
    if (seasonId) {
      where.season_id = seasonId;
    }
    
    if (playerId) {
      where.playerId = playerId;
    }
    
    if (teamId) {
      where.teamId = teamId;
    }
    
    if (kind) {
      where.kind = kind;
    }

    // Get events and total count
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { matchId: 'desc' },
          { clockMs: 'asc' },
          { created_at: 'asc' }
        ]
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

  async getEventById(id: string): Promise<Event | null> {
    const event = await this.prisma.event.findUnique({
      where: { id }
    });

    return safeTransformEvent(event);
  }

  async createEvent(data: EventCreateRequest): Promise<Event> {
    const prismaInput = transformEventCreateRequest(data);
    const event = await this.prisma.event.create({
      data: prismaInput
    });

    return transformEvent(event);
  }

  async updateEvent(id: string, data: EventUpdateRequest): Promise<Event | null> {
    try {
      // Handle upsert logic - if event doesn't exist, create it
      const existingEvent = await this.prisma.event.findUnique({
        where: { id }
      });

      if (!existingEvent) {
        // For upsert, we need the full data to create
        if (this.isCompleteEventData(data)) {
          const createData = { id, ...data } as EventCreateRequest;
          return await this.createEvent(createData);
        } else {
          return null; // Cannot create with partial data
        }
      }

      // Update existing event
      const prismaInput: any = {};
      
      if (data.kind !== undefined) prismaInput.kind = data.kind;
      if (data.teamId !== undefined) prismaInput.teamId = data.teamId;
      if (data.playerId !== undefined) prismaInput.playerId = data.playerId;
      if (data.periodNumber !== undefined) prismaInput.period_number = data.periodNumber;
      if (data.clockMs !== undefined) prismaInput.clockMs = data.clockMs;
      if (data.notes !== undefined) prismaInput.notes = data.notes;
      if (data.sentiment !== undefined) prismaInput.sentiment = data.sentiment;
      
      // Always update the updated_at timestamp
      prismaInput.updated_at = new Date();

      const event = await this.prisma.event.update({
        where: { id },
        data: prismaInput
      });

      return transformEvent(event);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Event not found
      }
      throw error;
    }
  }

  async deleteEvent(id: string): Promise<boolean> {
    try {
      await this.prisma.event.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Event not found
      }
      throw error;
    }
  }

  async getEventsByMatch(matchId: string): Promise<Event[]> {
    const events = await this.prisma.event.findMany({
      where: { matchId },
      orderBy: [
        { clockMs: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformEvents(events);
  }

  async getEventsBySeason(seasonId: string): Promise<Event[]> {
    const events = await this.prisma.event.findMany({
      where: { season_id: seasonId },
      orderBy: [
        { matchId: 'desc' },
        { clockMs: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformEvents(events);
  }

  async getEventsByPlayer(playerId: string): Promise<Event[]> {
    const events = await this.prisma.event.findMany({
      where: { playerId },
      orderBy: [
        { matchId: 'desc' },
        { clockMs: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformEvents(events);
  }

  async batchEvents(operations: BatchEventRequest): Promise<BatchEventResult> {
    const result: BatchEventResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createEvent(createData);
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
          const updated = await this.updateEvent(updateOp.id, updateOp.data);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Event not found'
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
          const deleted = await this.deleteEvent(deleteId);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Event not found'
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
    return !!(data.matchId && data.seasonId && data.kind);
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}