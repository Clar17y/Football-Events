import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

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
    return res.status(error.statusCode).json({
      error: error.name || 'API Error',
      message: error.message
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