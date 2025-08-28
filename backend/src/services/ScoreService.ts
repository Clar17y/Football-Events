import type { PrismaClient } from '@prisma/client';

export class ScoreService {
  /**
   * Recompute home/away score from events and persist to matches table.
   * Counts 'goal' as +1 for the scoring team and 'own_goal' as +1 for the opposite team.
   */
  static async recomputeAndPersistScore(prisma: PrismaClient, matchId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { match_id: matchId },
      select: { home_team_id: true, away_team_id: true }
    });
    if (!match) return;

    const events = await prisma.event.findMany({
      where: { match_id: matchId, is_deleted: false, kind: { in: ['goal', 'own_goal'] as any } },
      select: { kind: true, team_id: true }
    });

    let home = 0, away = 0;
    for (const e of events) {
      if (e.kind === 'goal') {
        if (e.team_id === match.home_team_id) home++;
        else if (e.team_id === match.away_team_id) away++;
      } else if (e.kind === 'own_goal') {
        if (e.team_id === match.home_team_id) away++;
        else if (e.team_id === match.away_team_id) home++;
      }
    }

    await prisma.match.update({
      where: { match_id: matchId },
      data: { home_score: home, away_score: away, updated_at: new Date() }
    });
  }
}

