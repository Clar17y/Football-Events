import { Router } from 'express';
import { MatchService } from '../../services/MatchService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { matchCreateSchema, matchUpdateSchema, matchQuickStartSchema } from '../../validation/schemas';
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

// GET /api/v1/matches/upcoming - Get upcoming matches
router.get('/upcoming', authenticateToken, asyncHandler(async (req, res) => {
  const { limit = 10, teamId } = req.query;
  const matches = await matchService.getUpcomingMatches(
    req.user!.id,
    req.user!.role,
    {
      limit: parseInt(limit as string),
      teamId: teamId as string
    }
  );
  return res.json(matches);
}));

// POST /api/v1/matches/quick-start - Quick start match creation
router.post('/quick-start',
  authenticateToken,
  validateRequest(matchQuickStartSchema),
  asyncHandler(async (req, res) => {
    try {
      // Resolve current season if not provided
      const payload = { ...req.body } as any;
      if (!payload.seasonId) {
        // Defer to service to determine current season
      }
      const match = await matchService.createQuickStartMatch(payload, req.user!.id, req.user!.role);
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
      throw error;
    }
  })
);

// GET /api/v1/matches/recent - Get recent matches
router.get('/recent', authenticateToken, asyncHandler(async (req, res) => {
  const { limit = 10, teamId } = req.query;
  const matches = await matchService.getRecentMatches(
    req.user!.id,
    req.user!.role,
    {
      limit: parseInt(limit as string),
      teamId: teamId as string
    }
  );
  return res.json(matches);
}));

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

// GET /api/v1/matches/:id/full-details - Get match with all related data
router.get('/:id/full-details', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const matchDetails = await matchService.getMatchFullDetails(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!matchDetails) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(matchDetails);
}));

// GET /api/v1/matches/:id/timeline - Get match timeline with events
router.get('/:id/timeline', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const timeline = await matchService.getMatchTimeline(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!timeline) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(timeline);
}));

// GET /api/v1/matches/:id/live-state - Get live match state for real-time console
router.get('/:id/live-state', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const liveState = await matchService.getMatchLiveState(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!liveState) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(liveState);
}));

// POST /api/v1/matches/:id/quick-event - Quick event creation for live matches
router.post('/:id/quick-event', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const event = await matchService.createQuickEvent(
    req.params['id']!,
    req.body,
    req.user!.id,
    req.user!.role
  );
  
  if (!event) {
    return res.status(404).json({
      error: 'Match not found',
      message: `Match with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(201).json(event);
}));

export default router;