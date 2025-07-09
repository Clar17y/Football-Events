import { Router } from 'express';
import { PositionService } from '../../services/PositionService';
import { validateRequest } from '../../middleware/validation';
import { validateUUID } from '../../middleware/uuidValidation';
import { positionCreateSchema, positionUpdateSchema } from '../../validation/schemas';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
const positionService = new PositionService();

// GET /api/v1/positions - List positions with pagination and filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search } = req.query;
  
  const result = await positionService.getPositions({
    page: Number(page),
    limit: Number(limit),
    search: search as string
  });
  
  res.json(result);
}));

// POST /api/v1/positions - Create new position
router.post('/', 
  validateRequest(positionCreateSchema),
  asyncHandler(async (req, res) => {
    const position = await positionService.createPosition(req.body);
    res.status(201).json(position);
  })
);

// GET /api/v1/positions/:id - Get position by ID
router.get('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const position = await positionService.getPositionById(req.params['id']!);
  
  if (!position) {
    return res.status(404).json({
      error: 'Position not found',
      message: `Position with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.json(position);
}));

// GET /api/v1/positions/code/:code - Get position by code
router.get('/code/:code', asyncHandler(async (req, res) => {
  const position = await positionService.getPositionByCode(req.params['code']!);
  
  if (!position) {
    return res.status(404).json({
      error: 'Position not found',
      message: `Position with code ${req.params['code']} does not exist`
    });
  }
  
  return res.json(position);
}));

// PUT /api/v1/positions/:id - Update position
router.put('/:id',
  validateRequest(positionUpdateSchema),
  asyncHandler(async (req, res) => {
    const position = await positionService.updatePosition(req.params['id']!, req.body);
    
    if (!position) {
      return res.status(404).json({
        error: 'Position not found',
        message: `Position with ID ${req.params['id']} does not exist`
      });
    }
    
    return res.json(position);
  })
);

// DELETE /api/v1/positions/:id - Delete position
router.delete('/:id', validateUUID(), asyncHandler(async (req, res) => {
  const success = await positionService.deletePosition(req.params['id']!);
  
  if (!success) {
    return res.status(404).json({
      error: 'Position not found',
      message: `Position with ID ${req.params['id']} does not exist`
    });
  }
  
  return res.status(204).send();
}));

export default router;