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

// Validation schema for creating player with multiple team assignments
const playerWithTeamsCreateSchema = z.object({
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
    .regex(/^\d{2}-\d{2}-\d{4}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional(),
  
  // Multiple team assignment fields
  teamIds: z.array(z.string().uuid('Team ID must be a valid UUID'))
    .min(1, 'At least one team ID is required'),
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .default('2024-01-01'),
  isActive: z.boolean().optional().default(true)
});

// POST /api/v1/players-with-teams - Create player and assign to multiple teams in one operation
router.post('/', authenticateToken, validateRequest(playerWithTeamsCreateSchema), asyncHandler(async (req, res) => {
  const { teamIds, startDate, isActive, ...playerData } = req.body;
  
  // Use a transaction to ensure all operations succeed or all fail
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const result = await prisma.$transaction(async () => {
      // Step 1: Create the player
      const player = await playerService.createPlayer(playerData, req.user!.id, req.user!.role);
      
      // Step 2: Create multiple player-team relationships
      const playerTeams = [];
      for (const teamId of teamIds) {
        const playerTeamData = {
          playerId: player.id,
          teamId,
          startDate,
          isActive
        };
        
        const playerTeam = await playerTeamService.createPlayerTeam(playerTeamData, req.user!.id, req.user!.role);
        playerTeams.push(playerTeam);
      }
      
      return { player, playerTeams };
    });
    
    // Return combined result
    res.status(201).json({
      ...result,
      message: `Player created and assigned to ${teamIds.length} team${teamIds.length !== 1 ? 's' : ''} successfully`
    });
    
  } catch (error) {
    // Transaction automatically rolls back on error
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}));

// Validation schema for updating player with team changes
const playerWithTeamsUpdateSchema = z.object({
  // Player fields (all optional for updates)
  name: z.string()
    .min(1, 'Player name is required')
    .max(100, 'Player name must be less than 100 characters')
    .trim()
    .optional(),
  squadNumber: z.number()
    .int('Squad number must be an integer')
    .min(1, 'Squad number must be at least 1')
    .max(99, 'Squad number must be less than 100')
    .optional(),
  preferredPosition: z.string()
    .max(10, 'Position code must be less than 10 characters')
    .optional(),
  dateOfBirth: z.string()
    .regex(/^\d{2}-\d{2}-\d{4}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional(),
  
  // Team assignment changes
  teamIds: z.array(z.string().uuid('Team ID must be a valid UUID')),
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .default('2024-01-01'),
  isActive: z.boolean().optional().default(true)
});

// PUT /api/v1/players-with-teams/:id - Update player and manage team assignments
router.put('/:id', authenticateToken, validateRequest(playerWithTeamsUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { teamIds, startDate, isActive, ...playerData } = req.body;
  
  // Use today's date as default for new relationships and end dates
  const today = new Date();
  const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
  const effectiveStartDate = startDate || todayString;
  
  // Use a transaction to ensure all operations succeed or all fail
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const result = await prisma.$transaction(async () => {
      // Step 1: Update the player if there are player field changes
      let player;
      if (Object.keys(playerData).length > 0) {
        player = await playerService.updatePlayer(id, playerData, req.user!.id, req.user!.role);
        if (!player) {
          const error = new Error('Player not found or access denied') as any;
          error.statusCode = 404;
          throw error;
        }
      } else {
        // Just get the player if no updates needed
        player = await playerService.getPlayerById(id, req.user!.id, req.user!.role);
        if (!player) {
          const error = new Error('Player not found or access denied') as any;
          error.statusCode = 404;
          throw error;
        }
      }
      
      // Step 2: Get current active team relationships
      const currentRelationships = await prisma.player_teams.findMany({
        where: {
          player_id: id,
          is_active: true,
          is_deleted: false
        }
      });
      
      const currentTeamIds = currentRelationships.map(rel => rel.team_id);
      
      // Step 3: Determine changes needed
      const teamsToAdd = teamIds.filter(teamId => !currentTeamIds.includes(teamId));
      const teamsToRemove = currentTeamIds.filter(teamId => !teamIds.includes(teamId));
      
      console.log(`[PlayerTeamUpdate] Current teams: ${currentTeamIds}`);
      console.log(`[PlayerTeamUpdate] New teams: ${teamIds}`);
      console.log(`[PlayerTeamUpdate] Teams to add: ${teamsToAdd}`);
      console.log(`[PlayerTeamUpdate] Teams to remove: ${teamsToRemove}`);
      
      // Step 4: Soft delete removed team relationships
      if (teamsToRemove.length > 0) {
        await prisma.player_teams.updateMany({
          where: {
            player_id: id,
            team_id: { in: teamsToRemove },
            is_active: true,
            is_deleted: false
          },
          data: {
            is_active: false,
            end_date: today, // Set end date to today
            deleted_at: today,
            deleted_by_user_id: req.user!.id,
            is_deleted: true
          }
        });
      }
      
      // Step 5: Add new team relationships
      const newRelationships = [];
      for (const teamId of teamsToAdd) {
        const playerTeamData = {
          playerId: id,
          teamId,
          startDate: effectiveStartDate, // Use today's date as default
          isActive
        };
        
        const playerTeam = await playerTeamService.createPlayerTeam(playerTeamData, req.user!.id, req.user!.role);
        newRelationships.push(playerTeam);
      }
      
      return { player, newRelationships, removedCount: teamsToRemove.length };
    });
    
    // Return combined result
    res.status(200).json({
      ...result,
      message: `Player updated successfully. Added ${result.newRelationships.length} team(s), removed ${result.removedCount} team(s).`
    });
    
  } catch (error) {
    // Transaction automatically rolls back on error
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}));

export default router;