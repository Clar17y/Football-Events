export type PlanType = 'free' | 'premium';

// Free/core event kinds (used for guest defaults and UX fallbacks).
export const CORE_EVENT_KINDS = [
  'goal',
  'own_goal',
  'penalty',
  'foul',
  'free_kick',
  'assist',
  'yellow_card',
  'red_card',
] as const;

export type CoreEventKind = (typeof CORE_EVENT_KINDS)[number];

export type MeLimits = {
  ownedTeams: number;
  playersPerOwnedTeam: number;
  seasons: number | null;
  matchesPerSeason: number | null;
  eventsPerMatch: number;
  formationChangesPerMatch: number;
  activeShareLinks: number | null;
};

export type MeLimitsUsage = {
  ownedTeams: number;
  opponentTeams: number;
  seasons: number;
  activeShareLinks: number;
  playersByTeam: Record<string, number>;
};

export type MeLimitsFeatures = {
  analyticsDashboard: boolean;
  csvExport: boolean;
};

export type MeLimitsResponse = {
  planType: PlanType;
  limits: MeLimits;
  allowedEventKinds: string[];
  features: MeLimitsFeatures;
  usage: MeLimitsUsage;
};

