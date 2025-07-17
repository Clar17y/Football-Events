import { Router } from 'express';
import { MatchService } from '../../services/MatchService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { matchCreateSchema, matchUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const matchService = new MatchService();

// GET /api/v1/matches - List matches with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, seasonId, teamId, competition } = req.query;
  
  const result = await matchService.getMatches(
    req.user!.id,
    req.user!.role,
    {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      seasonId: seasonId as string,
      teamId: teamId as string,
      competition: competition as string
    }
  );
  
  return res.json(result);
}));

// POST /api/v1/matches - Create new match
router.post('/', 
  authenticateToken,
  validateRequest(matchCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const match = await matchService.createMatch(req.body, req.user!.id, req.user!.role);
      return res.status(201).json(match);
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

// GET /api/v1/matches/:id - Get match by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const match = await matchService.getMatchById(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!match) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(match);
}));

// PUT /api/v1/matches/:id - Update match
router.put('/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(matchUpdateSchema),
  asyncHandler(async (req, res) => {
    const match = await matchService.updateMatch(
      req.params['id']!,
      req.body,
      req.user!.id,
      req.user!.role
    );
    
    if (!match) {
      return res.status(404).json({
        error: 'Match not found',
        message: `Match with ID ${req.params['id']} does not exist or access denied`
      });
    }
    
    return res.json(match);
  })
);

// DELETE /api/v1/matches/:id - Delete match (soft delete)
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const success = await matchService.deleteMatch(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!success) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/matches/team/:teamId - Get matches for a specific team
router.get('/team/:teamId', authenticateToken, validateUUID('teamId'), asyncHandler(async (req, res) => {
  const matches = await matchService.getMatchesByTeam(
    req.params['teamId']!,
    req.user!.id,
    req.user!.role
  );
  return res.json(matches);
}));

// GET /api/v1/matches/season/:seasonId - Get matches for a specific season
router.get('/season/:seasonId', authenticateToken, validateUUID('seasonId'), asyncHandler(async (req, res) => {
  const matches = await matchService.getMatchesBySeason(
    req.params['seasonId']!,
    req.user!.id,
    req.user!.role
  );
  return res.json(matches);
}));

export default router;