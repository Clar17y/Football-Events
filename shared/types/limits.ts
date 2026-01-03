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

// Premium-only event kinds (require paid plan)
export const PREMIUM_EVENT_KINDS = [
  'key_pass',
  'save',
  'interception',
  'tackle',
  'formation_change',
  'corner',
  'offside',
  'shot_on_target',
  'shot_off_target',
  'clearance',
  'block',
  'cross',
  'header',
  'ball_out',
] as const;

export type PremiumEventKind = (typeof PREMIUM_EVENT_KINDS)[number];

// All event kinds (core + premium)
export const ALL_EVENT_KINDS = [...CORE_EVENT_KINDS, ...PREMIUM_EVENT_KINDS] as const;

export type AllEventKind = (typeof ALL_EVENT_KINDS)[number];

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

