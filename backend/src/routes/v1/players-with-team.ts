import { Router } from 'express';
import { PlayerService } from '../../services/PlayerService';
import { PlayerTeamService } from '../../services/PlayerTeamService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateRequest } from '../../middleware/validation';
import { authenticateToken } from '../../middleware/auth';
import { z } from 'zod';

const router = Router();
const playerService = new PlayerService();
const playerTeamService = new PlayerTeamService();

// Validation schema for creating player with team assignment
const playerWithTeamCreateSchema = z.object({
  // Player fields
  name: z.string()
    .min(1, 'Player name is required')
    .max(100, 'Player name must be less than 100 characters')
    .trim(),
  squadNumber: z.number()
    .int('Squad number must be an integer')
    .min(1, 'Squad number must be at least 1')
    .max(99, 'Squad number must be less than 100')
    .optional(),
  preferredPosition: z.string()
    .max(10, 'Position code must be less than 10 characters')
    .optional(),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional(),
  
  // Team assignment fields
  teamId: z.string().uuid('Team ID must be a valid UUID'),
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .default('2024-01-01'), // Default date
  isActive: z.boolean().optional().default(true)
});

// POST /api/v1/players-with-team - Create player and assign to team in one operation
router.post('/', authenticateToken, validateRequest(playerWithTeamCreateSchema), asyncHandler(async (req, res) => {
  const { teamId, startDate, isActive, ...playerData } = req.body;
  
  // Use a transaction to ensure both operations succeed or both fail
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const result = await prisma.$transaction(async () => {
      // Step 1: Create the player using the transaction
      const player = await playerService.createPlayer(playerData, req.user!.id, req.user!.role);
      
      // Step 2: Create the player-team relationship using the transaction
      const playerTeamData = {
        playerId: player.id,
        teamId,
        startDate,
        isActive
      };
      
      const playerTeam = await playerTeamService.createPlayerTeam(playerTeamData, req.user!.id, req.user!.role);
      
      return { player, playerTeam };
    });
    
    // Return combined result
    res.status(201).json({
      ...result,
      message: 'Player created and assigned to team successfully'
    });
    
  } catch (error) {
    // Transaction automatically rolls back on error
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}));

export default router;