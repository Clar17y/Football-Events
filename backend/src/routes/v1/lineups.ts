import { Router } from 'express';
import { LineupService } from '../../services/LineupService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { 
  lineupCreateSchema, 
  lineupUpdateSchema, 
  lineupBatchSchema
} from '../../validation/schemas';

const router = Router();
const lineupService = new LineupService();

// GET /api/v1/lineups - List lineups with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
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

  const result = await lineupService.getLineups(options);
  res.json(result);
}));

// POST /api/v1/lineups - Create new lineup
router.post('/', validateRequest(lineupCreateSchema), asyncHandler(async (req, res) => {
  const lineup = await lineupService.createLineup(req.body);
  res.status(201).json(lineup);
}));

// GET /api/v1/lineups/:matchId/:playerId/:startMinute - Get lineup by composite key
router.get('/:matchId/:playerId/:startMinute', 
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

    const lineup = await lineupService.getLineupByKey(matchId, playerId, startMin);
    
    if (!lineup) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found for match ${matchId}, player ${playerId}, start minute ${startMin}`
      });
    }
    
    return res.json(lineup);
  })
);

// PUT /api/v1/lineups/:matchId/:playerId/:startMinute - Update lineup (with upsert capability)
router.put('/:matchId/:playerId/:startMinute', 
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

    const lineup = await lineupService.updateLineup(matchId, playerId, startMin, req.body);
    
    if (!lineup) {
      return res.status(404).json({
        error: 'Lineup not found',
        message: `No lineup found for match ${matchId}, player ${playerId}, start minute ${startMin}, and insufficient data provided for creation`
      });
    }
    
    return res.json(lineup);
  })
);

// DELETE /api/v1/lineups/:matchId/:playerId/:startMinute - Delete lineup
router.delete('/:matchId/:playerId/:startMinute', 
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

    const deleted = await lineupService.deleteLineup(matchId, playerId, startMin);
    
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
router.get('/match/:matchId', validateUUID(), asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByMatch(req.params['matchId']!);
  return res.json(lineups);
}));

// GET /api/v1/lineups/player/:playerId - Get lineups for specific player
router.get('/player/:playerId', validateUUID(), asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByPlayer(req.params['playerId']!);
  return res.json(lineups);
}));

// GET /api/v1/lineups/position/:position - Get lineups for specific position
router.get('/position/:position', asyncHandler(async (req, res) => {
  const lineups = await lineupService.getLineupsByPosition(req.params['position']!);
  return res.json(lineups);
}));

// POST /api/v1/lineups/batch - Batch operations for lineups
router.post('/batch', validateRequest(lineupBatchSchema), asyncHandler(async (req, res) => {
  const result = await lineupService.batchLineups(req.body);
  
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