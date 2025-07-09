import { Request, Response } from 'express';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: {
      health: 'GET /health',
      apiInfo: 'GET /api/v1',
      teams: 'GET /api/v1/teams'
    }
  });
};