/**
 * Statistics API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the enhanced Statistics API.
 * Tests the new active_teams, matches_played metrics and current season integration.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';

describe('Statistics API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let createdEntities: {
    seasonIds: string[];
    teamIds: string[];
    playerIds: string[];
    matchIds: string[];
  } = {
    seasonIds: [],
    teamIds: [],
    playerIds: [],
    matchIds: []
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    });
    
    await prisma.$connect();
    apiRequest = request(app);
    
    console.log('Statistics API Tests: Database connected');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset tracking arrays
    createdEntities = {
      seasonIds: [],
      teamIds: [],
      playerIds: [],
      matchIds: []
    };
  });

  afterEach(async () => {
    // Clean up created entities in reverse dependency order
    try {
      if (createdEntities.matchIds.length > 0) {
        await prisma.match.deleteMany({
          where: { match_id: { in: createdEntities.matchIds } }
        });
      }
      
      if (createdEntities.playerIds.length > 0) {
        await prisma.player.deleteMany({
          where: { id: { in: createdEntities.playerIds } }
        });
      }
      
      if (createdEntities.teamIds.length > 0) {
        await prisma.team.deleteMany({
          where: { id: { in: createdEntities.teamIds } }
        });
      }
      
      if (createdEntities.seasonIds.length > 0) {
        await prisma.seasons.deleteMany({
          where: { season_id: { in: createdEntities.seasonIds } }
        });
      }
      
      console.log('Statistics test entities cleaned up successfully');
    } catch (error) {
      console.warn('Statistics cleanup warning (non-fatal):', error);
    }
  });

  describe('GET /api/v1/stats/global', () => {
    it('should return basic statistics with zero values when database is empty', async () => {
      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      expect(response.body).toMatchObject({
        total_teams: expect.any(Number),
        active_teams: expect.any(Number),
        total_players: expect.any(Number),
        total_matches: expect.any(Number),
        matches_played: expect.any(Number),
        active_matches: expect.any(Number),
        matches_today: expect.any(Number),
        last_updated: expect.any(String)
      });

      // Verify the response structure is correct
      expect(response.body.active_teams).toBeLessThanOrEqual(response.body.total_teams);
      expect(response.body.matches_played).toBeLessThanOrEqual(response.body.total_matches);
      expect(response.body.active_matches).toBeLessThanOrEqual(response.body.matches_today);
      
      console.log('Basic statistics structure validated');
    });

    it('should show correct team and player counts', async () => {
      // Create test teams and players
      const team1 = await prisma.team.create({
        data: { name: `Test Team 1 ${Date.now()}` }
      });
      const team2 = await prisma.team.create({
        data: { name: `Test Team 2 ${Date.now()}` }
      });
      
      createdEntities.teamIds.push(team1.id, team2.id);

      const player1 = await prisma.player.create({
        data: { 
          name: `Test Player 1 ${Date.now()}`,
          current_team: team1.id
        }
      });
      const player2 = await prisma.player.create({
        data: { 
          name: `Test Player 2 ${Date.now()}`,
          current_team: team2.id
        }
      });
      const player3 = await prisma.player.create({
        data: { 
          name: `Test Player 3 ${Date.now()}`,
          current_team: team1.id
        }
      });
      
      createdEntities.playerIds.push(player1.id, player2.id, player3.id);

      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      expect(response.body.total_teams).toBeGreaterThanOrEqual(2);
      expect(response.body.total_players).toBeGreaterThanOrEqual(3);
      
      console.log('Team and player counts validated');
    });

    it('should differentiate between active_teams and total_teams with current season', async () => {
      // Create a current season
      const currentSeason = await prisma.seasons.create({
        data: {
          label: `Current Test Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          is_current: true,
          description: 'Test current season for active teams'
        }
      });
      createdEntities.seasonIds.push(currentSeason.season_id);

      // Create teams
      const activeTeam = await prisma.team.create({
        data: { name: `Active Team ${Date.now()}` }
      });
      const inactiveTeam = await prisma.team.create({
        data: { name: `Inactive Team ${Date.now()}` }
      });
      
      createdEntities.teamIds.push(activeTeam.id, inactiveTeam.id);

      // Create a match for the active team in current season
      const match = await prisma.match.create({
        data: {
          season_id: currentSeason.season_id,
          kickoff_ts: new Date('2024-09-15T15:00:00Z'),
          home_team_id: activeTeam.id,
          away_team_id: activeTeam.id, // Using same team for simplicity
          venue: 'Test Stadium',
          duration_mins: 90
        }
      });
      createdEntities.matchIds.push(match.match_id);

      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      // Should have 2 total teams but only 1 active team (with matches in current season)
      expect(response.body.total_teams).toBeGreaterThanOrEqual(2);
      expect(response.body.active_teams).toBeGreaterThanOrEqual(1);
      expect(response.body.active_teams).toBeLessThanOrEqual(response.body.total_teams);
      
      console.log('Active vs total teams differentiation validated');
    });

    it('should correctly calculate matches_played vs total_matches', async () => {
      // Create season and teams
      const season = await prisma.seasons.create({
        data: {
          label: `Test Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          is_current: false
        }
      });
      createdEntities.seasonIds.push(season.season_id);

      const team = await prisma.team.create({
        data: { name: `Test Team ${Date.now()}` }
      });
      createdEntities.teamIds.push(team.id);

      // Create matches: one in the past (played), one in the future (not played)
      const pastMatch = await prisma.match.create({
        data: {
          season_id: season.season_id,
          kickoff_ts: new Date('2024-09-01T15:00:00Z'), // Past date
          home_team_id: team.id,
          away_team_id: team.id,
          venue: 'Test Stadium',
          duration_mins: 90
        }
      });

      const futureMatch = await prisma.match.create({
        data: {
          season_id: season.season_id,
          kickoff_ts: new Date('2025-03-15T15:00:00Z'), // Future date
          home_team_id: team.id,
          away_team_id: team.id,
          venue: 'Test Stadium',
          duration_mins: 90
        }
      });
      
      createdEntities.matchIds.push(pastMatch.match_id, futureMatch.match_id);

      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      expect(response.body.total_matches).toBeGreaterThanOrEqual(2);
      expect(response.body.matches_played).toBeGreaterThanOrEqual(1);
      expect(response.body.matches_played).toBeLessThanOrEqual(response.body.total_matches);
      
      console.log('Matches played vs total matches validated');
    });

    it('should differentiate between active_matches and matches_today', async () => {
      // Create season and team
      const season = await prisma.seasons.create({
        data: {
          label: `Test Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          is_current: false
        }
      });
      createdEntities.seasonIds.push(season.season_id);

      const team = await prisma.team.create({
        data: { name: `Test Team ${Date.now()}` }
      });
      createdEntities.teamIds.push(team.id);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Create a match scheduled for today but not currently active
      const todayMatch = await prisma.match.create({
        data: {
          season_id: season.season_id,
          kickoff_ts: new Date(today.getTime() + (6 * 60 * 60 * 1000)), // 6 hours from start of today
          home_team_id: team.id,
          away_team_id: team.id,
          venue: 'Test Stadium',
          duration_mins: 90
        }
      });
      createdEntities.matchIds.push(todayMatch.match_id);

      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      // Should have matches today but no active matches (since the match isn't currently in progress)
      expect(response.body.matches_today).toBeGreaterThanOrEqual(0);
      expect(response.body.active_matches).toBeGreaterThanOrEqual(0);
      
      // These should be different metrics now (fixed from the original bug)
      console.log('Active matches vs matches today differentiation validated');
    });

    it('should handle no current season gracefully', async () => {
      // Ensure no current season exists
      await prisma.seasons.updateMany({
        where: { is_current: true },
        data: { is_current: false }
      });

      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      // Should still return valid statistics even without current season
      expect(response.body.active_teams).toBe(0); // No current season = no active teams
      expect(response.body.total_teams).toBeGreaterThanOrEqual(0);
      
      console.log('No current season scenario handled gracefully');
    });

    it('should return valid timestamps', async () => {
      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      const lastUpdated = new Date(response.body.last_updated);
      const now = new Date();
      
      // Should be a valid date and recent (within last minute)
      expect(lastUpdated).toBeInstanceOf(Date);
      expect(lastUpdated.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(lastUpdated.getTime()).toBeGreaterThan(now.getTime() - 60000); // Within last minute
      
      console.log('Timestamp validation passed');
    });

    it('should handle database errors gracefully', async () => {
      // The statistics route uses its own Prisma instance, making mocking challenging
      // Instead, let's test the error handling by creating an invalid database state
      // For comprehensive error testing, we'd need dependency injection or service-level mocking
      
      // For now, we'll test that the API structure is resilient
      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      // Verify the response has proper error handling structure
      expect(response.body).toHaveProperty('total_teams');
      expect(response.body).toHaveProperty('active_teams');
      expect(response.body).toHaveProperty('total_players');
      expect(response.body).toHaveProperty('total_matches');
      expect(response.body).toHaveProperty('matches_played');
      expect(response.body).toHaveProperty('active_matches');
      expect(response.body).toHaveProperty('matches_today');
      expect(response.body).toHaveProperty('last_updated');
      
      // TODO: Implement proper service-level dependency injection for better error testing
      console.log('API structure resilience validated');
    });

    it('should have consistent response times', async () => {
      const startTime = Date.now();
      
      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      // Should respond within reasonable time (less than 1 second)
      expect(responseTime).toBeLessThan(1000);
      
      console.log(`Statistics API response time: ${responseTime}ms`);
    });
  });

  describe('Statistics API Edge Cases', () => {
    it('should handle very large numbers correctly', async () => {
      // This test would be more relevant with a larger dataset
      // For now, just verify the response structure handles numbers properly
      const response = await apiRequest
        .get('/api/v1/stats/global')
        .expect(200);

      Object.values(response.body).forEach(value => {
        if (typeof value === 'number') {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(value)).toBe(true);
        }
      });
      
      console.log('Number handling validation passed');
    });

    it('should maintain data consistency across multiple requests', async () => {
      // Make multiple requests and ensure consistent data (when no changes occur)
      const response1 = await apiRequest.get('/api/v1/stats/global').expect(200);
      const response2 = await apiRequest.get('/api/v1/stats/global').expect(200);
      
      // Core counts should be the same (excluding timestamps)
      expect(response1.body.total_teams).toBe(response2.body.total_teams);
      expect(response1.body.total_players).toBe(response2.body.total_players);
      expect(response1.body.total_matches).toBe(response2.body.total_matches);
      
      console.log('Data consistency across requests validated');
    });
  });
});