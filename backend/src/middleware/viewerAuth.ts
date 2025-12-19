import { Request, Response, NextFunction } from 'express';
import { verifyViewerToken } from '../utils/viewerTokens';
import { extractTokenFromHeader, verifyToken } from '../utils/auth';

declare global {
  namespace Express {
    interface Request {
      viewer?: {
        matchId: string;
        exp: number; // seconds since epoch
      };
    }
  }
}

/**
 * Middleware that allows either:
 * - a scoped viewer token in `?view=...` matching `req.params[matchParam]`, or
 * - a normal authenticated user via Authorization header.
 */
export function authenticateViewerOrUser(matchParam: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const viewParam = (req.query?.['view'] as string | undefined) || undefined;
      const codeParam = (req.query?.['code'] as string | undefined) || undefined;
      const paramMatchId = req.params?.[matchParam];

      if (viewParam) {
        const decoded = verifyViewerToken(viewParam);
        if (!paramMatchId || decoded.matchId !== paramMatchId) {
          res.status(401).json({ success: false, error: 'Viewer token does not match requested match' });
          return;
        }
        req.viewer = { matchId: decoded.matchId, exp: decoded.exp };
        return next();
      }

      if (codeParam) {
        // Lookup short code in DB (soft-delete and expiry aware)
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.viewer_links.findFirst({
          where: {
            code: codeParam,
            is_deleted: false,
          }
        }).then((row: any) => {
          if (!row) {
            res.status(401).json({ success: false, error: 'Invalid viewer code' });
            return;
          }
          if (new Date(row.expires_at).getTime() <= Date.now()) {
            res.status(401).json({ success: false, error: 'Viewer code expired' });
            return;
          }
          if (!paramMatchId || row.match_id !== paramMatchId) {
            res.status(401).json({ success: false, error: 'Viewer code does not match requested match' });
            return;
          }
          // Attach viewer info (no exp from JWT; use expires_at seconds)
          req.viewer = { matchId: row.match_id, exp: Math.floor(new Date(row.expires_at).getTime() / 1000) };
          return next();
        }).catch((_e: any) => {
          res.status(401).json({ success: false, error: 'Unauthorized' });
        });
        return; // prevent falling through
      }

      // Fallback to standard user auth
      const authHeader = req.headers.authorization;
      const token = extractTokenFromHeader(authHeader);
      if (!token) {
        res.status(401).json({ success: false, error: 'Access token or viewer token required' });
        return;
      }

      const decoded = verifyToken(token);
      if (decoded.type !== 'access') {
        res.status(401).json({ success: false, error: 'Invalid token type' });
        return;
      }

      req.user = { id: decoded.userId, email: decoded.email, role: decoded.role };
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      res.status(401).json({ success: false, error: message });
    }
  };
}
