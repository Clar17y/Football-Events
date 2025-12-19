import { Router } from 'express';
import { DefaultLineupService } from '../../services/DefaultLineupService';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { 
  defaultLineupCreateSchema, 
  defaultLineupUpdateSchema
} from '../../validation/schemas';

const router = Router();
const defaultLineupService = new DefaultLineupService();

// POST /api/v1/default-lineups - Create or update default lineup for a team
router.post('/', authenticateToken, validateRequest(defaultLineupCreateSchema), asyncHandler(async (req, res) => {
  try {
    const { teamId, formation } = req.body;
    const defaultLineup = await defaultLineupService.saveDefaultLineup(teamId, formation, req.user!.id);
    
    return res.status(201).json({
      success: true,
      data: defaultLineup,
      message: 'Default lineup saved successfully'
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
    throw error; // Re-throw if not a handled API error
  }
}));

// GET /api/v1/default-lineups/:teamId - Get default lineup for a specific team
router.get('/:teamId', authenticateToken, validateUUID('teamId'), asyncHandler(async (req, res) => {
  const teamId = req.params['teamId']!;
  const defaultLineup = await defaultLineupService.getDefaultLineup(teamId, req.user!.id);
  
  if (!defaultLineup) {
    return res.status(404).json({
      success: false,
      error: 'Default lineup not found',
      message: `No default lineup found for team ${teamId} or access denied`
    });
  }
  
  return res.json({
    success: true,
    data: defaultLineup
  });
}));

// PUT /api/v1/default-lineups/:teamId - Update default lineup for a specific team
router.put('/:teamId', 
  authenticateToken, 
  validateUUID('teamId'), 
  validateRequest(defaultLineupUpdateSchema), 
  asyncHandler(async (req, res) => {
    try {
      const teamId = req.params['teamId']!;
      const { formation } = req.body;
      
      if (!formation) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Formation data is required for update'
        });
      }
      
      const defaultLineup = await defaultLineupService.saveDefaultLineup(teamId, formation, req.user!.id);
      
      return res.json({
        success: true,
        data: defaultLineup,
        message: 'Default lineup updated successfully'
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
      throw error; // Re-throw if not a handled API error
    }
  })
);

// DELETE /api/v1/default-lineups/:teamId - Delete default lineup for a specific team
router.delete('/:teamId', authenticateToken, validateUUID('teamId'), asyncHandler(async (req, res) => {
  const teamId = req.params['teamId']!;
  const deleted = await defaultLineupService.deleteDefaultLineup(teamId, req.user!.id);
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Default lineup not found',
      message: `No default lineup found for team ${teamId} or access denied`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/default-lineups - Get all teams with default lineup status for the authenticated user
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const teamsWithDefaults = await defaultLineupService.getTeamsWithDefaultLineups(req.user!.id);
  
  return res.json({
    success: true,
    data: teamsWithDefaults
  });
}));

// POST /api/v1/default-lineups/:teamId/apply-to-match - Apply default lineup to a specific match
router.post('/:teamId/apply-to-match', 
  authenticateToken, 
  validateUUID('teamId'), 
  asyncHandler(async (req, res) => {
    try {
      const teamId = req.params['teamId']!;
      const { matchId } = req.body;
      
      if (!matchId) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Match ID is required'
        });
      }
      
      const lineupRecords = await defaultLineupService.applyDefaultToMatch(teamId, matchId, req.user!.id);
      
      return res.status(201).json({
        success: true,
        data: lineupRecords,
        message: `Default lineup applied to match. Created ${lineupRecords.length} lineup records.`
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
      throw error; // Re-throw if not a handled API error
    }
  })
);

// POST /api/v1/default-lineups/validate - Validate formation data without saving
router.post('/validate', authenticateToken, asyncHandler(async (req, res) => {
  const { formation } = req.body;
  
  if (!formation) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Formation data is required for validation'
    });
  }
  
  const validation = defaultLineupService.validateFormation(formation);
  
  return res.json({
    success: true,
    data: {
      isValid: validation.isValid,
      errors: validation.errors
    }
  });
}));

export default router;
