import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NaturalKeyResolver, NaturalKeyResolverError } from '../../src/utils/naturalKeyResolver';
import { randomUUID } from 'crypto';

describe('NaturalKeyResolver', () => {
  let prisma: PrismaClient;
  let resolver: NaturalKeyResolver;
  let testUserId: string;
  let otherUserId: string;
  let testData: {
    teamId: string;
    team2Id: string;
    playerId: string;
    player2Id: string;
    seasonId: string;
    matchId: string;
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
    resolver = new NaturalKeyResolver();
    
    testUserId = randomUUID();
    otherUserId = randomUUID();

    // Create test users
    await prisma.user.createMany({
      data: [
        {
          id: testUserId,
          email: 'test@example.com',
          password_hash: 'hash',
          first_name: 'Test',
          last_name: 'User',
          role: 'USER'
        },
        {
          id: otherUserId,
          email: 'other@example.com',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'User',
          role: 'USER'
        }
      ]
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.match.deleteMany({
      where: { created_by_user_id: { in: [testUserId, otherUserId] } }
    });
    await prisma.seasons.deleteMany({
      where: { created_by_user_id: { in: [testUserId, otherUserId] } }
    });
    await prisma.player.deleteMany({
      where: { created_by_user_id: { in: [testUserId, otherUserId] } }
    });
    await prisma.team.deleteMany({
      where: { created_by_user_id: { in: [testUserId, otherUserId] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, otherUserId] } }
    });
    
    await resolver.disconnect();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create fresh test data for each test
    testData = {
      teamId: randomUUID(),
      team2Id: randomUUID(),
      playerId: randomUUID(),
      player2Id: randomUUID(),
      seasonId: randomUUID(),
      matchId: randomUUID()
    };

    // Create teams
    await prisma.team.createMany({
      data: [
        {
          id: testData.teamId,
          name: 'Arsenal FC',
          created_by_user_id: testUserId
        },
        {
          id: testData.team2Id,
          name: 'Chelsea FC',
          created_by_user_id: testUserId
        }
      ]
    });

    // Create players
    await prisma.player.createMany({
      data: [
        {
          id: testData.playerId,
          name: 'John Smith',
          created_by_user_id: testUserId
        },
        {
          id: testData.player2Id,
          name: 'Jane Doe',
          created_by_user_id: testUserId
        }
      ]
    });

    // Create season
    await prisma.seasons.create({
      data: {
        season_id: testData.seasonId,
        label: '2024-25 Season',
        start_date: new Date('2024-08-01'),
        end_date: new Date('2025-05-31'),
        created_by_user_id: testUserId
      }
    });

    // Create match
    await prisma.match.create({
      data: {
        match_id: testData.matchId,
        season_id: testData.seasonId,
        home_team_id: testData.teamId,
        away_team_id: testData.team2Id,
        kickoff_ts: new Date('2024-09-15T15:00:00Z'),
        created_by_user_id: testUserId
      }
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await prisma.match.deleteMany({
      where: { created_by_user_id: testUserId }
    });
    await prisma.seasons.deleteMany({
      where: { created_by_user_id: testUserId }
    });
    await prisma.player.deleteMany({
      where: { created_by_user_id: testUserId }
    });
    await prisma.team.deleteMany({
      where: { created_by_user_id: testUserId }
    });
  });

  describe('Player Resolution', () => {
    it('should resolve player by name', async () => {
      const playerId = await resolver.resolvePlayerByName('John Smith', testUserId, 'USER');
      expect(playerId).toBe(testData.playerId);
    });

    it('should be case insensitive', async () => {
      const playerId = await resolver.resolvePlayerByName('john smith', testUserId, 'USER');
      expect(playerId).toBe(testData.playerId);
    });

    it('should throw error for non-existent player', async () => {
      await expect(
        resolver.resolvePlayerByName('Non Existent', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });

    it('should throw error for access denied', async () => {
      await expect(
        resolver.resolvePlayerByName('John Smith', otherUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });

    it('should resolve multiple players', async () => {
      const resolved = await resolver.resolveMultiplePlayers(['John Smith', 'Jane Doe'], testUserId, 'USER');
      
      expect(resolved).toHaveLength(2);
      expect(resolved[0].playerId).toBe(testData.playerId);
      expect(resolved[0].playerName).toBe('John Smith');
      expect(resolved[1].playerId).toBe(testData.player2Id);
      expect(resolved[1].playerName).toBe('Jane Doe');
    });
  });

  describe('Team Resolution', () => {
    it('should resolve team by name', async () => {
      const teamId = await resolver.resolveTeamByName('Arsenal FC', testUserId, 'USER');
      expect(teamId).toBe(testData.teamId);
    });

    it('should be case insensitive', async () => {
      const teamId = await resolver.resolveTeamByName('arsenal fc', testUserId, 'USER');
      expect(teamId).toBe(testData.teamId);
    });

    it('should throw error for non-existent team', async () => {
      await expect(
        resolver.resolveTeamByName('Non Existent FC', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });

    it('should resolve multiple teams', async () => {
      const resolved = await resolver.resolveMultipleTeams(['Arsenal FC', 'Chelsea FC'], testUserId, 'USER');
      
      expect(resolved).toHaveLength(2);
      expect(resolved[0].teamId).toBe(testData.teamId);
      expect(resolved[0].teamName).toBe('Arsenal FC');
      expect(resolved[1].teamId).toBe(testData.team2Id);
      expect(resolved[1].teamName).toBe('Chelsea FC');
    });
  });

  describe('Season Resolution', () => {
    it('should resolve season by label', async () => {
      const seasonId = await resolver.resolveSeasonByLabel('2024-25 Season', testUserId, 'USER');
      expect(seasonId).toBe(testData.seasonId);
    });

    it('should be case insensitive', async () => {
      const seasonId = await resolver.resolveSeasonByLabel('2024-25 season', testUserId, 'USER');
      expect(seasonId).toBe(testData.seasonId);
    });

    it('should throw error for non-existent season', async () => {
      await expect(
        resolver.resolveSeasonByLabel('Non Existent Season', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });
  });

  describe('Match Resolution', () => {
    it('should resolve match by teams and time', async () => {
      const matchId = await resolver.resolveMatchByTeamsAndTime(
        'Arsenal FC',
        'Chelsea FC',
        '2024-09-15T15:00:00Z',
        testUserId,
        'USER'
      );
      expect(matchId).toBe(testData.matchId);
    });

    it('should throw error for invalid date format', async () => {
      await expect(
        resolver.resolveMatchByTeamsAndTime('Arsenal FC', 'Chelsea FC', 'invalid-date', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });

    it('should throw error for non-existent match', async () => {
      await expect(
        resolver.resolveMatchByTeamsAndTime('Arsenal FC', 'Chelsea FC', '2025-01-01T15:00:00Z', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });
  });

  describe('Combined Player-Team Resolution', () => {
    it('should resolve player-team keys', async () => {
      const resolved = await resolver.resolvePlayerTeamKeys('John Smith', 'Arsenal FC', testUserId, 'USER');
      
      expect(resolved.playerId).toBe(testData.playerId);
      expect(resolved.teamId).toBe(testData.teamId);
      expect(resolved.playerName).toBe('John Smith');
      expect(resolved.teamName).toBe('Arsenal FC');
    });

    it('should resolve multiple player-team keys', async () => {
      const requests = [
        { playerName: 'John Smith', teamName: 'Arsenal FC' },
        { playerName: 'Jane Doe', teamName: 'Chelsea FC' }
      ];

      const resolved = await resolver.resolveMultiplePlayerTeamKeys(requests, testUserId, 'USER');
      
      expect(resolved).toHaveLength(2);
      expect(resolved[0].playerId).toBe(testData.playerId);
      expect(resolved[0].teamId).toBe(testData.teamId);
      expect(resolved[1].playerId).toBe(testData.player2Id);
      expect(resolved[1].teamId).toBe(testData.team2Id);
    });
  });

  describe('Utility Methods', () => {
    it('should detect natural keys', () => {
      expect(NaturalKeyResolver.hasNaturalKeys({ playerName: 'John' })).toBe(true);
      expect(NaturalKeyResolver.hasNaturalKeys({ teamName: 'Arsenal' })).toBe(true);
      expect(NaturalKeyResolver.hasNaturalKeys({ seasonLabel: '2024-25' })).toBe(true);
      expect(NaturalKeyResolver.hasNaturalKeys({ playerId: 'uuid' })).toBe(false);
    });

    it('should validate UUIDs', () => {
      expect(NaturalKeyResolver.isUUID('12345678-1234-1234-1234-123456789012')).toBe(true);
      expect(NaturalKeyResolver.isUUID('not-a-uuid')).toBe(false);
      expect(NaturalKeyResolver.isUUID('John Smith')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should create duplicate players and throw multiple matches error', async () => {
      // Create another player with the same name
      await prisma.player.create({
        data: {
          id: randomUUID(),
          name: 'John Smith',
          created_by_user_id: testUserId
        }
      });

      await expect(
        resolver.resolvePlayerByName('John Smith', testUserId, 'USER')
      ).rejects.toThrow('Multiple players found');
    });

    it('should provide detailed error information', async () => {
      try {
        await resolver.resolvePlayerByName('Non Existent', testUserId, 'USER');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(NaturalKeyResolverError);
        expect((error as NaturalKeyResolverError).code).toBe('NOT_FOUND');
        expect((error as NaturalKeyResolverError).entity).toBe('Player');
        expect((error as NaturalKeyResolverError).searchCriteria).toEqual({ playerName: 'Non Existent' });
      }
    });
  });

  describe('Admin Access', () => {
    it('should allow admin to access all entities', async () => {
      // Create a player owned by another user
      const adminPlayerId = randomUUID();
      await prisma.player.create({
        data: {
          id: adminPlayerId,
          name: 'Admin Player',
          created_by_user_id: otherUserId
        }
      });

      // Admin should be able to resolve it
      const playerId = await resolver.resolvePlayerByName('Admin Player', testUserId, 'ADMIN');
      expect(playerId).toBe(adminPlayerId);

      // Regular user should not
      await expect(
        resolver.resolvePlayerByName('Admin Player', testUserId, 'USER')
      ).rejects.toThrow(NaturalKeyResolverError);
    });
  });
});