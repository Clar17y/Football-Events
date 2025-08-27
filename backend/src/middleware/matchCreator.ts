import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Ensures the authenticated user is the creator of the match (or ADMIN).
 * Intended to be used after authenticateToken or authenticateViewerOrUser.
 * If a viewer token was provided (req.viewer), this middleware should be skipped.
 */
export function requireMatchCreator(matchParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // If this request is authorized via viewer token, allow
      if (req.viewer?.matchId) {
        return next();
      }

      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Admins are allowed
      if (req.user.role === 'ADMIN') {
        return next();
      }

      const matchId = req.params?.[matchParam];
      if (!matchId) {
        return res.status(400).json({ success: false, error: 'Missing match id' });
      }

      const match = await prisma.match.findFirst({
        where: { match_id: matchId, is_deleted: false },
        select: { created_by_user_id: true }
      });

      if (!match) {
        return res.status(404).json({ success: false, error: 'Match not found' });
      }

      if (match.created_by_user_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Only the match creator may access this endpoint' });
      }

      return next();
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
}

