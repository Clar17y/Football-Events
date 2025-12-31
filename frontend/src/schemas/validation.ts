/**
 * Runtime validation schemas using Zod
 * 
 * This file contains validation schemas for all data structures
 * to ensure type safety at runtime and provide user-friendly
 * error messages.
 */

import { z } from 'zod';

/**
 * Common validation schemas
 */
export const IdSchema = z.string().min(1, 'ID cannot be empty');
export const TimestampSchema = z.number().int().positive('Timestamp must be a positive integer');
export const OptionalStringSchema = z.string().optional();
export const OptionalNumberSchema = z.number().optional();

/**
 * Player position validation
 */
export const PlayerPositionSchema = z.enum([
  'goalkeeper',
  'defender',
  'midfielder',
  'forward',
  'substitute'
]);

/**
 * Player validation schema
 */
export const PlayerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'Player name is required').max(100, 'Player name too long'),
  squadNumber: z.number().int().min(1).max(99).optional(),
  preferredPosition: z.string().optional(),
  isActive: z.boolean(),
  currentTeam: IdSchema.optional(),
  createdAt: z.string(),
});

/**
 * Team validation schema
 */
export const TeamSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'Team name is required').max(50, 'Team name too long'),
  homeKitPrimary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  homeKitSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  awayKitPrimary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  awayKitSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  logoUrl: z.string().url().optional(),
  isOpponent: z.boolean(),
  createdAt: z.string(),
});

/**
 * Event kind validation
 */
export const EventKindSchema = z.enum([
  'goal',
  'assist',
  'key_pass',
  'save',
  'interception',
  'tackle',
  'foul',
  'penalty',
  'free_kick',
  'ball_out',
  'own_goal',
  'formation_change',
  'corner'
]);

/**
 * Sentiment validation (must be between -4 and 4)
 */
export const SentimentSchema = z.number().int().min(-4, 'Sentiment must be at least -4').max(4, 'Sentiment must be at most 4');

/**
 * Coordinates validation
 */
export const CoordinatesSchema = z.object({
  x: z.number().min(0, 'X coordinate must be at least 0').max(100, 'X coordinate must be at most 100'),
  y: z.number().min(0, 'Y coordinate must be at least 0').max(100, 'Y coordinate must be at most 100'),
});

/**
 * Event payload validation schema
 */
export const EventPayloadSchema = z.object({
  kind: EventKindSchema,
  matchId: IdSchema,
  seasonId: IdSchema,
  teamId: IdSchema,
  playerId: IdSchema,
  periodNumber: z.number().int().positive('Period number must be positive'),
  clockMs: z.number().int().min(0, 'Clock time cannot be negative'),
  sentiment: SentimentSchema,
  notes: z.string().max(500, 'Notes too long (max 500 characters)').optional(),
  createdAt: z.string(),
  coordinates: CoordinatesSchema.optional(),
});

/**
 * Match event validation schema
 */
export const MatchEventSchema = EventPayloadSchema.extend({
  id: IdSchema,
  createdByUserId: z.string(),
  isDeleted: z.boolean(),
  updatedAt: z.string().optional(),
});

/**
 * Match status validation
 */
export const MatchStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'HALF_TIME',
  'EXTRA_TIME',
  'PENALTY_SHOOTOUT',
  'COMPLETED',
  'ABANDONED',
  'POSTPONED'
]);

/**
 * Match settings validation schema
 */
export const MatchSettingsSchema = z.object({
  periodDuration: z.number().int().min(1, 'Period duration must be at least 1 minute').max(120, 'Period duration too long'),
  totalPeriods: z.number().int().min(1, 'Must have at least 1 period').max(4, 'Too many periods'),
  halfTimeDuration: z.number().int().min(0, 'Half-time duration cannot be negative').max(30, 'Half-time too long'),
  allowExtraTime: z.boolean(),
  extraTimeDuration: z.number().int().min(0).max(30),
  allowPenaltyShootout: z.boolean(),
  maxSubstitutions: z.number().int().min(0, 'Cannot have negative substitutions').max(11, 'Too many substitutions'),
  trackInjuryTime: z.boolean(),
});

/**
 * Match clock validation schema
 */
export const MatchClockSchema = z.object({
  running: z.boolean(),
  startTs: z.number().nullable(),
  offsetMs: z.number().int().min(0, 'Offset cannot be negative'),
  currentPeriod: z.number().int().positive('Current period must be positive'),
  periodStarts: z.record(z.string(), z.number()),
});

/**
 * Match result validation schema
 */
export const MatchResultSchema = z.object({
  homeScore: z.number().int().min(0, 'Score cannot be negative'),
  awayScore: z.number().int().min(0, 'Score cannot be negative'),
  wentToExtraTime: z.boolean(),
  wentToPenaltyShootout: z.boolean(),
  penaltyResult: z.object({
    homePenalties: z.number().int().min(0),
    awayPenalties: z.number().int().min(0),
    sequence: z.array(z.object({
      teamId: IdSchema,
      playerId: IdSchema,
      scored: z.boolean(),
      order: z.number().int().positive(),
    })),
  }).optional(),
  winner: z.enum(['home', 'away']).optional(),
  finalStatus: MatchStatusSchema,
});

/**
 * Complete match validation schema
 */
export const MatchSchema = z.object({
  id: IdSchema,
  seasonId: IdSchema,
  homeTeam: TeamSchema,
  awayTeam: TeamSchema,
  kickoffTime: z.string(),
  status: MatchStatusSchema,
  settings: MatchSettingsSchema,
  currentPeriod: z.number().int().positive(),
  clock: MatchClockSchema,
  result: MatchResultSchema.optional(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  createdAt: z.string(),
  createdByUserId: z.string(),
  isDeleted: z.boolean(),
  metadata: z.object({
    venue: OptionalStringSchema,
    weather: OptionalStringSchema,
    referee: OptionalStringSchema,
    competition: OptionalStringSchema,
    matchType: z.enum(['league', 'cup', 'friendly', 'playoff']).optional(),
    notes: OptionalStringSchema,
  }).optional(),
});

/**
 * Validation helper functions
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate data against a schema and return typed result
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => {
        const path = err.path.join('.');
        const contextStr = context ? `${context}.` : '';
        return `${contextStr}${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: [`Validation failed: ${error}`] };
  }
}

/**
 * Validate and throw on error (for use in functions that should fail fast)
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = validateData(schema, data, context);
  if (!result.success) {
    // Type assertion to help TypeScript understand the discriminated union
    const failureResult = result as { success: false; errors: string[] };
    throw new ValidationError(
      failureResult.errors.join(', '),
      context || 'unknown',
      data
    );
  }
  return result.data;
}

/**
 * Partial validation for updates (makes all fields optional)
 */
export function createUpdateSchema<T extends z.ZodRawShape>(
  baseSchema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  return baseSchema.partial();
}

/**
 * Common validation schemas for forms
 */
export const FormValidation = {
  playerName: z.string().min(1, 'Player name is required').max(100, 'Name too long'),
  teamName: z.string().min(1, 'Team name is required').max(50, 'Name too long'),
  jerseyNumber: z.number().int().min(1, 'Jersey number must be at least 1').max(99, 'Jersey number must be at most 99'),
  notes: z.string().max(500, 'Notes too long (max 500 characters)'),
  sentiment: SentimentSchema,
  eventKind: EventKindSchema,
} as const;