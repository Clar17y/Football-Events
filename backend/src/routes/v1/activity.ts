import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ActivityService } from '../../services/ActivityService';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

/**
 * GET /api/v1/activity/recent
 * Get recent activity across all entities
 */
router.get('/recent', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const limit = parseInt(req.query['limit'] as string) || 20;
  const days = parseInt(req.query['days'] as string) || 30;
  const page = parseInt(req.query['page'] as string) || 1;

  const result = await ActivityService.getRecentActivity(userId, { limit, days, page });
  
  res.json(result);
}));

export default router;