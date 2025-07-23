import { Router } from 'express';
import { TeamService } from '../../services/TeamService';
import { PlayerTeamService } from '../../services/PlayerTeamService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { teamCreateSchema, teamUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const teamService = new TeamService();
const playerTeamService = new PlayerTeamService();

// GET /api/v1/teams - List teams with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search } = req.query;
  
  const result = await teamService.getTeams(
    req.user!.id,
    req.user!.role,
    {
      page: Number(page),
      limit: Number(limit),
      search: search as string
    }
  );
  
  res.json(result);
}));

// POST /api/v1/teams - Create new team
router.post('/', 
  authenticateToken,
  validateRequest(teamCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const team = await teamService.createTeam(req.body, req.user!.id);
      res.status(201).json(team);
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

// GET /api/v1/teams/:id - Get team by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const team = await teamService.getTeamById(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!team) {
    return res.status(404).json({
      error: 'Team not found',
      message: `Team with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(team);
}));

// PUT /api/v1/teams/:id - Update team
router.put('/:id',
  authenticateToken,
  validateUUID(),
  validateRequest(teamUpdateSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(
      req.params['id']!,
      req.body,
      req.user!.id,
      req.user!.role
    );
    
    if (!team) {
      return res.status(404).json({
        error: 'Team not found',
        message: `Team with ID ${req.params['id']} does not exist or access denied`
      });
    }
    
    return res.json(team);
  })
);

// DELETE /api/v1/teams/:id - Delete team (soft delete)
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const success = await teamService.deleteTeam(
    req.params['id']!,
    req.user!.id,
    req.user!.role
  );
  
  if (!success) {
    return res.status(404).json({
      error: 'Team not found',
      message: `Team with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/teams/:id/players - Get team roster
router.get('/:id/players', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  try {
    const players = await teamService.getTeamPlayers(
      req.params['id']!,
      req.user!.id,
      req.user!.role
    );
    return res.json(players);
  } catch (error: any) {
    if (error.message === 'Team not found or access denied') {
      return res.status(404).json({
        error: 'Team not found',
        message: `Team with ID ${req.params['id']} does not exist or access denied`
      });
    }
    throw error;
  }
}));

// GET /api/v1/teams/:id/active-players - Get active players for a specific team (convenience endpoint)
router.get('/:id/active-players', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const activePlayers = await playerTeamService.getActiveTeamPlayers(req.params['id']!, req.user!.id, req.user!.role);
  return res.json(activePlayers);
}));

// GET /api/v1/teams/:id/squad - Get team squad with active players
router.get('/:id/squad', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const { seasonId } = req.query;
  const squad = await teamService.getTeamSquad(
    req.params['id']!,
    req.user!.id,
    req.user!.role,
    seasonId as string
  );
  
  if (!squad) {
    return res.status(404).json({
      error: 'Team not found',
      message: `Team with ID ${req.params['id']} does not exist or access denied`
    });
  }
  
  return res.json(squad);
}));

export default router;