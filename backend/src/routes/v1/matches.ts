import { Router } from 'express';
import { MatchService } from '../../services/MatchService';
import { MatchStateService } from '../../services/MatchStateService';
import { MatchPeriodsService } from '../../services/MatchPeriodsService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { matchCreateSchema, matchUpdateSchema, matchQuickStartSchema, matchCancelSchema, periodStartSchema, periodEndSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const matchService = new MatchService();
const matchStateService = new MatchStateService();
const matchPeriodsService = new MatchPeriodsService();

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

// === MATCH STATE MANAGEMENT ENDPOINTS ===

// POST /api/v1/matches/:id/start - Start a match
router.post('/:id/start', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchState = await matchStateService.startMatch(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// POST /api/v1/matches/:id/pause - Pause a live match
router.post('/:id/pause', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchState = await matchStateService.pauseMatch(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// POST /api/v1/matches/:id/resume - Resume a paused match
router.post('/:id/resume', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchState = await matchStateService.resumeMatch(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// POST /api/v1/matches/:id/complete - Complete a match
router.post('/:id/complete', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchState = await matchStateService.completeMatch(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// POST /api/v1/matches/:id/cancel - Cancel a match
router.post('/:id/cancel', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(matchCancelSchema),
  asyncHandler(async (req, res) => {
  try {
    const { reason = 'No reason provided' } = req.body;
    
    const matchState = await matchStateService.cancelMatch(
      req.params['id']!,
      reason,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// GET /api/v1/matches/:id/state - Get current match state
router.get('/:id/state', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchState = await matchStateService.getCurrentState(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    if (!matchState) {
      return res.status(404).json({
        success: false,
        error: 'Match state not found',
        message: `Match state for ID ${req.params['id']} does not exist or access denied`
      });
    }
    
    return res.status(200).json({
      success: true,
      data: matchState
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// === MATCH PERIODS MANAGEMENT ENDPOINTS ===

// POST /api/v1/matches/:id/periods/start - Start a new period
router.post('/:id/periods/start', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(periodStartSchema),
  asyncHandler(async (req, res) => {
  try {
    const { periodType = 'regular' } = req.body;
    
    const period = await matchPeriodsService.startPeriod(
      req.params['id']!,
      periodType,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(201).json({
      success: true,
      data: period
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// POST /api/v1/matches/:id/periods/:periodId/end - End a period
router.post('/:id/periods/:periodId/end', 
  authenticateToken, 
  validateUUID(), 
  validateUUID('periodId'),
  validateRequest(periodEndSchema),
  asyncHandler(async (req, res) => {
  try {
    const period = await matchPeriodsService.endPeriod(
      req.params['id']!,
      req.params['periodId']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: period
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
        error: apiError.error,
        message: apiError.message,
        field: apiError.field,
        constraint: apiError.constraint
      });
    }
    throw error;
  }
}));

// GET /api/v1/matches/:id/periods - Get all periods for a match
router.get('/:id/periods', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const periods = await matchPeriodsService.getMatchPeriods(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: periods
    });
  } catch (error: any) {
    const apiError = extractApiError(error);
    if (apiError) {
      return res.status(apiError.statusCode).json({
        success: false,
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