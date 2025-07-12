import { Router } from 'express';
import { TeamService } from '../../services/TeamService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { teamCreateSchema, teamUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const teamService = new TeamService();

// GET /api/v1/teams - List teams with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search } = req.query;
  
  const result = await teamService.getTeams({
    page: Number(page),
    limit: Number(limit),
    search: search as string
  });
  
  res.json(result);
}));

// POST /api/v1/teams - Create new team
router.post('/', 
  validateRequest(teamCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const team = await teamService.createTeam(req.body);
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
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const team = await teamService.getTeamById(req.params['id']!);
  
  if (!team) {
    return res.status(404).json({
      error: 'Team not found',
      message: `Team with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(team);
}));

// PUT /api/v1/teams/:id - Update team
router.put('/:id',
  validateUUID(),
  validateRequest(teamUpdateSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(req.params['id']!, req.body);
    
    if (!team) {
      return res.status(404).json({
        error: 'Team not found',
        message: `Team with ID ${req.params['id']} does not exist`
      });
    }
    
    return res.json(team);
  })
);

// DELETE /api/v1/teams/:id - Delete team
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await teamService.deleteTeam(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Team not found',
      message: `Team with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/teams/:id/players - Get team roster
router.get('/:id/players', validateUUID(), asyncHandler(async (req, res) => {
  const players = await teamService.getTeamPlayers(req.params['id']!);
  return res.json(players);
}));

export default router;