import { Router } from 'express';
import { LineupService } from '../../services/LineupService';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import {
  lineupCreateSchema,
  lineupUpdateSchema,
  lineupBatchSchema,
  lineupBatchByMatchSchema,
  lineupSubstitutionSchema
} from '../../validation/schemas';

const router = Router();
const lineupService = new LineupService();

// GET /api/v1/lineups - List lineups with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const { matchId, playerId, position } = req.query;

  const options = {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 25,
    search: search as string,
    matchId: matchId as string,
    playerId: playerId as string,
    position: position as string
  };

  const result = await lineupService.getLineups(req.user!.id, req.user!.role, options);
  res.json(result);
}));

// POST /api/v1/lineups - Create new lineup
router.post('/', authenticateToken, validateRequest(lineupCreateSchema), asyncHandler(async (req, res) => {
  try {
    const lineup = await lineupService.createLineup(req.body, req.user!.id, req.user!.role);
    return res.status(201).json(lineup);
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error; // Re-throw if not a handled API error
  }
}));

// GET /api/v1/lineups/:id - Get lineup by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const lineup = await lineupService.getLineupById(req.params['id']!, req.user!.id, req.user!.role);

  if (!lineup) {
    return res.status(404).json({
      error: 'Lineup not found',
      message: `No lineup found with ID: ${req.params['id']} or access denied`
    });
  }

  return res.json(lineup);
}));

// GET /api/v1/lineups/by-key/:matchId/:playerId/:startMinute - Get lineup by composite key (backward compatibility)
router.get('/by-key/:matchId/:playerId/:startMinute',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const matchId = req.params['matchId']!;
    const playerId = req.params['playerId']!;
    const startMinute = req.params['startMinute']!;
    const startMin = parseFloat(startMinute);

    if (isNaN(startMin)) {
      return res.status(400).json({
        error: 'Invalid start minute',
        message: 'Start minute must be a valid number'
      });
    }

    const lineup = await lineupService.getLineupByKey(matchId, playerId, startMin, req.user!.id, req.user!.role);

    if (!lineup) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found for match ${matchId}, player ${playerId}, start minute ${startMin}`
      });
    }

    return res.json(lineup);
  })
);

// PUT /api/v1/lineups/:id - Update lineup
router.put('/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(lineupUpdateSchema),
  asyncHandler(async (req, res) => {
    const lineup = await lineupService.updateLineup(req.params['id']!, req.body, req.user!.id, req.user!.role);

    if (!lineup) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found with ID: ${req.params['id']} or access denied`
      });
    }

    return res.json(lineup);
  })
);

// PUT /api/v1/lineups/by-key/:matchId/:playerId/:startMinute - Update lineup by composite key (with upsert capability)
router.put('/by-key/:matchId/:playerId/:startMinute',
  authenticateToken,
  validateRequest(lineupUpdateSchema),
  asyncHandler(async (req, res) => {
    const matchId = req.params['matchId']!;
    const playerId = req.params['playerId']!;
    const startMinute = req.params['startMinute']!;
    const startMin = parseFloat(startMinute);

    if (isNaN(startMin)) {
      return res.status(400).json({
        error: 'Invalid start minute',
        message: 'Start minute must be a valid number'
      });
    }

    const lineup = await lineupService.updateLineupByKey(matchId, playerId, startMin, req.body, req.user!.id, req.user!.role);

    if (!lineup) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found for match ${matchId}, player ${playerId}, start minute ${startMin}, and insufficient data provided for creation`
      });
    }

    return res.json(lineup);
  })
);

// DELETE /api/v1/lineups/:id - Delete lineup
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const deleted = await lineupService.deleteLineup(req.params['id']!, req.user!.id, req.user!.role);

  if (!deleted) {
    return res.status(404).json({
      error: 'Lineup not found',
      message: `No lineup found with ID: ${req.params['id']} or access denied`
    });
  }

  return res.status(204).send();
}));

// DELETE /api/v1/lineups/by-key/:matchId/:playerId/:startMinute - Delete lineup by composite key
router.delete('/by-key/:matchId/:playerId/:startMinute',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const matchId = req.params['matchId']!;
    const playerId = req.params['playerId']!;
    const startMinute = req.params['startMinute']!;
    const startMin = parseFloat(startMinute);

    if (isNaN(startMin)) {
      return res.status(400).json({
        error: 'Invalid start minute',
        message: 'Start minute must be a valid number'
      });
    }

    const deleted = await lineupService.deleteLineupByKey(matchId, playerId, startMin, req.user!.id, req.user!.role);

    if (!deleted) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found for match ${matchId}, player ${playerId}, start minute ${startMin}`
      });
    }

    return res.status(204).send();
  })
);

// GET /api/v1/lineups/match/:matchId - Get lineups for specific match
router.get('/match/:matchId', authenticateToken, validateUUID('matchId'), asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByMatch(req.params['matchId']!, req.user!.id, req.user!.role);
  return res.json(lineups);
}));

// GET /api/v1/lineups/player/:playerId - Get lineups for specific player
router.get('/player/:playerId', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByPlayer(req.params['playerId']!, req.user!.id, req.user!.role);
  return res.json(lineups);
}));

// GET /api/v1/lineups/position/:position - Get lineups for specific position
router.get('/position/:position', authenticateToken, asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByPosition(req.params['position']!, req.user!.id, req.user!.role);
  return res.json(lineups);
}));

// POST /api/v1/lineups/batch - Batch operations for lineups
router.post('/batch', authenticateToken, validateRequest(lineupBatchSchema), asyncHandler(async (req, res) => {
  const result = await lineupService.batchLineups(req.body, req.user!.id, req.user!.role);

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

// POST /api/v1/lineups/batch-by-match - Match-scoped batch operations for lineups
router.post('/batch-by-match', authenticateToken, validateRequest(lineupBatchByMatchSchema), asyncHandler(async (req, res) => {
  const { matchId, ...operations } = req.body;

  const result = await lineupService.batchLineups(operations, req.user!.id, req.user!.role);

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

// GET /api/v1/lineups/match/:matchId/current - Get current lineup for a match
router.get('/match/:matchId/current', authenticateToken, validateUUID('matchId'), asyncHandler(async (req, res) => {
  const { currentTime } = req.query;
  const currentTimeMinutes = currentTime ? parseFloat(currentTime as string) : 0;

  if (currentTime && isNaN(currentTimeMinutes)) {
    return res.status(400).json({
      error: 'Invalid current time',
      message: 'Current time must be a valid number'
    });
  }

  const currentLineup = await lineupService.getCurrentLineup(
    req.params['matchId']!,
    currentTimeMinutes,
    req.user!.id,
    req.user!.role
  );

  return res.json(currentLineup);
}));

// GET /api/v1/lineups/match/:matchId/active-at/:timeMinutes - Get active players at specific time
router.get('/match/:matchId/active-at/:timeMinutes', authenticateToken, validateUUID('matchId'), asyncHandler(async (req, res) => {
  const timeMinutes = parseFloat(req.params['timeMinutes']!);

  if (isNaN(timeMinutes)) {
    return res.status(400).json({
      error: 'Invalid time',
      message: 'Time must be a valid number'
    });
  }

  const activePlayers = await lineupService.getActivePlayersAtTime(
    req.params['matchId']!,
    timeMinutes,
    req.user!.id,
    req.user!.role
  );

  return res.json(activePlayers);
}));

// POST /api/v1/lineups/match/:matchId/substitute - Make a substitution
router.post('/match/:matchId/substitute', authenticateToken, validateUUID('matchId'), validateRequest(lineupSubstitutionSchema), asyncHandler(async (req, res) => {
  const { playerOffId, playerOnId, position, currentTime, substitutionReason } = req.body;

  try {
    const substitutionResult = await lineupService.makeSubstitution(
      req.params['matchId']!,
      playerOffId,
      playerOnId,
      position,
      currentTime,
      req.user!.id,
      req.user!.role,
      substitutionReason
    );

    return res.status(201).json(substitutionResult);
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

export default router;
