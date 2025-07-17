import { Router } from 'express';
import { EventService } from '../../services/EventService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { 
  eventCreateSchema, 
  eventUpdateSchema, 
  eventBatchSchema
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
router.get('/match/:matchId', authenticateToken, validateUUID('matchId'), asyncHandler(async (req, res) => {
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

export default router;