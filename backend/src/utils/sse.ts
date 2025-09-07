import type { Response } from 'express';
import { PrismaClient } from '@prisma/client';

type Subscriber = Response;

const subscribers: Map<string, Set<Subscriber>> = new Map();
const prisma = new PrismaClient();

export function subscribe(matchId: string, res: Response) {
  if (!subscribers.has(matchId)) subscribers.set(matchId, new Set());
  subscribers.get(matchId)!.add(res);
}

export function unsubscribe(matchId: string, res: Response) {
  const set = subscribers.get(matchId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribers.delete(matchId);
}

export function send(res: Response, type: string, data: any, id?: string | number) {
  if (id != null) res.write(`id: ${id}\n`);
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function broadcast(matchId: string, type: string, data: any) {
  const set = subscribers.get(matchId);
  if (!set) return;
  const nowId = Date.now();
  for (const res of set) {
    try {
      send(res, type, data, nowId);
    } catch (e) {
      try { res.end(); } catch {}
      set.delete(res);
    }
  }
}

export async function buildSnapshot(matchId: string) {
  // Basic match summary
  const match = await prisma.match.findFirst({
    where: { match_id: matchId, is_deleted: false },
    select: {
      match_id: true,
      kickoff_ts: true,
      period_format: true,
      duration_mins: true,
      competition: true,
      venue: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    }
  });

  const state = await prisma.match_state.findFirst({
    where: { match_id: matchId, is_deleted: false },
  });

  const periods = await prisma.match_periods.findMany({
    where: { match_id: matchId, is_deleted: false },
    orderBy: [{ started_at: 'asc' }, { period_number: 'asc' }],
    select: {
      id: true,
      period_number: true,
      period_type: true,
      started_at: true,
      ended_at: true,
      duration_seconds: true,
    }
  });

  const events = await prisma.event.findMany({
    where: { match_id: matchId, is_deleted: false },
    orderBy: [{ clock_ms: 'asc' }, { created_at: 'asc' }],
    take: 200,
    select: {
      id: true,
      kind: true,
      team_id: true,
      player_id: true,
      period_number: true,
      clock_ms: true,
      sentiment: true,
      notes: true,
      created_at: true,
    }
  });

  // Build player name map
  const uniquePlayerIds = Array.from(new Set(events.map(e => e.player_id).filter(Boolean))) as string[];
  const players = uniquePlayerIds.length > 0 ? await prisma.player.findMany({
    where: { id: { in: uniquePlayerIds } },
    select: { id: true, name: true }
  }) : [];
  const playerNameMap = new Map(players.map(p => [p.id, p.name]));

  const homeId = match?.homeTeam?.id;
  const awayId = match?.awayTeam?.id;
  const score = deriveScore(events, homeId, awayId);

  const summary = {
    matchId,
    status: state?.status || 'SCHEDULED',
    currentPeriod: state?.current_period ?? null,
    currentPeriodType: state?.current_period_type ?? null,
    totalElapsedSeconds: state?.total_elapsed_seconds ?? 0,
    score,
    homeTeam: match?.homeTeam || null,
    awayTeam: match?.awayTeam || null,
    kickoffTime: match?.kickoff_ts ? new Date(match.kickoff_ts).toISOString() : null,
    competition: match?.competition || null,
    venue: match?.venue || null,
    periodFormat: match?.period_format || null,
    durationMinutes: match?.duration_mins ?? null,
  };

  return {
    summary,
    periods: periods.map(p => ({
      id: p.id,
      periodNumber: p.period_number,
      periodType: p.period_type,
      startedAt: p.started_at?.toISOString?.() || null,
      endedAt: p.ended_at?.toISOString?.() || null,
      durationSeconds: p.duration_seconds ?? null,
    })),
    events: events.map(e => {
      // infer periodType from timestamps
      let periodType: string | undefined = undefined;
      const t = e.created_at ? e.created_at.getTime() : undefined;
      if (t != null) {
        for (const p of periods) {
          const start = p.started_at ? p.started_at.getTime() : undefined;
          const end = p.ended_at ? p.ended_at.getTime() : undefined;
          if (start != null && t >= start && (end == null || t <= end)) {
            periodType = p.period_type;
            break;
          }
        }
      }
      return ({
        id: e.id,
        kind: e.kind,
        teamId: e.team_id,
        playerId: e.player_id,
        teamName: e.team_id ? (e.team_id === homeId ? match?.homeTeam?.name : e.team_id === awayId ? match?.awayTeam?.name : undefined) : undefined,
        playerName: e.player_id ? (playerNameMap.get(e.player_id) || undefined) : undefined,
        periodNumber: e.period_number,
        periodType,
        clockMs: e.clock_ms ?? 0,
        sentiment: e.sentiment ?? 0,
        notes: e.notes || null,
        createdAt: e.created_at?.toISOString?.() || null,
      });
    })
  };
}

function deriveScore(events: Array<{ kind: string; team_id: string | null }>, homeId?: string, awayId?: string) {
  let home = 0, away = 0;
  for (const e of events) {
    if (e.kind === 'goal') {
      if (e.team_id && homeId && e.team_id === homeId) home++;
      else if (e.team_id && awayId && e.team_id === awayId) away++;
    }
    if (e.kind === 'own_goal') {
      if (e.team_id && homeId && e.team_id === homeId) away++;
      else if (e.team_id && awayId && e.team_id === awayId) home++;
    }
  }
  return { home, away };
}

// Heartbeat every 20s to keep connections alive and detect dead clients
setInterval(() => {
  const ts = new Date().toISOString();
  for (const [matchId, set] of subscribers.entries()) {
    for (const res of set) {
      try {
        send(res, 'heartbeat', { ts });
      } catch (e) {
        try { res.end(); } catch {}
        set.delete(res);
      }
    }
    if (set.size === 0) subscribers.delete(matchId);
  }
}, 20000).unref?.();

export const sseHub = { subscribe, unsubscribe, send, broadcast, buildSnapshot };
