import { Router } from 'express';
import { PlayerService } from '../../services/PlayerService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { playerCreateSchema, playerUpdateSchema, playerBatchSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const playerService = new PlayerService();

// GET /api/v1/players - List players with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, teamId, teamIds, noTeam, position } = req.query;
  
  const parsedTeamIds = typeof teamIds === 'string' ? (teamIds as string).split(',').filter(Boolean) : [];
  const parsedNoTeam = typeof noTeam === 'string' ? (noTeam as string) === 'true' : false;
  
  const result = await playerService.getPlayers(
    req.user!.id,
    req.user!.role,
    {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      teamId: teamId as string,
      teamIds: parsedTeamIds.length > 0 ? parsedTeamIds : [],
      noTeam: parsedNoTeam,
      position: position as string
    }
  );
  
  return res.json(result);
}));

// POST /api/v1/players - Create new player
router.post('/', 
  authenticateToken,
  validateRequest(playerCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const player = await playerService.createPlayer(req.body, req.user!.id, req.user!.role);
      return res.status(201).json(player);
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
  })
);

// GET /api/v1/players/:id - Get player by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const player = await playerService.getPlayerById(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!player) {
    return res.status(404).json({
      error: 'Player not found',
      message: `Player with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(player);
}));

// PUT /api/v1/players/:id - Update player
router.put('/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(playerUpdateSchema),
  asyncHandler(async (req, res) => {
    const player = await playerService.updatePlayer(
      req.params['id']!,
      req.body,
      req.user!.id,
      req.user!.role
    );
    
    if (!player) {
      return res.status(404).json({
        error: 'Player not found',
        message: `Player with ID ${req.params['id']} does not exist or access denied`
      });
    }
    
    return res.json(player);
  })
);

// DELETE /api/v1/players/:id - Delete player (soft delete)
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const success = await playerService.deletePlayer(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!success) {
    return res.status(404).json({
      error: 'Player not found',
      message: `Player with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(204).send();
}));

// POST /api/v1/players/batch - Batch operations for players
router.post('/batch', authenticateToken, validateRequest(playerBatchSchema), asyncHandler(async (req, res) => {
  const result = await playerService.batchPlayers(req.body, req.user!.id, req.user!.role);
  
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

// GET /api/v1/players/:id/season-stats - Get player statistics for a season
router.get('/:id/season-stats', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const { seasonId } = req.query;
  
  if (!seasonId) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'seasonId query parameter is required'
    });
  }
  
  const stats = await playerService.getPlayerSeasonStats(
    req.params['id']!,
    seasonId as string,
    req.user!.id,
    req.user!.role
  );
  
  if (!stats) {
    return res.status(404).json({
      error: 'Player not found',
      message: `Player with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(stats);
}));

export default router;