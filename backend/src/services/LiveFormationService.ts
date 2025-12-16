import { PrismaClient, Prisma } from '@prisma/client';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { LineupService } from './LineupService';
import { PositionCalculatorService } from './PositionCalculatorService';

export type FormationData = {
  players: Array<{
    id: string;
    name: string;
    squadNumber?: number | null;
    preferredPosition?: string | null;
    position: { x: number; y: number };
  }>;
};

export class LiveFormationService {
  private prisma: PrismaClient;
  private lineupService: LineupService;
  private positionCalc: PositionCalculatorService;

  constructor() {
    this.prisma = new PrismaClient();
    this.lineupService = new LineupService();
    this.positionCalc = new PositionCalculatorService();
  }

  async getCurrentFormation(matchId: string, userId: string, userRole: string): Promise<FormationData | null> {
    // Authorization via match ownership
    const matchWhere: any = { match_id: matchId, is_deleted: false };
    if (userRole !== 'ADMIN') matchWhere.created_by_user_id = userId;
    const match = await this.prisma.match.findFirst({ where: matchWhere });
    if (!match) return null;

    // Prefer live_formations active snapshot
    const active = await this.prisma.live_formations.findFirst({
      where: { match_id: matchId, end_min: null },
      orderBy: [{ start_min: 'desc' }]
    });
    if (active) {
      // Trust stored snapshot
      const data = (active.formation_data || {}) as FormationData;
      if (data && Array.isArray((data as any).players)) return data;
    }

    // Fallback: derive from current lineup at time now (assume 0 if no state)
    const nowMinutes = 0;
    const current = await this.lineupService.getCurrentLineup(matchId, nowMinutes, userId, userRole);
    if (!current || current.length === 0) return { players: [] };
    const players = current.map(lu => ({
      id: lu.player.id,
      name: lu.player.name,
      squadNumber: lu.player.squadNumber,
      preferredPosition: lu.player.preferredPosition || undefined,
      position: {
        x: (lu as any).pitchX ?? 0,
        y: (lu as any).pitchY ?? 0,
      }
    }));
    return { players };
  }

  async applyFormationChange(params: {
    matchId: string;
    startMin: number; // current minute
    formation: FormationData;
    /** Optional client-generated UUID for local-first idempotency */
    eventId?: string;
    userId: string;
    userRole: string;
    reason?: string | null;
  }): Promise<{
    liveFormationId: string;
    substitutions: Array<{ out?: { id: string; name?: string | null }; in?: { id: string; name?: string | null } }>;
  }> {
    return withPrismaErrorHandling(async () => {
      console.log('[LiveFormationService] applyFormationChange:start', params.matchId, params.startMin, params.reason);
      const { matchId, startMin, formation, eventId, userId, userRole, reason } = params;

      // Authorization via match ownership
      const matchWhere: any = { match_id: matchId, is_deleted: false };
      if (userRole !== 'ADMIN') matchWhere.created_by_user_id = userId;
      const match = await this.prisma.match.findFirst({ where: matchWhere });
      if (!match) {
        const error = new Error('Match not found or access denied');
        (error as any).code = 'MATCH_ACCESS_DENIED';
        (error as any).statusCode = 403;
        throw error;
      }

      // Idempotency for local-first sync retries: if we've already persisted the formation_change event,
      // treat this call as a success and avoid applying the formation twice.
      if (eventId) {
        try {
          const existing = await this.prisma.event.findUnique({ where: { id: eventId } });
          if (existing && !existing.is_deleted) {
            if (existing.match_id !== matchId || existing.kind !== ('formation_change' as any)) {
              const error = new Error('eventId already exists for a different event') as any;
              error.statusCode = 409;
              throw error;
            }
            const active = await this.prisma.live_formations.findFirst({
              where: { match_id: matchId, end_min: null },
              orderBy: [{ start_min: 'desc' }]
            });
            return { liveFormationId: active?.id || '', substitutions: [] };
          }
        } catch {
          // ignore lookup errors; proceed to apply change
        }
      }

      // Capture current active lineup players to compute substitutions
      const currentActive = await this.prisma.lineup.findMany({
        where: { match_id: matchId, is_deleted: false, end_min: null },
        include: { players: { select: { id: true, name: true } } }
      });
      const currentSet = new Set(currentActive.map(l => l.player_id));
      const nextSet = new Set(formation.players.map(p => p.id));
      const outs = [...currentSet].filter(id => !nextSet.has(id));
      const ins = [...nextSet].filter(id => !currentSet.has(id));

      // Prepare substitutions summary (best-effort pairing) upfront
      const subs: Array<{ out?: { id: string; name?: string | null }; in?: { id: string; name?: string | null } }> = [];
      const outPlayers = outs.map(id => ({ id, name: currentActive.find(l => l.player_id === id)?.players.name || null }));
      const inPlayers = ins.map(id => ({ id, name: formation.players.find(p => p.id === id)?.name || null }));
      const maxPairs = Math.max(outPlayers.length, inPlayers.length);
      for (let i = 0; i < maxPairs; i++) {
        subs.push({ out: outPlayers[i], in: inPlayers[i] });
      }

      // Transaction: end active snapshot and lineups, create new snapshot and lineups
      let result: any;
      try {
        result = await this.prisma.$transaction(async (tx) => {
        // Capture current active formation snapshot (if any) for timeline
        const activeBefore = await tx.live_formations.findFirst({
          where: { match_id: matchId, end_min: null },
          orderBy: [{ start_min: 'desc' }]
        });
        // Resolve a unique start minute (avoid UNIQUE(match_id,start_min) collisions)
        let start = new Prisma.Decimal(startMin as any);
        const existsAtMinute = async (s: Prisma.Decimal) => {
          const found = await tx.live_formations.findFirst({ where: { match_id: matchId, start_min: s } });
          return !!found;
        };
        let guard = 0;
        while (await existsAtMinute(start) && guard < 100) {
          // Add 0.01 minute (~0.6s) until free (DECIMAL(5,2) precision)
          start = new Prisma.Decimal((Number(start) + 0.01).toFixed(2));
          guard++;
        }
        // End current live formation if exists
        const existing = await tx.live_formations.findFirst({
          where: { match_id: matchId, end_min: null },
          orderBy: [{ start_min: 'desc' }]
        });
        if (existing) {
          await tx.live_formations.update({
            where: { id: existing.id },
            data: { end_min: start, substitution_reason: reason || existing.substitution_reason || undefined }
          });
        }

        // Create new live formation
        const created = await tx.live_formations.create({
          data: {
            match_id: matchId,
            start_min: start as any,
            formation_data: formation as any,
            substitution_reason: reason || null,
            created_by_user_id: userId
          }
        });

        // End current lineup rows
        await tx.lineup.updateMany({
          where: { match_id: matchId, end_min: null, is_deleted: false },
          data: { end_min: Number(start), updated_at: new Date(), substitution_reason: reason || undefined }
        });

        // Create new lineup rows from formation
        // Also gather line-group counts to build formation label
        let def = 0, dm = 0, cm = 0, am = 0, fwd = 0, gk = 0;
        for (const p of formation.players) {
          // Compute position code from pitch coordinates
          const calc = await this.positionCalc.calculatePosition(p.position.x, p.position.y);
          const posCode = calc?.position || 'SUB';
          const code = String(posCode).toUpperCase();
          if (code === 'GK') gk++; else if (['CB','LCB','RCB','SW','LB','RB','LWB','RWB','WB','FB'].includes(code)) def++;
          else if (['CDM','LDM','RDM','DM'].includes(code)) dm++;
          else if (['CM','LCM','RCM','LM','RM','WM'].includes(code)) cm++;
          else if (['CAM','LAM','RAM','AM'].includes(code)) am++;
          else fwd++;
          await tx.lineup.create({
            data: {
              match_id: matchId,
              player_id: p.id,
              start_min: Number(start),
              end_min: null,
              position: posCode as any,
              pitch_x: new Prisma.Decimal(p.position.x as any) as any,
              pitch_y: new Prisma.Decimal(p.position.y as any) as any,
              substitution_reason: reason || null,
              created_by_user_id: userId
            }
          });
        }

        const toLabel = (() => {
          // Ignore GK in outfield label
          const hasAM = am > 0;
          if (hasAM) {
            const vec = [def, dm + cm, am, fwd].filter(n => n > 0);
            return vec.join('-');
          } else {
            const vec = [def, dm + cm + am, fwd].filter(n => n > 0);
            return vec.join('-');
          }
        })();

        // Persist a formation_change event for timeline persistence
        try {
          const activePeriod = await tx.match_periods.findFirst({
            where: { match_id: matchId, started_at: { not: null }, ended_at: null, is_deleted: false },
            select: { period_number: true, period_type: true }
          });
          // Build previous label from previous snapshot (if any)
          const fromLabel = await (async () => {
            if (!activeBefore?.formation_data || !Array.isArray((activeBefore as any).formation_data?.players)) return null;
            let d=0,m=0,c=0,a=0,f=0,g=0;
            const prevPlayers = ((activeBefore as any).formation_data.players as any[]);
            for (const pl of prevPlayers) {
              try {
                const calcPrev = await this.positionCalc.calculatePosition(Number(pl.position?.x || 0), Number(pl.position?.y || 0));
                const code = String(calcPrev?.position || 'SUB').toUpperCase();
                if (code === 'GK') g++; else if (['CB','LCB','RCB','SW','LB','RB','LWB','RWB','WB','FB'].includes(code)) d++;
                else if (['CDM','LDM','RDM','DM'].includes(code)) m++;
                else if (['CM','LCM','RCM','LM','RM','WM'].includes(code)) c++;
                else if (['CAM','LAM','RAM','AM'].includes(code)) a++;
                else f++;
              } catch {}
            }
            const hasAM = a > 0;
            if (hasAM) return [d, m + c, a, f].filter(n => n > 0).join('-');
            return [d, m + c + a, f].filter(n => n > 0).join('-');
          })();

          // Persist richer details in notes as JSON for timeline rendering
          const notesPayload = {
            reason: reason || null,
            formationFrom: fromLabel,
            formationTo: toLabel,
            substitutions: subs.map(s => ({
              out: s.out ? { id: s.out.id, name: s.out.name || null } : null,
              in: s.in ? { id: s.in.id, name: s.in.name || null } : null,
            })),
            formation: { players: formation.players },
          };
          const event = await tx.event.create({
            data: {
              ...(eventId ? { id: eventId } : {}),
              match_id: matchId,
              kind: 'formation_change' as any,
              period_number: activePeriod?.period_number || null,
              clock_ms: Math.round(Number(start) * 60000),
              notes: JSON.stringify(notesPayload),
              created_by_user_id: userId,
            }
          });
          console.log('[LiveFormationService] formation_change event persisted', event.id);
          // Also broadcast via SSE like a normal event for coach/viewers listening to event_created
          try {
            const { sseHub } = await import('../utils/sse');
            sseHub.broadcast(matchId, 'event_created', { event: {
              id: event.id,
              kind: 'formation_change',
              teamId: null,
              teamName: undefined,
              playerId: null,
              playerName: undefined,
              periodType: activePeriod?.period_type,
              periodNumber: activePeriod?.period_number || null,
              clockMs: event.clock_ms || 0,
              sentiment: 0,
              notes: event.notes,
              createdAt: event.created_at,
            }});
          } catch {}
        } catch (e) {
          console.error('[LiveFormationService] formation_change event persist failed', e);
        }

        return { created, start, activeBefore };
      });
      } catch (error: any) {
        if (eventId && error?.code === 'P2002') {
          const active = await this.prisma.live_formations.findFirst({
            where: { match_id: matchId, end_min: null },
            orderBy: [{ start_min: 'desc' }]
          });
          return { liveFormationId: active?.id || '', substitutions: [] };
        }
        throw error;
      }

      // subs already prepared

      // Broadcast SSE timeline event for formation change
      try {
        const { sseHub } = await import('../utils/sse');
        // Determine current open period for context
        const period = await this.prisma.match_periods.findFirst({
          where: { match_id: matchId, is_deleted: false, ended_at: null },
          orderBy: [{ started_at: 'desc' }]
        });
        sseHub.broadcast(matchId, 'formation_changed', {
          matchId,
          createdAt: new Date().toISOString(),
          periodNumber: period?.period_number || null,
          periodType: period?.period_type || 'REGULAR',
          clockMs: Math.round(Number(result.start) * 60000),
          reason: reason || null,
          formation: formation,
          prevFormation: (result.activeBefore?.formation_data as any) || null,
          substitutions: subs,
        });
      } catch (e) {
        // non-fatal
      }

      console.log('[LiveFormationService] applyFormationChange:done', { id: result.created.id });
      return { liveFormationId: result.created.id, substitutions: subs };
    }, 'LiveFormationChange');
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.lineupService.disconnect();
    await this.positionCalc.disconnect();
  }
}
