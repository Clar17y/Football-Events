import { Router } from 'express';
import { MatchService } from '../../services/MatchService';
import { MatchStateService } from '../../services/MatchStateService';
import { MatchPeriodsService } from '../../services/MatchPeriodsService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { authenticateViewerOrUser } from '../../middleware/viewerAuth';
import { requireMatchCreator } from '../../middleware/matchCreator';
import { signViewerToken } from '../../utils/viewerTokens';
import { generateShortCode } from '../../utils/code';
import { sseHub } from '../../utils/sse';
import { 
  matchCreateSchema, 
  matchUpdateSchema, 
  matchQuickStartSchema, 
  matchStartSchema,
  matchPauseSchema,
  matchResumeSchema,
  matchCompleteSchema,
  matchCancelSchema,
  matchPostponeSchema,
  periodStartSchema, 
  periodEndSchema,
  periodImportSchema
} from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';
import { LiveFormationService } from '../../services/LiveFormationService';

const router = Router();
const matchService = new MatchService();
const matchStateService = new MatchStateService();
const matchPeriodsService = new MatchPeriodsService();
const liveFormationService = new LiveFormationService();

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

// === MATCH STATUS QUERY ENDPOINTS (must be before /:id routes) ===

// GET /api/v1/matches/states - Get match states with pagination
router.get('/states', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const { page = '1', limit = '25', matchIds } = req.query as any;
    const idsArray = typeof matchIds === 'string' && matchIds.trim().length
      ? matchIds.split(',').map((s: string) => s.trim()).filter((s: string) => s.length)
      : [];
    const result = await matchStateService.getMatchStatuses(
      req.user!.id,
      req.user!.role,
      { page: parseInt(page), limit: parseInt(limit), matchIds: idsArray }
    );

    return res.status(200).json({ success: true, ...result });
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

// GET /api/v1/matches/live - Get all live matches
router.get('/live', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const liveMatches = await matchStateService.getLiveMatches(
      req.user!.id,
      req.user!.role
    );
    
    return res.status(200).json({
      success: true,
      data: liveMatches
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

// GET /api/v1/matches/:id/status - Get match status for display
router.get('/:id/status', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const matchStatus = await matchStateService.getMatchStatus(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    
    if (!matchStatus) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
        message: `Match with ID ${req.params['id']} does not exist or access denied`
      });
    }
    
    return res.status(200).json({
      success: true,
      data: matchStatus
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

// === FORMATION ENDPOINTS ===

// GET /api/v1/matches/:id/current-formation - Get active formation snapshot (or derived)
router.get('/:id/current-formation', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const data = await liveFormationService.getCurrentFormation(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  if (!data) return res.status(404).json({ error: 'Not found', message: 'Match not found or no formation available' });
  return res.json(data);
}));

// POST /api/v1/matches/:id/formation-changes - Apply formation change with dual-table transaction
router.post('/:id/formation-changes', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const { startMin, formation, reason, eventId } = req.body || {};
  if (typeof startMin !== 'number' || !formation || !Array.isArray(formation.players)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'startMin (number) and formation.players (array) are required'
    });
  }
  if (eventId != null) {
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (typeof eventId !== 'string' || !isUuid(eventId)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'eventId must be a valid UUID'
      });
    }
  }

  try {
    const result = await liveFormationService.applyFormationChange({
      matchId: req.params['id']!,
      startMin,
      formation,
      eventId,
      userId: req.user!.id,
      userRole: req.user!.role,
      reason
    });
    return res.status(201).json(result);
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
// Note: Starting a match will also automatically create the first
// regular period if no periods exist yet for the match.
router.post('/:id/start', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(matchStartSchema),
  asyncHandler(async (req, res) => {
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
router.post('/:id/pause', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(matchPauseSchema),
  asyncHandler(async (req, res) => {
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
router.post('/:id/resume', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(matchResumeSchema),
  asyncHandler(async (req, res) => {
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
router.post('/:id/complete', 
  authenticateToken, 
  validateUUID(), 
  validateRequest(matchCompleteSchema),
  asyncHandler(async (req, res) => {
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

// POST /api/v1/matches/:id/periods/import - Import a period with preserved timestamps (for guest data import)
router.post('/:id/periods/import',
  authenticateToken,
  validateUUID(),
  validateRequest(periodImportSchema),
  asyncHandler(async (req, res) => {
    try {
      const period = await matchPeriodsService.importPeriod(
        req.params['id']!,
        req.body,
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
  })
);

export default router;
// ===== Viewer Sharing & Public Read/SSE Endpoints =====

// POST /api/v1/matches/:id/share - Mint viewer token (auth required)
router.post('/:id/share', authenticateToken, validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const { expiresInMinutes } = req.body || {};
  const minutes = typeof expiresInMinutes === 'number' ? expiresInMinutes : 480;
  const matchId = req.params['id']!;
  const { token, expiresAt } = signViewerToken(matchId, minutes);

  // Create or mint a short code
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const expiresAtDate = new Date(expiresAt);
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = generateShortCode(10);
    const exists = await prisma.viewer_links.findFirst({ where: { code } });
    if (!exists) break;
  }
  if (!code) {
    // Fallback if collision persists
    code = `${generateShortCode(6)}${Date.now().toString(36).slice(-4)}`;
  }
  await prisma.viewer_links.create({
    data: {
      code,
      match_id: matchId,
      expires_at: expiresAtDate,
      created_by_user_id: req.user!.id,
    }
  });

  // Build absolute frontend URL for sharing
  const envBase = process.env.FRONTEND_URL && String(process.env.FRONTEND_URL);
  const origin = req.get('origin');
  const hostBase = `${req.protocol}://${req.get('host')}`; // final fallback (API host)
  const base = (envBase || origin || hostBase).replace(/\/$/, '');
  const shareUrl = `${base}/live/${matchId}?code=${code}`;

  return res.status(200).json({ viewer_token: token, expiresAt, code, shareUrl });
}));

// DELETE /api/v1/matches/:id/share - Revoke viewer link(s) for this match (creator only)
router.delete('/:id/share', authenticateToken, validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const { code } = req.query as { code?: string };
  const matchId = req.params['id']!;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const where: any = {
    match_id: matchId,
    is_deleted: false,
  };
  if (code) where.code = code;

  const now = new Date();
  const result = await prisma.viewer_links.updateMany({
    where,
    data: {
      is_deleted: true,
      deleted_at: now,
      deleted_by_user_id: req.user!.id,
      updated_at: now,
    }
  });

  return res.status(200).json({ success: true, revoked: result.count });
}));

// GET /api/v1/matches/:id/share - List active (non-deleted, non-expired) viewer links (creator only)
router.get('/:id/share', authenticateToken, validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const matchId = req.params['id']!;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const now = new Date();
  const rows = await prisma.viewer_links.findMany({
    where: {
      match_id: matchId,
      is_deleted: false,
      expires_at: { gt: now },
    },
    select: {
      code: true,
      expires_at: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' }
  });

  console.log(`[Viewer Links] Retrieved ${rows.length} active links for match ${matchId}`);

  return res.status(200).json({
    success: true,
    data: rows.map(r => ({ code: r.code, expiresAt: r.expires_at.toISOString() }))
  });
}));
// (no-op helper removed; shareUrl now built as absolute using FRONTEND_URL/origin)

// GET /api/v1/matches/:id/summary?view= - Public read with viewer token
router.get('/:id/summary', authenticateViewerOrUser('id'), validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const { buildSnapshot } = sseHub;
  const snapshot = await buildSnapshot(req.params['id']!);
  return res.status(200).json(snapshot.summary);
}));

// GET /api/v1/matches/:id/periods-public?view=
router.get('/:id/periods-public', authenticateViewerOrUser('id'), validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const { buildSnapshot } = sseHub;
  const snapshot = await buildSnapshot(req.params['id']!);
  return res.status(200).json({ periods: snapshot.periods });
}));

// GET /api/v1/matches/:id/timeline-public?view=
router.get('/:id/timeline-public', authenticateViewerOrUser('id'), validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  const { buildSnapshot } = sseHub;
  const { summary, periods, events } = await buildSnapshot(req.params['id']!);

  // Merge periods and events into simple timeline
  const markers = periods.flatMap((p: any) => {
    const items: any[] = [];
    if (p.startedAt) items.push({ type: 'period_started', period: p, at: p.startedAt });
    if (p.endedAt) items.push({ type: 'period_ended', period: p, at: p.endedAt });
    return items;
  });
  const gameplay = events.map((e: any) => ({ type: 'event', event: e, at: e.createdAt }));
  const timeline = [...markers, ...gameplay].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return res.status(200).json({ summary, timeline });
}));

// GET /api/v1/matches/:id/stream?view=
router.get('/:id/stream', authenticateViewerOrUser('id'), validateUUID(), requireMatchCreator('id'), asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // @ts-ignore - flushHeaders may not exist depending on server
  res.flushHeaders?.();
  // Write a leading comment to establish the stream promptly
  res.write(`: connected\n\n`);

  const matchId = req.params['id']!;
  sseHub.subscribe(matchId, res);
  console.log(`[SSE] Client connected for match ${matchId} (total: ?)`);

  // Initial snapshot
  const payload = await sseHub.buildSnapshot(matchId);
  sseHub.send(res, 'snapshot', payload);

  req.on('close', () => {
    sseHub.unsubscribe(matchId, res);
    try { res.end(); } catch {}
    console.log(`[SSE] Client disconnected for match ${matchId}`);
  });
}));
