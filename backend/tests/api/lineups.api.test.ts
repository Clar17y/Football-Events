/**
 * Lineups API Integration Tests
 * 
 * Tests the complete Lineups API functionality including CRUD operations,
 * composite key handling, batch operations, and real-time sync capabilities.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { setupApiTests, getApiTestSetup } from './setup';
import { testForeignKeyConstraints, createForeignKeyTestConfigs } from './shared-validation-patterns';

// Setup API testing infrastructure
const getSetup = setupApiTests();

describe('Lineups API Integration', () => {
  let apiRequest: any;
  let testData: {
    teamId: string;
    seasonId: string;
    positionCode: string;
    matchId: string;
    playerId1: string;
    playerId2: string;
    lineupEntries: Array<{ matchId: string; playerId: string; startMinute: number }>;
  };

  beforeEach(async () => {
    const setup = getSetup();
    apiRequest = setup.createTrackedRequest();
    
    // Create test data
    console.log('Creating test data for lineups...');
    
    // Create season
    const seasonResponse = await apiRequest
      .post('/api/v1/seasons')
      .send({
        label: `Test Season ${Date.now()}`,
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })
      .expect(201);
    
    // Create team
    const teamResponse = await apiRequest
      .post('/api/v1/teams')
      .send({
        name: `Test Team ${Date.now()}`,
        homeColor: '#FF0000',
        awayColor: '#0000FF'
      })
      .expect(201);
    
    // Create position
    const positionResponse = await apiRequest
      .post('/api/v1/positions')
      .send({
        code: `T${Date.now().toString().slice(-6)}`, // Keep under 10 chars
        longName: 'Test Position'
      })
      .expect(201);
    
    // Create players
    const player1Response = await apiRequest
      .post('/api/v1/players')
      .send({
        name: `Test Player 1 ${Date.now()}`,
        squadNumber: 1,
        currentTeam: teamResponse.body.id
      })
      .expect(201);
    
    const player2Response = await apiRequest
      .post('/api/v1/players')
      .send({
        name: `Test Player 2 ${Date.now()}`,
        squadNumber: 2,
        currentTeam: teamResponse.body.id
      })
      .expect(201);
    
    // Create match
    const matchResponse = await apiRequest
      .post('/api/v1/matches')
      .send({
        homeTeamId: teamResponse.body.id,
        awayTeamId: teamResponse.body.id,
        seasonId: seasonResponse.body.id,
        kickoffTime: '2024-06-15T15:00:00Z',
        venue: 'Test Stadium'
      })
      .expect(201);
    
    testData = {
      teamId: teamResponse.body.id,
      seasonId: seasonResponse.body.id,
      positionCode: positionResponse.body.code,
      matchId: matchResponse.body.id,
      playerId1: player1Response.body.id,
      playerId2: player2Response.body.id,
      lineupEntries: []
    };
    
    // Track created entities for cleanup
    const apiSetup = getSetup();
    apiSetup.trackCreatedEntity('teams', testData.teamId);
    apiSetup.trackCreatedEntity('seasons', testData.seasonId);
    apiSetup.trackCreatedEntity('positions', testData.positionCode);
    apiSetup.trackCreatedEntity('matches', testData.matchId);
    apiSetup.trackCreatedEntity('players', testData.playerId1);
    apiSetup.trackCreatedEntity('players', testData.playerId2);
    
    console.log(`Test data created: match=${testData.matchId.slice(0, 8)}, players=${testData.playerId1.slice(0, 8)},${testData.playerId2.slice(0, 8)}`);
  });

  afterEach(async () => {
    // Clean up lineup entries
    if (testData && testData.lineupEntries) {
      for (const entry of testData.lineupEntries) {
        try {
          await apiRequest
            .delete(`/api/v1/lineups/${entry.matchId}/${entry.playerId}/${entry.startMinute}`)
            .expect(204);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
    console.log('Lineups test data cleaned up successfully');
  });

  describe('POST /api/v1/lineups', () => {
    it('should create a lineup entry successfully', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      expect(response.body).toMatchObject({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      });
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      console.log('Lineup entry created successfully');
    });

    it('should create a substitution scenario', async () => {
      // Player starts the match
      const startingLineup = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 60,
        position: testData.positionCode
      };
      
      const startResponse = await apiRequest
        .post('/api/v1/lineups')
        .send(startingLineup)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      // Substitute comes on
      const substituteLineup = {
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 60,
        endMinute: 90,
        position: testData.positionCode
      };
      
      const subResponse = await apiRequest
        .post('/api/v1/lineups')
        .send(substituteLineup)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 60
      });
      
      expect(startResponse.body.endMinute).toBe(60);
      expect(subResponse.body.startMinute).toBe(60);
      
      console.log('Substitution scenario created successfully');
    });

    it('should validate required fields', async () => {
      const invalidLineup = {
        matchId: testData.matchId,
        // Missing playerId, startMinute, position
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups')
        .send(invalidLineup)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working: Validation Error');
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate foreign key constraints', async () => {
      const config = createForeignKeyTestConfigs.lineups();
      await testForeignKeyConstraints(apiRequest, config);
    });
  });

  describe('GET /api/v1/lineups', () => {
    it('should return paginated lineups', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get('/api/v1/lineups')
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination.total).toBeGreaterThan(0);
      
      console.log(`Pagination working, total lineups: ${response.body.pagination.total}`);
    });

    it('should filter lineups by match', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get(`/api/v1/lineups?matchId=${testData.matchId}`)
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].matchId).toBe(testData.matchId);
      
      console.log(`Match filtering working, found lineups: ${response.body.data.length}`);
    });

    it('should filter lineups by player', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get(`/api/v1/lineups?playerId=${testData.playerId1}`)
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].playerId).toBe(testData.playerId1);
      
      console.log(`Player filtering working, found lineups: ${response.body.data.length}`);
    });
  });

  describe('POST /api/v1/lineups/batch - Critical for Real-Time', () => {
    // ENABLED: Batch operations endpoint is fully implemented and working
    it('should handle batch lineup operations', async () => {
      const batchData = {
        create: [
          {
            matchId: testData.matchId,
            playerId: testData.playerId1,
            startMinute: 0,
            endMinute: 45,
            position: testData.positionCode
          },
          {
            matchId: testData.matchId,
            playerId: testData.playerId2,
            startMinute: 45,
            endMinute: 90,
            position: testData.positionCode
          }
        ]
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups/batch')
        .send(batchData)
        .expect(200);
      
      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      
      // Track for cleanup
      testData.lineupEntries.push(
        { matchId: testData.matchId, playerId: testData.playerId1, startMinute: 0 },
        { matchId: testData.matchId, playerId: testData.playerId2, startMinute: 45 }
      );
      
      console.log('Batch lineup operations working');
    });
  });

  describe('PUT /api/v1/lineups/:matchId/:playerId/:startMinute', () => {
    // ENABLED: Composite key update operations are fully functional
    it('should update a lineup entry', async () => {
      // Create lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 45,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      // Update the lineup (extend playing time)
      const updateData = {
        endMinute: 90
      };
      
      const response = await apiRequest
        .put(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .send(updateData)
        .expect(200);
      
      expect(response.body.endMinute).toBe(90);
      
      console.log('Lineup update working');
    });
  });

  describe('DELETE /api/v1/lineups/:matchId/:playerId/:startMinute', () => {
    // ENABLED: Composite key delete operations are fully functional
    it('should delete a lineup entry', async () => {
      // Create lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .send(lineupData)
        .expect(201);
      
      // Delete the lineup
      await apiRequest
        .delete(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .expect(204);
      
      // Verify it's deleted
      await apiRequest
        .get(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .expect(404);
      
      console.log('Lineup deletion working');
    });

    // ENABLED: 404 error handling for composite key routes is working properly
    it('should return 404 when deleting non-existent lineup', async () => {
      const nonExistentPlayerId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/lineups/${testData.matchId}/${nonExistentPlayerId}/0`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for lineup deletion');
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple lineup operations', async () => {
      const lineupCount = 3;
      const lineups = Array.from({ length: lineupCount }, (_, i) => ({
        matchId: testData.matchId,
        playerId: i % 2 === 0 ? testData.playerId1 : testData.playerId2,
        startMinute: i * 30, // Different start times
        endMinute: (i + 1) * 30,
        position: testData.positionCode
      }));
      
      const startTime = Date.now();
      
      const promises = lineups.map(lineup =>
        apiRequest.post('/api/v1/lineups').send(lineup)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(201);
        testData.lineupEntries.push({
          matchId: testData.matchId,
          playerId: lineups[i].playerId,
          startMinute: lineups[i].startMinute
        });
      });
      
      const avgTime = totalTime / lineupCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per lineup
      
      console.log(`${lineupCount} lineups created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});