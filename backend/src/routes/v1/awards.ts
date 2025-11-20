import { Router } from 'express';
import { AwardsService } from '../../services/AwardsService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { awardCreateSchema, awardUpdateSchema, matchAwardCreateSchema, matchAwardUpdateSchema, awardBatchSchema, matchAwardBatchSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const awardsService = new AwardsService();

// Match Awards Routes - Use different path to avoid conflict with /:id

// POST /api/v1/awards/match-awards - Create new match award
router.post('/match-awards',
  authenticateToken,
  validateRequest(matchAwardCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const matchAward = await awardsService.createMatchAward(req.body, req.user!.id, req.user!.role);
      return res.status(201).json(matchAward);
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

// GET /api/v1/awards/match-awards - List match awards with pagination and filtering
router.get('/match-awards', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, playerId, category } = req.query;
  
  const result = await awardsService.getMatchAwards(
    req.user!.id,
    req.user!.role,
    {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      playerId: playerId as string,
      category: category as string
    }
  );
  
  return res.json(result);
}));

// GET /api/v1/awards/match-awards/:matchId/list - Get all awards for a specific match
router.get('/match-awards/:matchId/list', authenticateToken, validateUUID('matchId'), asyncHandler(async (req, res) => {
  const matchAwards = await awardsService.getMatchAwardsByMatch(
    req.params['matchId']!,
    req.user!.id,
    req.user!.role
  );
  return res.json(matchAwards);
}));

// GET /api/v1/awards/match-awards/:id - Get match award by ID
router.get('/match-awards/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const matchAward = await awardsService.getMatchAwardById(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!matchAward) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(matchAward);
}));

// PUT /api/v1/awards/match-awards/:id - Update match award
router.put('/match-awards/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(matchAwardUpdateSchema),
  asyncHandler(async (req, res) => {
  const matchAward = await awardsService.updateMatchAward(
    req.params['id']!,
    req.body,
    req.user!.id,
    req.user!.role
  );
  
  if (!matchAward) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(matchAward);
}));

// DELETE /api/v1/awards/match-awards/:id - Delete match award
router.delete('/match-awards/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const success = await awardsService.deleteMatchAward(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!success) {
    return res.status(404).json({
      error: 'Match award not found',
      message: `Match award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(204).send();
}));

// POST /api/v1/awards/match-awards/batch - Batch operations for match awards
router.post('/match-awards/batch', authenticateToken, validateRequest(matchAwardBatchSchema), asyncHandler(async (req, res) => {
  const result = await awardsService.batchMatchAwards(req.body, req.user!.id, req.user!.role);
  
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

// Season Awards Routes

// GET /api/v1/awards - List season awards with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, seasonId, playerId, category } = req.query;
  
  const result = await awardsService.getAwards(
    req.user!.id,
    req.user!.role,
    {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      seasonId: seasonId as string,
      playerId: playerId as string,
      category: category as string
    }
  );
  
  return res.json(result);
}));

// POST /api/v1/awards - Create new season award
router.post('/', 
  authenticateToken,
  validateRequest(awardCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const award = await awardsService.createAward(req.body, req.user!.id, req.user!.role);
      return res.status(201).json(award);
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

// GET /api/v1/awards/:id - Get season award by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const award = await awardsService.getAwardById(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!award) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(award);
}));

// PUT /api/v1/awards/:id - Update season award
router.put('/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(awardUpdateSchema),
  asyncHandler(async (req, res) => {
  const award = await awardsService.updateAward(
    req.params['id']!,
    req.body,
    req.user!.id,
    req.user!.role
  );
  
  if (!award) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(award);
}));

// DELETE /api/v1/awards/:id - Delete season award
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const success = await awardsService.deleteAward(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!success) {
    return res.status(404).json({
      error: 'Award not found',
      message: `Award with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(204).send();
}));

// POST /api/v1/awards/batch - Batch operations for season awards
router.post('/batch', authenticateToken, validateRequest(awardBatchSchema), asyncHandler(async (req, res) => {
  const result = await awardsService.batchAwards(req.body, req.user!.id, req.user!.role);
  
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

// Helper Routes

// GET /api/v1/awards/player/:playerId - Get all awards for a specific player
router.get('/player/:playerId', authenticateToken, validateUUID('playerId'), asyncHandler(async (req, res) => {
  const [seasonAwards, matchAwards] = await Promise.all([
    awardsService.getAwardsByPlayer(req.params['playerId']!, req.user!.id, req.user!.role),
    awardsService.getMatchAwardsByPlayer(req.params['playerId']!, req.user!.id, req.user!.role)
  ]);
  
  return res.json({
    seasonAwards,
    matchAwards
  });
}));

// GET /api/v1/awards/season/:seasonId - Get all awards for a specific season
router.get('/season/:seasonId', authenticateToken, validateUUID('seasonId'), asyncHandler(async (req, res) => {
  const awards = await awardsService.getAwardsBySeason(req.params['seasonId']!, req.user!.id, req.user!.role);
  return res.json(awards);
}));

// This route has been moved above to fix route conflicts

export default router;
