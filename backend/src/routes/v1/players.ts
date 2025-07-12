import { Router } from 'express';
import { PlayerService } from '../../services/PlayerService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { playerCreateSchema, playerUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const playerService = new PlayerService();

// GET /api/v1/players - List players with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search, teamId, position } = req.query;
  
  const result = await playerService.getPlayers({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    teamId: teamId as string,
    position: position as string
  });
  
  res.json(result);
}));

// POST /api/v1/players - Create new player
router.post('/', 
  validateRequest(playerCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const player = await playerService.createPlayer(req.body);
      res.status(201).json(player);
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

// GET /api/v1/players/:id - Get player by ID
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const player = await playerService.getPlayerById(req.params['id']!);
  
  if (!player) {
    return res.status(404).json({
      error: 'Player not found',
      message: `Player with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(player);
}));

// PUT /api/v1/players/:id - Update player
router.put('/:id',
  validateUUID(),
  validateRequest(playerUpdateSchema),
  asyncHandler(async (req, res) => {
    const player = await playerService.updatePlayer(req.params['id']!, req.body);
    
    if (!player) {
      return res.status(404).json({
        error: 'Player not found',
        message: `Player with ID ${req.params['id']} does not exist`
      });
    }
    
    return res.json(player);
  })
);

// DELETE /api/v1/players/:id - Delete player
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await playerService.deletePlayer(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Player not found',
      message: `Player with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

export default router;