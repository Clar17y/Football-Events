/**
 * Development Routes
 * 
 * API endpoints for seeding and managing test data.
 * ONLY available in development environment.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { seedPremierLeagueData, clearAllTestData, getTestUsers } from '../../services/devSeedService';

const router = Router();

// Guard: Block all routes in production
router.use((_req: Request, res: Response, next: NextFunction) => {
    if (process.env['NODE_ENV'] === 'production') {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    next();
});

/**
 * GET /api/v1/dev
 * Get dev API info and available test users
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const testUsers = await getTestUsers();

        res.json({
            environment: process.env['NODE_ENV'],
            message: 'Development API endpoints',
            endpoints: {
                seed: 'POST /api/v1/dev/seed - Create test users and seed data',
                clear: 'DELETE /api/v1/dev/seed - Remove all test data',
                users: 'GET /api/v1/dev/users - List test users',
            },
            testUsers: testUsers.length,
            users: testUsers,
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/v1/dev/users
 * List all test users
 */
router.get('/users', async (_req: Request, res: Response) => {
    try {
        const users = await getTestUsers();
        res.json({ users, password: 'password' });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/v1/dev/seed
 * Seed PostgreSQL with Premier League test data
 */
router.post('/seed', async (_req: Request, res: Response) => {
    try {
        console.log('[DevRoutes] Starting Premier League data seed...');

        const result = await seedPremierLeagueData();

        res.json({
            success: result.success,
            message: 'Premier League test data seeded successfully',
            stats: result.stats,
            users: result.users.map((u: { email: string; password: string; teamName: string }) => ({
                email: u.email,
                password: u.password,
                teamName: u.teamName,
            })),
        });
    } catch (error) {
        console.error('[DevRoutes] Seed error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * DELETE /api/v1/dev/seed
 * Clear all test data from PostgreSQL
 */
router.delete('/seed', async (_req: Request, res: Response) => {
    try {
        console.log('[DevRoutes] Clearing all test data...');

        const result = await clearAllTestData();

        res.json({
            success: result.success,
            message: 'Test data cleared successfully',
            deleted: result.deleted,
        });
    } catch (error) {
        console.error('[DevRoutes] Clear error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
