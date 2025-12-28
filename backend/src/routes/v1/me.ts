import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { QuotaService } from '../../services/QuotaService';

const router = Router();
const prisma = new PrismaClient();
const quotaService = new QuotaService(prisma);

// GET /api/v1/me/limits - Return server-authoritative plan + limits + usage
router.get('/limits', authenticateToken, asyncHandler(async (req, res) => {
  const planType = await quotaService.getPlanType(req.user!.id, req.user!.role);
  const limits = quotaService.getLimits(planType);
  const allowedEventKinds = quotaService.getAllowedEventKinds(planType);
  const features = quotaService.getFeatures(planType);
  const usage = await quotaService.getUsage(req.user!.id, req.user!.role);

  return res.status(200).json({
    planType,
    limits,
    allowedEventKinds,
    features,
    usage
  });
}));

export default router;

