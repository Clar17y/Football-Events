import { describe, it, expect, vi } from 'vitest';
import { QuotaService } from '../../src/services/QuotaService';
import {
  eventBatchSchema,
  lineupBatchSchema,
  playerTeamBatchSchema,
  awardBatchSchema,
  matchAwardBatchSchema,
  playerBatchSchema,
  matchFormationChangeSchema,
} from '../../src/validation/schemas';

const UUID_1 = '11111111-1111-1111-1111-111111111111';
const UUID_2 = '22222222-2222-2222-2222-222222222222';
const UUID_3 = '33333333-3333-3333-3333-333333333333';

describe('Validation payload caps', () => {
  it('rejects oversized event batches', () => {
    const create = Array.from({ length: 51 }, () => ({
      matchId: UUID_1,
      kind: 'foul' as const,
      teamId: UUID_2,
    }));

    const result = eventBatchSchema.safeParse({ create });
    expect(result.success).toBe(false);
  });

  it('rejects oversized lineup batches', () => {
    const create = Array.from({ length: 51 }, (_, i) => ({
      matchId: UUID_1,
      playerId: UUID_2,
      startMinute: i,
      position: 'ST',
    }));

    const result = lineupBatchSchema.safeParse({ create });
    expect(result.success).toBe(false);
  });

  it('rejects total batch ops > 50 even if each array <= 50', () => {
    const create = Array.from({ length: 30 }, () => ({
      matchId: UUID_1,
      kind: 'foul' as const,
      teamId: UUID_2,
    }));

    const update = Array.from({ length: 30 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      data: { notes: 'x' },
    }));

    const result = eventBatchSchema.safeParse({ create, update });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Total batch operations'))).toBe(true);
    }
  });

  it('rejects oversized player-team batches', () => {
    const create = Array.from({ length: 51 }, () => ({
      playerId: UUID_1,
      teamId: UUID_2,
      startDate: '2025-01-01',
      isActive: true,
    }));

    const result = playerTeamBatchSchema.safeParse({ create });
    expect(result.success).toBe(false);
  });

  it('rejects total award batch ops > 50 even if each array <= 50', () => {
    const create = Array.from({ length: 30 }, (_, i) => ({
      seasonId: UUID_1,
      playerId: UUID_2,
      category: `cat-${i}`,
    }));

    const update = Array.from({ length: 30 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      data: { notes: 'x' },
    }));

    const result = awardBatchSchema.safeParse({ create, update });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Total batch operations'))).toBe(true);
    }
  });

  it('rejects oversized match-award batches', () => {
    const create = Array.from({ length: 51 }, (_, i) => ({
      matchId: UUID_1,
      playerId: UUID_2,
      category: `cat-${i}`,
    }));

    const result = matchAwardBatchSchema.safeParse({ create });
    expect(result.success).toBe(false);
  });

  it('rejects oversized player batches', () => {
    const create = Array.from({ length: 51 }, (_, i) => ({
      name: `Player ${i}`,
    }));

    const result = playerBatchSchema.safeParse({ create });
    expect(result.success).toBe(false);
  });

  it('rejects invalid formation-change payloads', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      position: { x: 50, y: 50 },
    }));

    const result = matchFormationChangeSchema.safeParse({
      startMin: 0,
      formation: { players },
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate players in formation-change payload', () => {
    const result = matchFormationChangeSchema.safeParse({
      startMin: 0,
      formation: {
        players: [
          { id: UUID_1, position: { x: 10, y: 10 } },
          { id: UUID_1, position: { x: 20, y: 20 } },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate'))).toBe(true);
    }
  });
});

describe('QuotaService (unit)', () => {
  it('returns plan limits and features', () => {
    const prisma = {} as any;
    const qs = new QuotaService(prisma);

    expect(qs.getLimits('free')).toMatchObject({
      ownedTeams: 1,
      playersPerOwnedTeam: 20,
      seasons: 5,
      matchesPerSeason: 30,
      eventsPerMatch: 40,
      formationChangesPerMatch: 5,
      activeShareLinks: 1,
    });
    expect(qs.getLimits('premium')).toMatchObject({
      ownedTeams: 5,
      playersPerOwnedTeam: 40,
      seasons: null,
      matchesPerSeason: null,
      eventsPerMatch: 150,
      formationChangesPerMatch: 20,
      activeShareLinks: null,
    });

    expect(qs.getAllowedEventKinds('free')).toEqual([
      'goal',
      'own_goal',
      'penalty',
      'foul',
      'free_kick',
      'ball_out',
    ]);
    expect(qs.getAllowedEventKinds('premium')).toContain('assist');

    expect(qs.getFeatures('free')).toEqual({ analyticsDashboard: false, csvExport: false });
    expect(qs.getFeatures('premium')).toEqual({ analyticsDashboard: true, csvExport: true });
  });

  it('enforces free owned-teams cap', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ subscription_tier: 'free' }) },
      team: { count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) },
    } as any;

    const qs = new QuotaService(prisma);

    try {
      await qs.assertCanCreateTeam({ userId: UUID_1, userRole: 'USER', isOpponent: false });
      throw new Error('expected quota error');
    } catch (err: any) {
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('QUOTA_EXCEEDED');
      expect(err.details).toMatchObject({
        entity: 'ownedTeams',
        limit: 1,
        current: 1,
        planType: 'free',
      });
    }
  });

  it('blocks premium-only event kinds on free plan', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ subscription_tier: 'free' }) },
      event: { count: vi.fn().mockResolvedValueOnce(0) },
    } as any;

    const qs = new QuotaService(prisma);

    try {
      await qs.assertCanCreateEvent({
        userId: UUID_1,
        userRole: 'USER',
        matchId: UUID_2,
        kind: 'assist',
      });
      throw new Error('expected feature locked error');
    } catch (err: any) {
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('FEATURE_LOCKED');
      expect(err.details).toMatchObject({
        entity: 'eventKind',
        kind: 'assist',
        planType: 'free',
      });
    }
  });

  it('enforces free non-scoring events-per-match cap', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ subscription_tier: 'free' }) },
      event: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(40) },
    } as any;

    const qs = new QuotaService(prisma);

    try {
      await qs.assertCanCreateEvent({
        userId: UUID_1,
        userRole: 'USER',
        matchId: UUID_2,
        kind: 'foul',
      });
      throw new Error('expected quota error');
    } catch (err: any) {
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('QUOTA_EXCEEDED');
      expect(err.details).toMatchObject({
        entity: 'eventsPerMatch',
        limit: 40,
        current: 40,
        planType: 'free',
      });
    }
  });

  it('enforces formation-changes-per-match cap when creating formation_change events', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ subscription_tier: 'premium' }) },
      event: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(20) },
    } as any;

    const qs = new QuotaService(prisma);

    try {
      await qs.assertCanCreateEvent({
        userId: UUID_1,
        userRole: 'USER',
        matchId: UUID_2,
        kind: 'formation_change',
      });
      throw new Error('expected quota error');
    } catch (err: any) {
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('QUOTA_EXCEEDED');
      expect(err.details).toMatchObject({
        entity: 'formationChangesPerMatch',
        limit: 20,
        current: 20,
        planType: 'premium',
      });
    }
  });

  it('enforces free formation-changes-per-match cap', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ subscription_tier: 'free' }) },
      event: { count: vi.fn().mockResolvedValue(5) },
    } as any;

    const qs = new QuotaService(prisma);

    try {
      await qs.assertCanApplyFormationChange({
        userId: UUID_1,
        userRole: 'USER',
        matchId: UUID_3,
      });
      throw new Error('expected quota error');
    } catch (err: any) {
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('QUOTA_EXCEEDED');
      expect(err.details).toMatchObject({
        entity: 'formationChangesPerMatch',
        limit: 5,
        current: 5,
        planType: 'free',
      });
    }
  });
});
