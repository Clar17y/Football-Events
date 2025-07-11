import { z } from 'zod';

// Team validation schemas
export const teamCreateSchema = z.object({
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be less than 100 characters')
    .trim(),
  homePrimary: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Home primary color must be a valid hex color')
    .optional(),
  homeSecondary: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Home secondary color must be a valid hex color')
    .optional(),
  awayPrimary: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Away primary color must be a valid hex color')
    .optional(),
  awaySecondary: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Away secondary color must be a valid hex color')
    .optional(),
  logoUrl: z.string()
    .url('Logo URL must be a valid URL')
    .optional()
});

export const teamUpdateSchema = teamCreateSchema.partial();

// Player validation schemas
export const playerCreateSchema = z.object({
  name: z.string()
    .min(1, 'Player name is required')
    .max(100, 'Player name must be less than 100 characters')
    .trim(),
  squadNumber: z.number()
    .int('Squad number must be an integer')
    .min(1, 'Squad number must be at least 1')
    .max(99, 'Squad number must be less than 100')
    .optional(),
  preferredPosition: z.string()
    .max(10, 'Position code must be less than 10 characters')
    .optional(),
  dateOfBirth: z.string()
    .datetime('Date of birth must be a valid ISO date')
    .optional(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional(),
  currentTeam: z.string()
    .uuid('Current team must be a valid UUID')
    .optional()
});

export const playerUpdateSchema = playerCreateSchema.partial();

// Season validation schemas
export const seasonCreateSchema = z.object({
  label: z.string()
    .min(1, 'Season label is required')
    .max(50, 'Season label must be less than 50 characters')
    .trim()
});

export const seasonUpdateSchema = seasonCreateSchema.partial();

// Position validation schemas
export const positionCreateSchema = z.object({
  code: z.string()
    .min(1, 'Position code is required')
    .max(10, 'Position code must be less than 10 characters')
    .trim()
    .toUpperCase(),
  longName: z.string()
    .min(1, 'Position name is required')
    .max(50, 'Position name must be less than 50 characters')
    .trim()
});

export const positionUpdateSchema = z.object({
  code: z.string()
    .min(1, 'Position code is required')
    .max(10, 'Position code must be less than 10 characters')
    .trim()
    .toUpperCase()
    .optional(),
  longName: z.string()
    .min(1, 'Position name is required')
    .max(50, 'Position name must be less than 50 characters')
    .trim()
    .optional()
});

// Match validation schemas
export const matchCreateSchema = z.object({
  seasonId: z.string().uuid('Season ID must be a valid UUID'),
  kickoffTime: z.string().datetime('Kickoff time must be a valid ISO date'),
  homeTeamId: z.string().uuid('Home team ID must be a valid UUID'),
  awayTeamId: z.string().uuid('Away team ID must be a valid UUID'),
  competition: z.string().max(100).optional(),
  venue: z.string().max(100).optional(),
  durationMinutes: z.number().int().min(1).max(200).optional(),
  periodFormat: z.enum(['quarter', 'half', 'third']).optional(),
  ourScore: z.number().int().min(0).optional(),
  opponentScore: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional()
});

export const matchUpdateSchema = z.object({
  seasonId: z.string().uuid().optional(),
  kickoffTime: z.string().datetime().optional(),
  homeTeamId: z.string().uuid().optional(),
  awayTeamId: z.string().uuid().optional(),
  competition: z.string().max(100).optional(),
  venue: z.string().max(100).optional(),
  durationMinutes: z.number().int().min(1).max(200).optional(),
  periodFormat: z.enum(['quarter', 'half', 'third']).optional(),
  ourScore: z.number().int().min(0).optional(),
  opponentScore: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional()
});

// Event validation schemas
export const eventCreateSchema = z.object({
  matchId: z.string()
    .uuid('Match ID must be a valid UUID'),
  seasonId: z.string()
    .uuid('Season ID must be a valid UUID'),
  kind: z.enum([
    'goal', 'assist', 'key_pass', 'save', 'interception', 
    'tackle', 'foul', 'penalty', 'free_kick', 'ball_out', 'own_goal'
  ]),
  teamId: z.string()
    .uuid('Team ID must be a valid UUID')
    .optional(),
  playerId: z.string()
    .uuid('Player ID must be a valid UUID')
    .optional(),
  periodNumber: z.number()
    .int('Period number must be an integer')
    .min(1, 'Period number must be at least 1')
    .max(4, 'Period number must be at most 4')
    .optional(),
  clockMs: z.number()
    .int('Clock time must be an integer')
    .min(0, 'Clock time cannot be negative')
    .optional(),
  notes: z.string()
    .max(500, 'Notes must be less than 500 characters')
    .optional(),
  sentiment: z.number()
    .int('Sentiment must be an integer')
    .min(-2, 'Sentiment must be between -2 and 2')
    .max(2, 'Sentiment must be between -2 and 2')
    .optional()
});

export const eventUpdateSchema = z.object({
  kind: z.enum([
    'goal', 'assist', 'key_pass', 'save', 'interception', 
    'tackle', 'foul', 'penalty', 'free_kick', 'ball_out', 'own_goal'
  ]).optional(),
  teamId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  periodNumber: z.number().int().min(1).max(4).optional(),
  clockMs: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
  sentiment: z.number().int().min(-2).max(2).optional()
});

// Pagination and query schemas
export const paginationSchema = z.object({
  page: z.string()
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0, 'Page must be greater than 0')
    .optional()
    .default('1'),
  limit: z.string()
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional()
    .default('25'),
  search: z.string()
    .max(100, 'Search term must be less than 100 characters')
    .optional()
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('ID must be a valid UUID')
});

// Award validation schemas
export const awardCreateSchema = z.object({
  seasonId: z.string().uuid('Season ID must be a valid UUID'),
  playerId: z.string().uuid('Player ID must be a valid UUID'),
  category: z.string()
    .min(1, 'Award category is required')
    .max(100, 'Award category must be less than 100 characters')
    .trim(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional()
});

export const awardUpdateSchema = awardCreateSchema.partial();

// Match Award validation schemas
export const matchAwardCreateSchema = z.object({
  matchId: z.string().uuid('Match ID must be a valid UUID'),
  playerId: z.string().uuid('Player ID must be a valid UUID'),
  category: z.string()
    .min(1, 'Award category is required')
    .max(100, 'Award category must be less than 100 characters')
    .trim(),
  notes: z.string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional()
});

export const matchAwardUpdateSchema = matchAwardCreateSchema.partial();

// Lineup validation schemas
export const lineupCreateSchema = z.object({
  matchId: z.string().uuid('Match ID must be a valid UUID'),
  playerId: z.string().uuid('Player ID must be a valid UUID'),
  startMinute: z.number()
    .min(0, 'Start minute cannot be negative')
    .max(300, 'Start minute must be reasonable'),
  endMinute: z.number()
    .min(0, 'End minute cannot be negative')
    .max(300, 'End minute must be reasonable')
    .optional(),
  position: z.string()
    .min(1, 'Position is required')
    .max(10, 'Position code must be less than 10 characters')
    .trim()
});

export const lineupUpdateSchema = z.object({
  endMinute: z.number().min(0).max(300).optional(),
  position: z.string().min(1).max(10).trim().optional()
});

// Batch operation schemas
export const eventBatchSchema = z.object({
  create: z.array(eventCreateSchema).optional().default([]),
  update: z.array(z.object({
    id: z.string().uuid('Event ID must be a valid UUID'),
    data: eventUpdateSchema
  })).optional().default([]),
  delete: z.array(z.string().uuid('Event ID must be a valid UUID')).optional().default([])
});

export const lineupBatchSchema = z.object({
  create: z.array(lineupCreateSchema).optional().default([]),
  update: z.array(z.object({
    matchId: z.string().uuid('Match ID must be a valid UUID'),
    playerId: z.string().uuid('Player ID must be a valid UUID'),
    startMinute: z.number().min(0).max(300),
    data: lineupUpdateSchema
  })).optional().default([]),
  delete: z.array(z.object({
    matchId: z.string().uuid('Match ID must be a valid UUID'),
    playerId: z.string().uuid('Player ID must be a valid UUID'),
    startMinute: z.number().min(0).max(300)
  })).optional().default([])
});