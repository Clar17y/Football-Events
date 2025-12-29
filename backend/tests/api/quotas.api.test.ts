/**
 * Quotas + payload cap integration tests
 *
 * Validates:
 * - Server-authoritative Free vs Premium limits
 * - Clear machine-readable quota errors
 * - Batch payload caps and formation-change validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { AuthTestHelper, type TestUser } from './auth-helpers';
import { randomUUID } from 'crypto';

describe('Quotas + Validation', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let premiumUser: TestUser;
  let freeUser: TestUser;
  const createdUserIds: string[] = [];

  let freeOwnedTeamId: string;
  let freeOpponentTeamId: string;
  let freeSeasonId: string;
  let freeMatchId: string;
  let freePlayerId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });
    await prisma.$connect();
    apiRequest = request(app);
    authHelper = new AuthTestHelper(app);

    premiumUser = await authHelper.createTestUser('USER', 'premium');
    freeUser = await authHelper.createTestUser('USER', 'free');
    createdUserIds.push(premiumUser.id, freeUser.id);

    // Base fixtures for Free user
    const teamRes = await apiRequest
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(freeUser))
      .send({ name: `Free Owned Team ${Date.now()}` })
      .expect(201);
    freeOwnedTeamId = teamRes.body.id;

    const oppRes = await apiRequest
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(freeUser))
      .send({ name: `Opponent ${Date.now()}`, isOpponent: true })
      .expect(201);
    freeOpponentTeamId = oppRes.body.id;

    const seasonRes = await apiRequest
      .post('/api/v1/seasons')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        label: `Free Season ${Date.now()}`,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isCurrent: false,
      })
      .expect(201);
    freeSeasonId = seasonRes.body.id;

    const matchRes = await apiRequest
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        seasonId: freeSeasonId,
        kickoffTime: new Date().toISOString(),
        homeTeamId: freeOwnedTeamId,
        awayTeamId: freeOpponentTeamId,
        durationMinutes: 60,
        periodFormat: 'quarter',
        homeScore: 0,
        awayScore: 0,
      })
      .expect(201);
    freeMatchId = matchRes.body.id;

    const playerRes = await apiRequest
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(freeUser))
      .send({ name: 'Free Player 1' })
      .expect(201);
    freePlayerId = playerRes.body.id;

    await apiRequest
      .post('/api/v1/player-teams')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        playerId: freePlayerId,
        teamId: freeOwnedTeamId,
        startDate: '2024-01-01',
        isActive: true,
      })
      .expect(201);
  });

  afterAll(async () => {
    // Delete most data via team deletion cascades, then remove users.
    try {
      await prisma.team.deleteMany({ where: { created_by_user_id: { in: createdUserIds } } });
    } catch {}
    try {
      await prisma.seasons.deleteMany({ where: { created_by_user_id: { in: createdUserIds } } });
    } catch {}
    try {
      await prisma.player.deleteMany({ where: { created_by_user_id: { in: createdUserIds } } });
    } catch {}
    try {
      await prisma.viewer_links.deleteMany({ where: { created_by_user_id: { in: createdUserIds } } });
    } catch {}
    try {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } catch {}
    await prisma.$disconnect();
  });

  it('GET /api/v1/me/limits returns plan, limits, kinds, features, usage', async () => {
    const freeRes = await apiRequest
      .get('/api/v1/me/limits')
      .set(authHelper.getAuthHeader(freeUser))
      .expect(200);

    expect(freeRes.body).toMatchObject({
      planType: 'free',
      limits: expect.any(Object),
      allowedEventKinds: expect.any(Array),
      features: expect.any(Object),
      usage: expect.any(Object),
    });
    expect(freeRes.body.limits.ownedTeams).toBe(1);
    expect(freeRes.body.features.csvExport).toBe(false);

    const premiumRes = await apiRequest
      .get('/api/v1/me/limits')
      .set(authHelper.getAuthHeader(premiumUser))
      .expect(200);

    expect(premiumRes.body.planType).toBe('premium');
    expect(premiumRes.body.limits.ownedTeams).toBe(5);
    expect(premiumRes.body.features.csvExport).toBe(true);
  });

  it('rejects invalid formation payloads with deterministic 400 + code', async () => {
    const matchId = randomUUID();
    const response = await apiRequest
      .post(`/api/v1/matches/${matchId}/formation-changes`)
      .set(authHelper.getAuthHeader(premiumUser))
      .send({
        startMin: 0,
        formation: {
          players: Array.from({ length: 12 }).map(() => ({
            id: randomUUID(),
            name: 'X',
            position: { x: 50, y: 50 },
          })),
        },
      })
      .expect(400);

    expect(response.body.code).toBe('INVALID_PAYLOAD');
  });

  it('rejects oversized batch payloads (events + lineups) with 400 + code', async () => {
    const tooManyEvents = Array.from({ length: 51 }).map(() => ({
      matchId: freeMatchId,
      kind: 'foul',
      teamId: freeOwnedTeamId,
      playerId: null,
      periodNumber: 1,
      clockMs: 0,
      sentiment: 0,
    }));

    const eventsResp = await apiRequest
      .post('/api/v1/events/batch')
      .set(authHelper.getAuthHeader(premiumUser))
      .send({ create: tooManyEvents })
      .expect(400);

    expect(eventsResp.body.code).toBe('INVALID_PAYLOAD');

    const tooManyLineups = Array.from({ length: 51 }).map((_, idx) => ({
      matchId: freeMatchId,
      playerId: randomUUID(),
      startMinute: idx,
      position: 'CM',
    }));

    const lineupsResp = await apiRequest
      .post('/api/v1/lineups/batch')
      .set(authHelper.getAuthHeader(premiumUser))
      .send({ create: tooManyLineups })
      .expect(400);

    expect(lineupsResp.body.code).toBe('INVALID_PAYLOAD');
  });

  it('enforces Free owned team quota (1 owned team)', async () => {
    const response = await apiRequest
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(freeUser))
      .send({ name: `Second Owned Team ${Date.now()}` })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'ownedTeams',
      planType: 'free',
    });
  });

  it('enforces Free seasons quota (5 seasons)', async () => {
    // Already have 1 season; seed 4 more directly for speed.
    const base = Date.now();
    await prisma.seasons.createMany({
      data: Array.from({ length: 4 }).map((_, idx) => ({
        label: `Seed Season ${base}-${idx}`,
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_current: false,
        created_by_user_id: freeUser.id,
        is_deleted: false,
      })),
    });

    const response = await apiRequest
      .post('/api/v1/seasons')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        label: `Season Over Limit ${Date.now()}`,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        isCurrent: false,
      })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'seasons',
      planType: 'free',
    });
  });

  it('enforces Free matches-per-season quota (30 matches)', async () => {
    // Already have 1 match; seed 29 more directly.
    const kickoffBase = Date.now();
    await prisma.match.createMany({
      data: Array.from({ length: 29 }).map((_, idx) => ({
        season_id: freeSeasonId,
        kickoff_ts: new Date(kickoffBase + idx * 60_000),
        home_team_id: freeOwnedTeamId,
        away_team_id: freeOpponentTeamId,
        duration_mins: 60,
        period_format: 'quarter',
        home_score: 0,
        away_score: 0,
        created_by_user_id: freeUser.id,
        is_deleted: false,
      })),
    });

    const response = await apiRequest
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        seasonId: freeSeasonId,
        kickoffTime: new Date(kickoffBase + 999_000).toISOString(),
        homeTeamId: freeOwnedTeamId,
        awayTeamId: freeOpponentTeamId,
        durationMinutes: 60,
        periodFormat: 'quarter',
        homeScore: 0,
        awayScore: 0,
      })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'matchesPerSeason',
      planType: 'free',
    });
  });

  it('enforces Free players-per-owned-team quota (20 active players)', async () => {
    // Already have 1 active player in the team; seed 19 more.
    for (let i = 0; i < 19; i++) {
      const player = await prisma.player.create({
        data: {
          name: `Seed Player ${Date.now()}-${i}`,
          created_by_user_id: freeUser.id,
          is_deleted: false,
        },
        select: { id: true },
      });
      await prisma.player_teams.create({
        data: {
          player_id: player.id,
          team_id: freeOwnedTeamId,
          start_date: new Date('2024-01-01'),
          is_active: true,
          created_by_user_id: freeUser.id,
          is_deleted: false,
        },
      });
    }

    const extraPlayer = await prisma.player.create({
      data: {
        name: `Overflow Player ${Date.now()}`,
        created_by_user_id: freeUser.id,
        is_deleted: false,
      },
      select: { id: true },
    });

    const response = await apiRequest
      .post('/api/v1/player-teams')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        playerId: extraPlayer.id,
        teamId: freeOwnedTeamId,
        startDate: '2024-01-01',
        isActive: true,
      })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'playersPerOwnedTeam',
      planType: 'free',
    });
  });

  it('enforces Free events-per-match quota (40 non-scoring; goals excluded)', async () => {
    await prisma.event.createMany({
      data: Array.from({ length: 40 }).map((_, idx) => ({
        match_id: freeMatchId,
        kind: 'foul',
        team_id: freeOwnedTeamId,
        player_id: null,
        period_number: 1,
        clock_ms: idx,
        sentiment: 0,
        created_by_user_id: freeUser.id,
        is_deleted: false,
      })),
    });

    await apiRequest
      .post('/api/v1/events')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        matchId: freeMatchId,
        kind: 'goal',
        teamId: freeOwnedTeamId,
        playerId: null,
        periodNumber: 1,
        clockMs: 5000,
      })
      .expect(201);

    const response = await apiRequest
      .post('/api/v1/events')
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        matchId: freeMatchId,
        kind: 'foul',
        teamId: freeOwnedTeamId,
        playerId: null,
        periodNumber: 1,
        clockMs: 5001,
      })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'eventsPerMatch',
      planType: 'free',
    });
  });

  it('enforces Free formation changes quota (5 per match)', async () => {
    await prisma.event.createMany({
      data: Array.from({ length: 5 }).map((_, idx) => ({
        match_id: freeMatchId,
        kind: 'formation_change',
        team_id: freeOwnedTeamId,
        player_id: null,
        period_number: 1,
        clock_ms: 10_000 + idx,
        sentiment: 0,
        created_by_user_id: freeUser.id,
        is_deleted: false,
      })),
    });

    const response = await apiRequest
      .post(`/api/v1/matches/${freeMatchId}/formation-changes`)
      .set(authHelper.getAuthHeader(freeUser))
      .send({
        startMin: 1,
        formation: {
          players: [
            {
              id: freePlayerId,
              name: 'Free Player 1',
              position: { x: 50, y: 50 },
            },
          ],
        },
        reason: 'Test',
      })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'formationChangesPerMatch',
      planType: 'free',
    });
  });

  it('enforces Free share link quota (1 active link)', async () => {
    await apiRequest
      .post(`/api/v1/matches/${freeMatchId}/share`)
      .set(authHelper.getAuthHeader(freeUser))
      .send({ expiresInMinutes: 60 })
      .expect(200);

    const response = await apiRequest
      .post(`/api/v1/matches/${freeMatchId}/share`)
      .set(authHelper.getAuthHeader(freeUser))
      .send({ expiresInMinutes: 60 })
      .expect(402);

    expect(response.body.code).toBe('QUOTA_EXCEEDED');
    expect(response.body.details).toMatchObject({
      entity: 'activeShareLinks',
      planType: 'free',
    });
  });
});

