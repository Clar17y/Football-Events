import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/v1/stats/global - Get global platform statistics
 * Returns aggregated stats across all users for community engagement
 */
router.get('/global', asyncHandler(async (_req, res) => {
  try {
    // Get date boundaries for today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Get ALL current seasons from database for active teams calculation
    // Multiple users can have their own current season, so we need all of them
    const currentDate = new Date();
    let currentSeasons = await prisma.seasons.findMany({
      where: { is_current: true, is_deleted: false },
      select: { season_id: true }
    });

    // If no seasons marked current, find by date range
    if (currentSeasons.length === 0) {
      currentSeasons = await prisma.seasons.findMany({
        where: {
          AND: [
            { start_date: { lte: currentDate } },
            { end_date: { gte: currentDate } },
            { is_deleted: false }
          ]
        },
        select: { season_id: true }
      });
    }

    const currentSeasonIds = currentSeasons.map(s => s.season_id);

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
      prisma.team.count({ where: { is_deleted: false, is_opponent: false } }),

      // Total players across platform (exclude soft-deleted)
      prisma.player.count({ where: { is_deleted: false } }),

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

      // Active teams (teams with matches in any current season)
      currentSeasonIds.length > 0 ? prisma.team.count({
        where: {
          OR: [
            { homeMatches: { some: { season_id: { in: currentSeasonIds } } } },
            { awayMatches: { some: { season_id: { in: currentSeasonIds } } } }
          ],
          is_deleted: false,
          is_opponent: false
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
    // Graceful degraded response so frontend can render using zeros/cached data
    res.setHeader('x-degraded', '1');
    res.json({
      total_teams: 0,
      active_teams: 0,
      total_players: 0,
      total_matches: 0,
      matches_played: 0,
      active_matches: 0,
      matches_today: 0,
      last_updated: new Date().toISOString(),
      degraded: true
    });
  }
}));

export default router;
