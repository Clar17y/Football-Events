import { Router } from 'express';
import { SeasonService } from '../../services/SeasonService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { seasonCreateSchema, seasonUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';

const router = Router();
const seasonService = new SeasonService();

// GET /api/v1/seasons/current - Get current active season
router.get('/current', asyncHandler(async (req, res) => {
  try {
    const currentSeason = await seasonService.getCurrentSeason();
    
    if (!currentSeason) {
      return res.status(404).json({
        error: 'No current season found',
        message: 'No active season found for the current date'
      });
    }
    
    res.json({
      success: true,
      season: currentSeason
    });
  } catch (error) {
    console.error('Error fetching current season:', error);
    res.status(500).json({
      error: 'Failed to fetch current season',
      message: 'Unable to retrieve current season information'
    });
  }
}));

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
    try {
      const season = await seasonService.createSeason(req.body);
      res.status(201).json(season);
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