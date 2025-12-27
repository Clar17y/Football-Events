import { Router } from 'express';
import { EventService } from '../../services/EventService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { authenticateViewerOrUser } from '../../middleware/viewerAuth';
import { requireMatchCreator } from '../../middleware/matchCreator';
import { 
  eventCreateSchema, 
  eventUpdateSchema, 
  eventBatchSchema,
  eventBatchByMatchSchema
} from '../../validation/schemas';

const router = Router();
const eventService = new EventService();

// GET /api/v1/events - List events with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const { matchId, seasonId, playerId, teamId, kind } = req.query;

  const options = {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 25,
    search: search as string,
    matchId: matchId as string,
    seasonId: seasonId as string,
    playerId: playerId as string,
    teamId: teamId as string,
    kind: kind as string
  };

  const result = await eventService.getEvents(req.user!.id, req.user!.role, options);
  res.json(result);
}));

// POST /api/v1/events - Create new event
router.post('/', authenticateToken, validateRequest(eventCreateSchema), asyncHandler(async (req, res) => {
  const event = await eventService.createEvent(req.body, req.user!.id, req.user!.role);
  res.status(201).json(event);
}));

// GET /api/v1/events/:id - Get event by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const event = await eventService.getEventById(req.params['id']!, req.user!.id, req.user!.role);
  
  if (!event) {
    return res.status(404).json({
      error: 'Event not found',
      message: `No event found with ID: ${req.params['id']} or access denied`
    });
  }
  
  return res.json(event);
}));

// PUT /api/v1/events/:id - Update event (with upsert capability)
router.put('/:id', authenticateToken, validateUUID(), validateRequest(eventUpdateSchema), asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(req.params['id']!, req.body, req.user!.id, req.user!.role);
  
  if (!event) {
    return res.status(404).json({
      error: 'Event not found',
      message: `No event found with ID: ${req.params['id']}, access denied, or insufficient data provided for creation`
    });
  }
  
  return res.json(event);
}));

// DELETE /api/v1/events/:id - Delete event (soft delete)
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const deleted = await eventService.deleteEvent(req.params['id']!, req.user!.id, req.user!.role);
  
  if (!deleted) {
    return res.status(404).json({
      error: 'Event not found',
      message: `No event found with ID: ${req.params['id']} or access denied`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/events/match/:matchId - Get events for specific match
router.get('/match/:matchId', authenticateViewerOrUser('matchId'), validateUUID('matchId'), requireMatchCreator('matchId'), asyncHandler(async (req, res) => {
  // If viewer token present, return sanitized events without requiring user context
  if (req.viewer?.matchId) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const matchId = req.params['matchId']!;
    const match = await prisma.match.findUnique({
      where: { match_id: matchId },
      select: {
        home_team_id: true,
        away_team_id: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      }
    });
    const raw = await prisma.event.findMany({
      where: { match_id: matchId, is_deleted: false },
      orderBy: [{ clock_ms: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        kind: true,
        team_id: true,
        player_id: true,
        period_number: true,
        clock_ms: true,
        sentiment: true,
        created_at: true,
      }
    });
    const periods = await prisma.match_periods.findMany({
      where: { match_id: matchId, is_deleted: false },
      select: { period_type: true, started_at: true, ended_at: true }
    });
    const uniquePlayerIds = Array.from(new Set(raw.map(e => e.player_id).filter(Boolean))) as string[];
    const players = uniquePlayerIds.length > 0 ? await prisma.player.findMany({ where: { id: { in: uniquePlayerIds } }, select: { id: true, name: true } }) : [];
    const playerMap = new Map(players.map(p => [p.id, p.name]));
    const events = raw.map(e => {
      // infer periodType by timestamps
      let periodType: string | undefined = undefined;
      const t = e.created_at ? e.created_at.getTime() : undefined;
      if (t != null) {
        for (const p of periods) {
          const start = p.started_at ? p.started_at.getTime() : undefined;
          const end = p.ended_at ? p.ended_at.getTime() : undefined;
          if (start != null && t >= start && (end == null || t <= end)) {
            periodType = p.period_type as any;
            break;
          }
        }
      }
      return ({
        id: e.id,
        kind: e.kind,
        teamId: e.team_id,
        teamName: e.team_id ? (e.team_id === match?.home_team_id ? match?.homeTeam?.name : e.team_id === match?.away_team_id ? match?.awayTeam?.name : undefined) : undefined,
        playerId: e.player_id,
        playerName: e.player_id ? (playerMap.get(e.player_id) || undefined) : undefined,
        periodNumber: e.period_number,
        periodType,
        clockMs: e.clock_ms ?? 0,
        sentiment: e.sentiment ?? 0,
        createdAt: e.created_at?.toISOString?.() || null,
      });
    });
    return res.json({ events });
  }
  // Authenticated user path
  const events = await eventService.getEventsByMatch(req.params['matchId']!, req.user!.id, req.user!.role);
  return res.json(events);
}));

// GET /api/v1/events/season/:seasonId - Get events for specific season
router.get('/season/:seasonId', authenticateToken, validateUUID('seasonId'), asyncHandler(async (req, res) => {
  const events = await eventService.getEventsBySeason(req.params['seasonId']!, req.user!.id, req.user!.role);
  return res.json(events);
}));

// GET /api/v1/events/player/:playerId - Get events for specific player
router.get('/player/:playerId', authenticateToken, validateUUID('playerId'), asyncHandler(async (req, res) => {
  const events = await eventService.getEventsByPlayer(req.params['playerId']!, req.user!.id, req.user!.role);
  return res.json(events);
}));

// POST /api/v1/events/batch - Batch operations for events
router.post('/batch', authenticateToken, validateRequest(eventBatchSchema), asyncHandler(async (req, res) => {
  const result = await eventService.batchEvents(req.body, req.user!.id, req.user!.role);
  
  // Determine appropriate status code based on results
  const hasFailures = result.created.failed > 0 || result.updated.failed > 0 || result.deleted.failed > 0;
  const hasSuccesses = result.created.success > 0 || result.updated.success > 0 || result.deleted.success > 0;
  
  let statusCode = 200;
  if (!hasSuccesses && hasFailures) {
    statusCode = 400; // All operations failed
  } else if (hasSuccesses && hasFailures) {
    statusCode = 207; // Partial success (Multi-Status)
  } else if (hasSuccesses && !hasFailures) {
    statusCode = 200; // All operations succeeded
  }
  
  res.status(statusCode).json({
    results: result,
    summary: {
      totalOperations: (req.body.create?.length || 0) + (req.body.update?.length || 0) + (req.body.delete?.length || 0),
      totalSuccess: result.created.success + result.updated.success + result.deleted.success,
      totalFailed: result.created.failed + result.updated.failed + result.deleted.failed
    }
  });
}));

// POST /api/v1/events/batch-by-match - Match-scoped batch operations for events
router.post('/batch-by-match', authenticateToken, validateRequest(eventBatchByMatchSchema), asyncHandler(async (req, res) => {
  const { matchId, ...operations } = req.body;

  const result = await eventService.batchEvents(operations, req.user!.id, req.user!.role);
  
  // Determine appropriate status code based on results
  const hasFailures = result.created.failed > 0 || result.updated.failed > 0 || result.deleted.failed > 0;
  const hasSuccesses = result.created.success > 0 || result.updated.success > 0 || result.deleted.success > 0;
  
  let statusCode = 200;
  if (!hasSuccesses && hasFailures) {
    statusCode = 400; // All operations failed
  } else if (hasSuccesses && hasFailures) {
    statusCode = 207; // Partial success (Multi-Status)
  } else if (hasSuccesses && !hasFailures) {
    statusCode = 200; // All operations succeeded
  }
  
  return res.status(statusCode).json({
    results: result,
    summary: {
      totalOperations: (operations.create?.length || 0) + (operations.update?.length || 0) + (operations.delete?.length || 0),
      totalSuccess: result.created.success + result.updated.success + result.deleted.success,
      totalFailed: result.created.failed + result.updated.failed + result.deleted.failed,
      matchId
    }
  });
}));

export default router;
