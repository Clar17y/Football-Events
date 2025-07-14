import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/v1/stats/global - Get global platform statistics
 * Returns aggregated stats across all users for community engagement
 */
router.get('/global', asyncHandler(async (req, res) => {
  try {
    // Get date boundaries for today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Get current season from database for active teams calculation
    const currentDate = new Date();
    let currentSeason = await prisma.seasons.findFirst({
      where: { is_current: true },
      select: { season_id: true, label: true }
    });
    
    // If no season marked current, find by date range
    if (!currentSeason) {
      currentSeason = await prisma.seasons.findFirst({
        where: {
          AND: [
            { start_date: { lte: currentDate } },
            { end_date: { gte: currentDate } }
          ]
        },
        select: { season_id: true, label: true },
        orderBy: { start_date: 'desc' }
      });
    }

    // Execute count queries in parallel
    const [
      totalTeams,
      totalPlayers,
      totalMatches,
      matchesToday,
      activeTeams,
      matchesPlayed
    ] = await Promise.all([
      // Total teams across platform
      prisma.team.count(),
      
      // Total players across platform
      prisma.player.count(),
      
      // Total matches ever created
      prisma.match.count(),
      
      // Matches scheduled for today (kickoff time is today)
      prisma.match.count({
        where: {
          kickoff_ts: {
            gte: todayStart,
            lte: todayEnd
          }
        }
      }),

      // Active teams (teams with matches in current season)
      currentSeason ? prisma.team.count({
        where: {
          OR: [
            { homeMatches: { some: { season_id: currentSeason.season_id } } },
            { awayMatches: { some: { season_id: currentSeason.season_id } } }
          ]
        }
      }) : 0,

      // Matches that have been played (kickoff time is in the past)
      prisma.match.count({
        where: {
          kickoff_ts: {
            lt: new Date() // Kickoff time is before now
          }
        }
      })
    ]);

    // Get matches with details to calculate truly active matches
    const todayMatches = await prisma.match.findMany({
      where: {
        kickoff_ts: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      select: {
        kickoff_ts: true,
        duration_mins: true
      }
    });

    // Calculate actually active matches (currently in progress)
    const currentTime = new Date();
    const activeMatches = todayMatches.filter(match => {
      const kickoffTime = new Date(match.kickoff_ts);
      const endTime = new Date(kickoffTime.getTime() + (match.duration_mins * 60 * 1000));
      return currentTime >= kickoffTime && currentTime <= endTime;
    }).length;

    // Return global statistics
    res.json({
      total_teams: totalTeams,
      active_teams: activeTeams,     // Teams with matches in current season
      total_players: totalPlayers,
      total_matches: totalMatches,
      matches_played: matchesPlayed, // Matches that have been completed
      active_matches: activeMatches, // Matches currently in progress
      matches_today: matchesToday,   // Matches scheduled for today
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching global stats:', error);
    res.status(500).json({
      error: 'Failed to fetch global statistics',
      message: 'Unable to retrieve platform statistics at this time'
    });
  }
}));

export default router;