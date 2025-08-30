import { Router } from 'express';
import { PositionCalculatorService } from '../../services/PositionCalculatorService';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractApiError } from '../../utils/prismaErrorHandler';
import { validateRequest } from '../../middleware/validation';
import { authenticateToken } from '../../middleware/auth';
import { z } from 'zod';

const router = Router();
const positionCalculatorService = new PositionCalculatorService();

// Validation schemas
const positionCalculateSchema = z.object({
  pitchX: z.number()
    .min(0, 'Pitch X coordinate must be at least 0')
    .max(100, 'Pitch X coordinate must be at most 100'),
  pitchY: z.number()
    .min(0, 'Pitch Y coordinate must be at least 0')
    .max(100, 'Pitch Y coordinate must be at most 100')
});

const positionZonesQuerySchema = z.object({
  minX: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxX: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  minY: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxY: z.string().optional().transform(val => val ? parseFloat(val) : undefined)
}).refine(data => {
  // If any area filter is provided, all must be provided
  const hasAreaFilter = data.minX !== undefined || data.maxX !== undefined || 
                       data.minY !== undefined || data.maxY !== undefined;
  
  if (hasAreaFilter) {
    return data.minX !== undefined && data.maxX !== undefined && 
           data.minY !== undefined && data.maxY !== undefined;
  }
  return true;
}, {
  message: 'If area filtering is used, all coordinates (minX, maxX, minY, maxY) must be provided'
}).refine(data => {
  if (data.minX !== undefined && data.maxX !== undefined) {
    return data.minX <= data.maxX;
  }
  return true;
}, {
  message: 'minX must be less than or equal to maxX'
}).refine(data => {
  if (data.minY !== undefined && data.maxY !== undefined) {
    return data.minY <= data.maxY;
  }
  return true;
}, {
  message: 'minY must be less than or equal to maxY'
});

// GET /api/v1/positions/zones - Retrieve pitch zones
router.get('/zones', authenticateToken, asyncHandler(async (req, res) => {
  try {
    // Validate query parameters
    const queryValidation = positionZonesQuerySchema.safeParse(req.query);
    
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Invalid query parameters',
        details: queryValidation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }

    const { minX, maxX, minY, maxY } = queryValidation.data;
    
    let zones;
    
    // If area filtering is requested, use the filtered method
    if (minX !== undefined && maxX !== undefined && minY !== undefined && maxY !== undefined) {
      zones = await positionCalculatorService.getZonesInArea(minX, maxX, minY, maxY);
    } else {
      zones = await positionCalculatorService.getPositionZones();
    }
    
    return res.json({
      success: true,
      data: {
        zones,
        count: zones.length
      },
      message: 'Position zones retrieved successfully'
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

// POST /api/v1/positions/calculate - Calculate position based on pitch coordinates
router.post('/calculate', 
  authenticateToken, 
  validateRequest(positionCalculateSchema), 
  asyncHandler(async (req, res) => {
    try {
      const { pitchX, pitchY } = req.body;
      
      const result = await positionCalculatorService.calculatePosition(pitchX, pitchY);
      
      return res.json({
        success: true,
        data: {
          position: result.position,
          zone: result.zone,
          confidence: result.confidence,
          coordinates: {
            x: pitchX,
            y: pitchY
          }
        },
        message: 'Position calculated successfully'
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

export default router;