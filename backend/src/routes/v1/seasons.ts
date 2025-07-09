import { Router } from 'express';
import { SeasonService } from '../../services/SeasonService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { seasonCreateSchema, seasonUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
const seasonService = new SeasonService();

// GET /api/v1/seasons - List seasons with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search } = req.query;
  
  const result = await seasonService.getSeasons({
    page: Number(page),
    limit: Number(limit),
    search: search as string
  });
  
  res.json(result);
}));

// POST /api/v1/seasons - Create new season
router.post('/', 
  validateRequest(seasonCreateSchema),
  asyncHandler(async (req, res) => {
    const season = await seasonService.createSeason(req.body);
    res.status(201).json(season);
  })
);

// GET /api/v1/seasons/:id - Get season by ID
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const season = await seasonService.getSeasonById(req.params['id']!);
  
  if (!season) {
    return res.status(404).json({
      error: 'Season not found',
      message: `Season with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(season);
}));

// PUT /api/v1/seasons/:id - Update season
router.put('/:id',
  validateRequest(seasonUpdateSchema),
  asyncHandler(async (req, res) => {
    const season = await seasonService.updateSeason(req.params['id']!, req.body);
    
    if (!season) {
      return res.status(404).json({
        error: 'Season not found',
        message: `Season with ID ${req.params['id']} does not exist`
      });
    }
    
    return res.json(season);
  })
);

// DELETE /api/v1/seasons/:id - Delete season
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await seasonService.deleteSeason(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Season not found',
      message: `Season with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

export default router;