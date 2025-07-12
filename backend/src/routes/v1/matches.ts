import { Router } from 'express';
import { MatchService } from '../../services/MatchService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { matchCreateSchema, matchUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const matchService = new MatchService();

// GET /api/v1/matches - List matches with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, seasonId, teamId, competition } = req.query;
  
  const result = await matchService.getMatches({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    seasonId: seasonId as string,
    teamId: teamId as string,
    competition: competition as string
  });
  
  return res.json(result);
}));

// POST /api/v1/matches - Create new match
router.post('/', 
  validateRequest(matchCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const match = await matchService.createMatch(req.body);
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
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const match = await matchService.getMatchById(req.params['id']!);
  
  if (!match) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(match);
}));

// PUT /api/v1/matches/:id - Update match
router.put('/:id',
  validateRequest(matchUpdateSchema),
  asyncHandler(async (req, res) => {
    const match = await matchService.updateMatch(req.params['id']!, req.body);
    
    if (!match) {
      return res.status(404).json({
        error: 'Match not found',
        message: `Match with ID ${req.params['id']} does not exist`
      });
    }
    
    return res.json(match);
  })
);

// DELETE /api/v1/matches/:id - Delete match
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await matchService.deleteMatch(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/matches/team/:teamId - Get matches for a specific team
router.get('/team/:teamId', validateUUID('teamId'), asyncHandler(async (req, res) => {
  const matches = await matchService.getMatchesByTeam(req.params['teamId']!);
  return res.json(matches);
}));

// GET /api/v1/matches/season/:seasonId - Get matches for a specific season
router.get('/season/:seasonId', validateUUID('seasonId'), asyncHandler(async (req, res) => {
  const matches = await matchService.getMatchesBySeason(req.params['seasonId']!);
  return res.json(matches);
}));

export default router;