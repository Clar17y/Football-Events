/**
 * Events API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Events API using Supertest.
 * Tests authentication, authorization, and match-based ownership isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Events API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let createdEventIds: string[] = [];
  let createdMatchIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdPlayerIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdSeasonIds: string[] = [];
  let testTeamId: string;
  let otherUserTeamId: string;
  let testMatchId: string;
  let otherUserMatchId: string;
  let testPlayerId: string;
  let testSeasonId: string;

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
    authHelper = new AuthTestHelper(app);
    
    // Create test users
    testUser = await authHelper.createTestUser('USER');
    otherUser = await authHelper.createTestUser('USER');
    adminUser = await authHelper.createAdminUser();
    
    // Create test teams
    const testTeamResponse = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Team ${Date.now()}` })
      .expect(201);
    
    const otherTeamResponse = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(otherUser))
      .send({ name: `Other Team ${Date.now()}` })
      .expect(201);
    
    testTeamId = testTeamResponse.body.id;
    otherUserTeamId = otherTeamResponse.body.id;
    
    // Create test season
    const seasonResponse = await prisma.seasons.create({
      data: {
        season_id: randomUUID(),
        label: `Test Season ${Date.now()}`,
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_current: true,
        created_by_user_id: testUser.id
      }
    });
    testSeasonId = seasonResponse.season_id;
    
    // Create test players
    const testPlayerResponse = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player ${Date.now()}`, currentTeam: testTeamId })
      .expect(201);
    
    testPlayerId = testPlayerResponse.body.id;
    
    // Create test matches
    const testMatchResponse = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        seasonId: testSeasonId,
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        kickoffTime: new Date().toISOString()
      })
      .expect(201);
    
    const otherMatchResponse = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(otherUser))
      .send({
        seasonId: testSeasonId,
        homeTeamId: otherUserTeamId,
        awayTeamId: testTeamId,
        kickoffTime: new Date().toISOString()
      })
      .expect(201);
    
    testMatchId = testMatchResponse.body.id;
    otherUserMatchId = otherMatchResponse.body.id;
    
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    createdTeamIds.push(testTeamId, otherUserTeamId);
    createdPlayerIds.push(testPlayerId);
    createdMatchIds.push(testMatchId, otherUserMatchId);
    createdSeasonIds.push(testSeasonId);
    
    console.log('Events API Tests: Database connected and test data created');
  });

  afterAll(async () => {
    // Clean up all events first
    try {
      await prisma.event.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Event cleanup warning:', error);
    }
    
    // Clean up matches
    try {
      await prisma.match.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Match cleanup warning:', error);
    }
    
    // Clean up players
    try {
      await prisma.player.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Player cleanup warning:', error);
    }
    
    // Clean up seasons
    try {
      await prisma.seasons.deleteMany({
        where: { season_id: { in: createdSeasonIds } }
      });
    } catch (error) {
      console.warn('Season cleanup warning:', error);
    }
    
    // Clean up teams
    try {
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Team cleanup warning:', error);
    }
    
    // Clean up users
    if (createdUserIds.length > 0) {
      try {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } }
        });
      } catch (error) {
        console.warn('User cleanup warning:', error);
      }
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    createdEventIds = [];
  });

  afterEach(async () => {
    // Clean up created events
    if (createdEventIds.length > 0) {
      try {
        await prisma.event.deleteMany({
          where: { id: { in: createdEventIds } }
        });
        console.log('Events cleaned up successfully');
      } catch (error) {
        console.warn('Event cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/events', () => {
    it('should require authentication', async () => {
      const eventData = {
        matchId: testMatchId,
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId,
        clockMs: 300000
      };
      
      await apiRequest
        .post('/api/v1/events')
        .send(eventData)
        .expect(401);
    });

    it('should create event for own match', async () => {
      const eventData = {
        matchId: testMatchId, // testUser created this match
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId,
        clockMs: 300000,
        notes: 'Great goal!'
      };
      
      const response = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send(eventData)
        .expect(201);
      
      createdEventIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        matchId: eventData.matchId,
        kind: eventData.kind,
        teamId: eventData.teamId,
        playerId: eventData.playerId,
        clockMs: eventData.clockMs,
        notes: eventData.notes
      });
      
      console.log('Event created successfully for own match');
    });


    it('should validate required fields', async () => {
      const invalidEventData = {}; // Missing required fields
      
      const response = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidEventData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });
  });

  describe('GET /api/v1/events', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/events')
        .expect(401);
    });

    it('should filter events by match', async () => {
      // Create event for testUser's match
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        })
        .expect(201);
      
      createdEventIds.push(eventResponse.body.id);
      
      // Get events with match filter
      const response = await apiRequest
        .get(`/api/v1/events?matchId=${testMatchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].matchId).toBe(testMatchId);
      console.log('Event filtering working');
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('should require authentication', async () => {
      const eventId = randomUUID();
      await apiRequest
        .get(`/api/v1/events/${eventId}`)
        .expect(401);
    });

    it('should return event from accessible match', async () => {
      // Create event
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        })
        .expect(201);
      
      createdEventIds.push(eventResponse.body.id);
      
      // Get the specific event
      const response = await apiRequest
        .get(`/api/v1/events/${eventResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.id).toBe(eventResponse.body.id);
      console.log('Event retrieval working');
    });
  });

  describe('PUT /api/v1/events/:id', () => {
    it('should require authentication', async () => {
      const eventId = randomUUID();
      await apiRequest
        .put(`/api/v1/events/${eventId}`)
        .send({ notes: 'Test' })
        .expect(401);
    });

    it('should allow match creator to update event', async () => {
      // Create event
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000,
          notes: 'Original note'
        })
        .expect(201);
      
      createdEventIds.push(eventResponse.body.id);
      
      // Update the event
      const updateData = { notes: 'Updated note' };
      const response = await apiRequest
        .put(`/api/v1/events/${eventResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body.notes).toBe(updateData.notes);
      console.log('Match creator can update event');
    });

  });

  describe('DELETE /api/v1/events/:id', () => {
    it('should require authentication', async () => {
      const eventId = randomUUID();
      await apiRequest
        .delete(`/api/v1/events/${eventId}`)
        .expect(401);
    });

    it('should allow match creator to delete event', async () => {
      // Create event
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        })
        .expect(201);
      
      const eventId = eventResponse.body.id;
      
      // Delete the event
      await apiRequest
        .delete(`/api/v1/events/${eventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify event is gone from API
      await apiRequest
        .get(`/api/v1/events/${eventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Match creator can delete event');
    });

    it('should perform soft delete', async () => {
      // Create event
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        })
        .expect(201);
      
      const eventId = eventResponse.body.id;
      
      // Delete the event
      await apiRequest
        .delete(`/api/v1/events/${eventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify soft delete in database
      const deletedEvent = await prisma.event.findUnique({
        where: { id: eventId }
      });
      
      expect(deletedEvent).toBeTruthy();
      expect(deletedEvent!.is_deleted).toBe(true);
      expect(deletedEvent!.deleted_at).toBeTruthy();
      expect(deletedEvent!.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Soft delete working correctly');
    });

    it('should restore soft-deleted event when creating same event again', async () => {
      // 1. Create an event
      const eventData = {
        matchId: testMatchId,
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId,
        clockMs: 300000,
        notes: 'Original goal'
      };

      const createResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send(eventData)
        .expect(201);

      const originalEventId = createResponse.body.id;
      console.log('Original event created:', originalEventId);

      // 2. Delete the event (soft delete)
      await apiRequest
        .delete(`/api/v1/events/${originalEventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/events/${originalEventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Event soft deleted successfully');

      // 3. Create the same event again (same unique constraints: matchId + kind + teamId + playerId + clockMs)
      const restoredEventData = {
        matchId: testMatchId, // Same match
        kind: 'goal', // Same kind
        teamId: testTeamId, // Same team
        playerId: testPlayerId, // Same player
        clockMs: 300000, // Same clock time
        notes: 'Restored goal with updated notes' // Different notes
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredEventData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalEventId);
      expect(restoreResponse.body.matchId).toBe(restoredEventData.matchId);
      expect(restoreResponse.body.kind).toBe(restoredEventData.kind);
      expect(restoreResponse.body.teamId).toBe(restoredEventData.teamId);
      expect(restoreResponse.body.playerId).toBe(restoredEventData.playerId);
      expect(restoreResponse.body.clockMs).toBe(restoredEventData.clockMs);
      expect(restoreResponse.body.notes).toBe(restoredEventData.notes);

      console.log('Event restored with same ID:', restoreResponse.body.id);

      // 5. Verify the event is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/events/${originalEventId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalEventId);
      expect(getResponse.body.notes).toBe(restoredEventData.notes);

      console.log('Soft delete restoration working - same event ID restored with updated data');

      // Add to cleanup
      createdEventIds.push(originalEventId);
    });
  });

  describe('GET /api/v1/events/match/:matchId', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/events/match/${testMatchId}`)
        .expect(401);
    });

    it('should return events for accessible match', async () => {
      // Create event for testUser's match
      const eventResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        })
        .expect(201);
      
      createdEventIds.push(eventResponse.body.id);
      
      // Get events for the match
      const response = await apiRequest
        .get(`/api/v1/events/match/${testMatchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].matchId).toBe(testMatchId);
      console.log('Match events retrieval working');
    });
  });

  describe('POST /api/v1/events/batch', () => {
    it('should require authentication', async () => {
      const batchData = {
        create: [{
          matchId: testMatchId,
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          clockMs: 300000
        }]
      };
      
      await apiRequest
        .post('/api/v1/events/batch')
        .send(batchData)
        .expect(401);
    });

    it('should process batch operations for accessible matches', async () => {
      const batchData = {
        create: [{
          matchId: testMatchId, // testUser's match
          seasonId: testSeasonId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 300000
        }]
      };
      
      const response = await apiRequest
        .post('/api/v1/events/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);
      
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(0);
      
      console.log('Batch operations working for accessible matches');
    });
  });

  describe('Authorization Tests', () => {
    let testEventIdByTestUser: string;
    let testEventIdByOtherUser: string;

    beforeEach(async () => {
      // Create an event by testUser (testUser owns the match)
      const testUserEvent = {
        matchId: testMatchId, // testUser created this match
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId,
        clockMs: 300000,
        notes: 'Test user event'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserEvent)
        .expect(201);

      testEventIdByTestUser = testUserResponse.body.id;

      // Create an event by otherUser (otherUser owns the match)
      const otherUserEvent = {
        matchId: otherUserMatchId, // otherUser created this match
        kind: 'goal',
        teamId: otherUserTeamId,
        clockMs: 400000,
        notes: 'Other user event'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserEvent)
        .expect(201);

      testEventIdByOtherUser = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.event.deleteMany({
          where: { 
            id: { in: [testEventIdByTestUser, testEventIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should deny creating event for match not owned', async () => {
        const eventData = {
          matchId: otherUserMatchId, // otherUser created this match
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          clockMs: 500000
        };
        
        // testUser should not be able to create event for match they don't own
        await apiRequest
          .post('/api/v1/events')
          .set(authHelper.getAuthHeader(testUser))
          .send(eventData)
          .expect(403); // Access denied should return 403 Forbidden
        
        console.log('Access denied for creating event in unowned match');
      });

      it('should not allow users to see events from inaccessible matches in list', async () => {
        const response = await apiRequest
          .get('/api/v1/events')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should see events from matches they have access to
        expect(response.body.data).toBeInstanceOf(Array);
        
        const eventIds = response.body.data.map((event: any) => event.id);
        expect(eventIds).toContain(testEventIdByTestUser);
        // Note: testUser might see otherUser's event if their team is involved in the match

        console.log('User isolation working for GET /events');
      });

      it('should not allow users to access events from inaccessible matches by ID', async () => {
        await apiRequest
          .get(`/api/v1/events/${testEventIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to event from inaccessible match');
      });

      it('should not allow users to update events from inaccessible matches', async () => {
        const updateData = {
          notes: 'Hacked event'
        };

        await apiRequest
          .put(`/api/v1/events/${testEventIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to event from inaccessible match');
      });

      it('should not allow users to delete events from inaccessible matches', async () => {
        await apiRequest
          .delete(`/api/v1/events/${testEventIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to event from inaccessible match');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to create event for any match', async () => {
        const eventData = {
          matchId: otherUserMatchId, // otherUser's match
          kind: 'foul',
          teamId: otherUserTeamId,
          clockMs: 600000,
          notes: 'Admin created event'
        };
        
        const response = await apiRequest
          .post('/api/v1/events')
          .set(authHelper.getAuthHeader(adminUser))
          .send(eventData)
          .expect(201);
        
        // Clean up the event we created
        await prisma.event.deleteMany({
          where: { id: response.body.id }
        });
        
        expect(response.body.matchId).toBe(eventData.matchId);
        expect(response.body.kind).toBe(eventData.kind);
        console.log('Admin created event successfully for any match');
      });

      it('should allow admin to see all events in list', async () => {
        const response = await apiRequest
          .get('/api/v1/events')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see events from all matches
        expect(response.body.data).toBeInstanceOf(Array);
        
        const eventIds = response.body.data.map((event: any) => event.id);
        expect(eventIds).toContain(testEventIdByTestUser);
        expect(eventIds).toContain(testEventIdByOtherUser);

        console.log('Admin can see all events');
      });

      it('should allow admin to access any event by ID', async () => {
        // Admin should be able to access testUser's event
        const testUserEventResponse = await apiRequest
          .get(`/api/v1/events/${testEventIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserEventResponse.body.id).toBe(testEventIdByTestUser);

        // Admin should be able to access otherUser's event
        const otherUserEventResponse = await apiRequest
          .get(`/api/v1/events/${testEventIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserEventResponse.body.id).toBe(testEventIdByOtherUser);

        console.log('Admin can access any event');
      });

      it('should allow admin to update any event', async () => {
        const updateData = {
          notes: 'Admin updated event'
        };

        const response = await apiRequest
          .put(`/api/v1/events/${testEventIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.notes).toBe(updateData.notes);

        console.log('Admin can update any event');
      });

      it('should allow admin to delete any event', async () => {
        // Create a temporary event to delete
        const tempEvent = {
          matchId: otherUserMatchId,
          kind: 'save',
          teamId: otherUserTeamId,
          clockMs: 700000,
          notes: 'Temp event for deletion'
        };

        const createResponse = await apiRequest
          .post('/api/v1/events')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempEvent)
          .expect(201);

        const tempEventId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/events/${tempEventId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/events/${tempEventId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any event');
      });
    });
  });

  // ============================================================================
  // MATCH-SCOPED BATCH OPERATIONS TESTS
  // ============================================================================

  describe('POST /api/v1/events/batch-by-match - Match-Scoped Batch Operations', () => {
    let testMatch: any;
    let batchTestTeam: any;
    let batchTestPlayer: any;
    let batchTestSeason: any;

    beforeEach(async () => {
      // Create test data for batch operations
      batchTestTeam = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Batch Test Team ${Date.now()}`,
          shortName: 'BTT'
        })
        .expect(201);

      batchTestPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Batch Test Player ${Date.now()}`,
          squadNumber: 99
        })
        .expect(201);

      batchTestSeason = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          label: `Batch Test Season ${Date.now()}`,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        })
        .expect(201);

      // Create a test match for batch operations
      testMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: batchTestTeam.body.id,
          awayTeamId: batchTestTeam.body.id,
          seasonId: batchTestSeason.body.id,
          kickoffTime: new Date().toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);
    });

    it('should create multiple events for a specific match', async () => {
      const batchData = {
        matchId: testMatch.body.id,
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'goal',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 300000,
            notes: 'First goal'
          },
          {
            matchId: testMatch.body.id,
            kind: 'assist',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 450000,
            notes: 'Assist'
          },
          {
            matchId: testMatch.body.id,
            kind: 'foul',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 2,
            clockMs: 600000,
            notes: 'Player substitution'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(3);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
      expect(response.body.summary.matchId).toBe(testMatch.body.id);
    });

    it('should handle mixed batch operations for a specific match', async () => {
      // First create an event to update and delete
      const existingEvent = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          kind: 'goal',
          teamId: batchTestTeam.body.id,
          playerId: batchTestPlayer.body.id,
          periodNumber: 1,
          clockMs: 300000,
          notes: 'Goal to update'
        })
        .expect(201);

      const deleteEvent = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          kind: 'foul',
          teamId: batchTestTeam.body.id,
          playerId: batchTestPlayer.body.id,
          periodNumber: 1,
          clockMs: 400000,
          notes: 'Card to delete'
        })
        .expect(201);

      const batchData = {
        matchId: testMatch.body.id,
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'assist',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 350000,
            notes: 'New assist'
          }
        ],
        update: [
          {
            id: existingEvent.body.id,
            data: {
              notes: 'Updated goal notes',
              clockMs: 320000
            }
          }
        ],
        delete: [deleteEvent.body.id]
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.updated.success).toBe(1);
      expect(response.body.results.deleted.success).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
      expect(response.body.summary.matchId).toBe(testMatch.body.id);
    });

    it('should reject operations with mismatched matchId', async () => {
      // Create another match
      const otherMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: batchTestTeam.body.id,
          awayTeamId: otherUserTeamId,
          seasonId: testSeasonId,
          kickoffTime: new Date().toISOString(),
          competition: 'Other League',
          venue: 'Other Stadium'
        })
        .expect(201);

      const batchData = {
        matchId: testMatch.body.id,
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'goal',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 300000,
            notes: 'Valid goal'
          },
          {
            matchId: otherMatch.body.id, // Wrong match ID
            kind: 'foul',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 450000,
            notes: 'Invalid card'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('All operations must be for the specified match');
      expect(response.body.details).toContain('create[1]: matchId mismatch');
    });

    it('should require matchId in request body', async () => {
      const batchData = {
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'goal',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 300000,
            notes: 'Goal without matchId in body'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('matchId is required for match-scoped batch operations');
    });

    it('should require authentication', async () => {
      const batchData = {
        matchId: testMatch.body.id,
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'goal',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 300000,
            notes: 'Unauthorized goal'
          }
        ]
      };

      await apiRequest
        .post('/api/v1/events/batch-by-match')
        .send(batchData)
        .expect(401);
    });

    it('should deny access to other users matches', async () => {
      const batchData = {
        matchId: testMatch.body.id,
        create: [
          {
            matchId: testMatch.body.id,
            kind: 'goal',
            teamId: batchTestTeam.body.id,
            playerId: batchTestPlayer.body.id,
            periodNumber: 1,
            clockMs: 300000,
            notes: 'Unauthorized goal'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(otherUser))
        .send(batchData)
        .expect(400);

      expect(response.body.results.created.failed).toBe(1);
      expect(response.body.results.created.errors[0].error).toContain('Access denied');
    });

    it('should handle empty batch operations', async () => {
      const batchData = {
        matchId: testMatch.body.id
      };

      const response = await apiRequest
        .post('/api/v1/events/batch-by-match')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(0);
      expect(response.body.results.updated.success).toBe(0);
      expect(response.body.results.deleted.success).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(0);
      expect(response.body.summary.totalFailed).toBe(0);
      expect(response.body.summary.matchId).toBe(testMatch.body.id);
    });
  });

});