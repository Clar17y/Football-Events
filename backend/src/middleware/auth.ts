import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/auth.js';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    const decoded = verifyToken(token);
    
    // Ensure it's an access token, not a refresh token
    if (decoded.type !== 'access') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type'
      });
      return;
    }

    // Add user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    let message = 'Invalid token';
    
    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        message = 'Token expired';
      } else if (error.message === 'Invalid token') {
        message = 'Invalid token';
      }
    }

    res.status(401).json({
      success: false,
      error: message
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (token) {
      const decoded = verifyToken(token);
      
      if (decoded.type === 'access') {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role
        };
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
}

/**
 * Authorization middleware - checks user role
 */
export function requireRole(roles: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
}

/**
 * Admin only middleware
 */
export const requireAdmin = requireRole('ADMIN');