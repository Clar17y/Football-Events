import { Router } from 'express';
import { PlayerTeamService } from '../../services/PlayerTeamService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { authenticateToken } from '../../middleware/auth';
import { 
  playerTeamCreateSchema, 
  playerTeamUpdateSchema
} from '../../validation/schemas';

const router = Router();
const playerTeamService = new PlayerTeamService();

// GET /api/v1/player-teams - List player-team relationships with pagination and filtering
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page, limit, playerId, teamId, isActive } = req.query;

  const options: any = {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 25,
    playerId: playerId as string,
    teamId: teamId as string
  };
  
  if (isActive === 'true') {
    options.isActive = true;
  } else if (isActive === 'false') {
    options.isActive = false;
  }

  const result = await playerTeamService.getPlayerTeams(req.user!.id, req.user!.role, options);
  res.json(result);
}));

// POST /api/v1/player-teams - Create new player-team relationship
router.post('/', authenticateToken, validateRequest(playerTeamCreateSchema), asyncHandler(async (req, res) => {
  const playerTeam = await playerTeamService.createPlayerTeam(req.body, req.user!.id, req.user!.role);
  res.status(201).json(playerTeam);
}));

// GET /api/v1/player-teams/:id - Get player-team relationship by ID
router.get('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const playerTeam = await playerTeamService.getPlayerTeamById(req.params['id']!, req.user!.id, req.user!.role);
  
  if (!playerTeam) {
    return res.status(404).json({
      error: 'Player-team relationship not found',
      message: `No relationship found with ID: ${req.params['id']} or access denied`
    });
  }
  
  return res.json(playerTeam);
}));

// PUT /api/v1/player-teams/:id - Update player-team relationship
router.put('/:id', authenticateToken, validateUUID(), validateRequest(playerTeamUpdateSchema), asyncHandler(async (req, res) => {
  const playerTeam = await playerTeamService.updatePlayerTeam(req.params['id']!, req.body, req.user!.id, req.user!.role);
  
  if (!playerTeam) {
    return res.status(404).json({
      error: 'Player-team relationship not found',
      message: `No relationship found with ID: ${req.params['id']} or access denied`
    });
  }
  
  return res.json(playerTeam);
}));

// DELETE /api/v1/player-teams/:id - Delete player-team relationship (soft delete)
router.delete('/:id', authenticateToken, validateUUID(), asyncHandler(async (req, res) => {
  const deleted = await playerTeamService.deletePlayerTeam(req.params['id']!, req.user!.id, req.user!.role);
  
  if (!deleted) {
    return res.status(404).json({
      error: 'Player-team relationship not found',
      message: `No relationship found with ID: ${req.params['id']} or access denied`
    });
  }
  
  return res.status(204).send();
}));

// GET /api/v1/player-teams/team/:teamId/players - Get all players for a specific team
router.get('/team/:teamId/players', authenticateToken, validateUUID('teamId'), asyncHandler(async (req, res) => {
  const players = await playerTeamService.getTeamPlayers(req.params['teamId']!, req.user!.id, req.user!.role);
  return res.json(players);
}));

// GET /api/v1/player-teams/player/:playerId/teams - Get all teams for a specific player
router.get('/player/:playerId/teams', authenticateToken, validateUUID('playerId'), asyncHandler(async (req, res) => {
  const teams = await playerTeamService.getPlayerTeamsByPlayer(req.params['playerId']!, req.user!.id, req.user!.role);
  return res.json(teams);
}));

export default router;