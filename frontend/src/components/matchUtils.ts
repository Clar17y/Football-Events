import type { Match, Team } from '@shared/types';

export const isHomeMatch = (match: Match, primaryTeamId?: string): boolean => {
  if (match.homeTeam && !match.homeTeam.is_opponent) return true;
  if (match.awayTeam && !match.awayTeam.is_opponent) return false;
  if (primaryTeamId) return match.homeTeamId === primaryTeamId;
  return true;
};

export const getMatchColors = (match: Match, primaryTeamId?: string) => {
  const isHome = isHomeMatch(match, primaryTeamId);
  let ourTeam: Team | undefined;
  let opponentTeam: Team | undefined;

  if (match.homeTeam && !match.homeTeam.is_opponent) {
    ourTeam = match.homeTeam;
    opponentTeam = match.awayTeam;
  } else if (match.awayTeam && !match.awayTeam.is_opponent) {
    ourTeam = match.awayTeam;
    opponentTeam = match.homeTeam;
  } else {
    ourTeam = isHome ? match.homeTeam : match.awayTeam;
    opponentTeam = isHome ? match.awayTeam : match.homeTeam;
  }

  const opponentUsingDefaults = opponentTeam?.is_opponent && (
    !opponentTeam.homeKitPrimary ||
    !opponentTeam.awayKitPrimary ||
    opponentTeam.homeKitPrimary === '#2563eb' ||
    opponentTeam.awayKitPrimary === '#dc2626'
  );

  const ourTeamIsHome = ourTeam === match.homeTeam;

  return {
    ourTeamColor: ourTeamIsHome
      ? (ourTeam?.homeKitPrimary || '#2563eb')
      : (ourTeam?.awayKitPrimary || '#dc2626'),
    opponentTeamColor: ourTeamIsHome
      ? (opponentTeam?.awayKitPrimary || '#dc2626')
      : (opponentTeam?.homeKitPrimary || '#2563eb'),
    opponentUsingDefaults,
  };
};

export const formatMatchDateTime = (
  kickoffTime: Date,
  variant: 'upcoming' | 'completed'
) => {
  const date = new Date(kickoffTime);
  const today = new Date();
  const compare = new Date(today);
  if (variant === 'upcoming') compare.setDate(today.getDate() + 1);
  if (variant === 'completed') compare.setDate(today.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isAdjacent = date.toDateString() === compare.toDateString();

  let dateStr = '';
  if (isToday) {
    dateStr = 'Today';
  } else if (isAdjacent) {
    dateStr = variant === 'upcoming' ? 'Tomorrow' : 'Yesterday';
  } else {
    dateStr = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { dateStr, timeStr };
};

export const getMatchResult = (match: Match) => {
  const ourScore = match.ourScore || 0;
  const opponentScore = match.opponentScore || 0;
  if (ourScore > opponentScore) return { type: 'win' as const, color: 'success' as const };
  if (ourScore < opponentScore) return { type: 'loss' as const, color: 'danger' as const };
  return { type: 'draw' as const, color: 'warning' as const };
};

