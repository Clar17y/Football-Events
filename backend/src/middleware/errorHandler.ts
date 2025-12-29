import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  apiError?: any;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const code = error.apiError?.code || error.code;
  const isQuota = code === 'QUOTA_EXCEEDED' || code === 'FEATURE_LOCKED';

  const bodyForLog = (() => {
    try {
      if (req.body == null) return undefined;
      const json = JSON.stringify(req.body);
      const MAX = 500;
      if (json.length <= MAX) return json;
      return `${json.slice(0, MAX)}…[truncated ${json.length - MAX} chars]`;
    } catch {
      return '[unserializable body]';
    }
  })();

  if (isQuota) {
    console.warn('Quota denied:', {
      code,
      message: error.message,
      details: error.apiError?.details || error.details,
      url: req.url,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    console.error('API Error:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      params: req.params,
      query: req.query,
      userId: req.user?.id,
      // Avoid logging attacker-controlled payloads; keep only a short preview for debugging.
      body: bodyForLog,
    });
  }

  // Prisma errors
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Conflict',
          message: 'A record with this data already exists',
          details: error.meta
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Not Found',
          message: 'The requested record was not found',
          details: error.meta
        });
      case 'P2003':
        return res.status(400).json({
          error: 'Foreign Key Constraint',
          message: 'Referenced record does not exist',
          details: error.meta
        });
      default:
        return res.status(500).json({
          error: 'Database Error',
          message: 'An error occurred while accessing the database',
          code: error.code
        });
    }
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message
    });
  }

  // Custom API errors
  if (error.statusCode) {
    if (isQuota && error.statusCode === 402) {
      // Some clients/backoff strategies respect Retry-After; quota errors often won't change until upgrade.
      res.setHeader('Retry-After', '3600'); // 1 hour
    }

    // Prefer structured ApiError shape when available (e.g. from withPrismaErrorHandling)
    if (error.apiError) {
      return res.status(error.statusCode).json({
        error: error.apiError.error || 'API Error',
        message: error.apiError.message || error.message,
        code: error.apiError.code || error.code,
        details: error.apiError.details || error.details,
        field: error.apiError.field,
        constraint: error.apiError.constraint
      });
    }
    return res.status(error.statusCode).json({
      error: error.name || 'API Error',
      message: error.message,
      code: error.code || (error.statusCode === 403 ? 'ACCESS_DENIED' : error.statusCode === 400 ? 'INVALID_PAYLOAD' : undefined),
      details: error.details
    });
  }

  // Default server error
  return res.status(500).json({
    error: 'Internal Server Error',
    message: process.env['NODE_ENV'] === 'production' 
      ? 'An unexpected error occurred' 
      : error.message
  });
};
