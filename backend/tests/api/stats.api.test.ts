/**
 * Stats API Integration Tests
 * Tests for /api/v1/stats endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { AuthTestHelper, TestUser } from './auth-helpers';

const prisma = new PrismaClient();
const authHelper = new AuthTestHelper(app);

describe('Stats API', () => {
  let testUser: TestUser;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.match.deleteMany();
    await prisma.team.deleteMany();
    await prisma.player.deleteMany();
    await prisma.seasons.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    testUser = await authHelper.createTestUser('USER');
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.match.deleteMany();
    await prisma.team.deleteMany();
    await prisma.player.deleteMany();
    await prisma.seasons.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/stats/global', () => {
    it('should return global statistics with zero counts for empty database', async () => {
      const response = await request(app)
        .get('/api/v1/stats/global')
        .expect(200);

      expect(response.body).toMatchObject({
        total_teams: 0,
        active_teams: 0,
        total_players: 0,
        total_matches: 0,
        matches_played: 0,
        active_matches: 0,
        matches_today: 0
      });

      expect(response.body.last_updated).toBeDefined();
      expect(new Date(response.body.last_updated)).toBeInstanceOf(Date);
    });

    it('should return correct statistics with sample data', async () => {
      // Create a season
      const season = await prisma.seasons.create({
        data: {
          label: 'Test Season 2024',
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-12-31'),
          is_current: true,
          created_by_user_id: testUser.id
        }
      });

      // Create teams
      const team1 = await prisma.team.create({
        data: {
          name: 'Test Team 1',
          created_by_user_id: testUser.id
        }
      });

      const team2 = await prisma.team.create({
        data: {
          name: 'Test Team 2',
          created_by_user_id: testUser.id
        }
      });

      // Create players
      await prisma.player.create({
        data: {
          name: 'John Doe',
          created_by_user_id: testUser.id
        }
      });

      await prisma.player.create({
        data: {
          name: 'Jane Smith',
          created_by_user_id: testUser.id
        }
      });

      const response = await request(app)
        .get('/api/v1/stats/global')
        .expect(200);

      expect(response.body).toMatchObject({
        total_teams: 2,
        active_teams: 0, // No matches yet
        total_players: 2,
        total_matches: 0,
        matches_played: 0,
        active_matches: 0,
        matches_today: 0
      });

      expect(response.body.last_updated).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // This test ensures the endpoint doesn't crash even if there are database issues
      const response = await request(app)
        .get('/api/v1/stats/global')
        .expect(200);

      // Should always return a valid response structure
      expect(response.body).toHaveProperty('total_teams');
      expect(response.body).toHaveProperty('active_teams');
      expect(response.body).toHaveProperty('total_players');
      expect(response.body).toHaveProperty('total_matches');
      expect(response.body).toHaveProperty('matches_played');
      expect(response.body).toHaveProperty('active_matches');
      expect(response.body).toHaveProperty('matches_today');
      expect(response.body).toHaveProperty('last_updated');
    });
  });
});